/**
 * Model layer.
 *
 * Two roles, deliberately split (see docs/lovesims-v2.md §7 "Stack"):
 *   - `voice`  , generates an agent's turn. Fidelity matters most; long context
 *                 so a whole interview transcript can sit in the prompt.
 *   - `analyst`, appraisal and mechanical extraction. High volume, cheap, fast.
 *
 * Everything goes through structured outputs (`output_config.format`); there is
 * no regex JSON fallback anywhere in this codebase.
 */

import Anthropic from '@anthropic-ai/sdk';

export type Role = 'voice' | 'analyst';

interface ModelProfile {
  model: string;
  /** Models in the 4.6+ family take output_config.effort; Haiku 4.5 rejects it. */
  supportsEffort: boolean;
  /** Adaptive thinking. Haiku 4.5 predates it. */
  supportsAdaptiveThinking: boolean;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  thinking: 'adaptive' | 'disabled';
  maxTokens: number;
}

/*
  The measured configuration (see the notes in hosted/lovesims/CLAUDE.md): Opus 5
  as the voice at low effort with thinking off, so a turn takes about five
  seconds instead of a minute, and Haiku 4.5 as the analyst. LOVESIMS_VOICE_MODEL
  and LOVESIMS_ANALYST_MODEL override them, the way THEO_MODEL does for Theo.
  A newer model cannot have thinking disabled (it 400s), so an override gets
  no `thinking` field at all and low effort instead, which is the same intent.
*/
function profile(role: Role): ModelProfile {
  const measured = role === 'voice'
    ? { model: 'claude-opus-5', supportsEffort: true, supportsAdaptiveThinking: true, effort: 'low' as const, thinking: 'disabled' as const, maxTokens: 2000 }
    : { model: 'claude-haiku-4-5', supportsEffort: false, supportsAdaptiveThinking: false, thinking: 'disabled' as const, maxTokens: 1500 };
  const override = process.env[role === 'voice' ? 'LOVESIMS_VOICE_MODEL' : 'LOVESIMS_ANALYST_MODEL'];
  if (!override || override === measured.model) return measured;
  // Haiku 4.5 predates effort and adaptive thinking; everything newer takes
  // effort and runs adaptive thinking when the field is left out.
  const legacy = /4-5$/.test(override);
  return {
    model: override,
    supportsEffort: !legacy,
    supportsAdaptiveThinking: false,
    effort: legacy ? undefined : 'low',
    thinking: 'disabled',
    maxTokens: measured.maxTokens,
  };
}

const PROFILES: Record<Role, ModelProfile> = { voice: profile('voice'), analyst: profile('analyst') };

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

/**
 * Build a structured-output schema. Every property is required and
 * additionalProperties is false, both are conditions of the API's strict mode.
 */
export function schema(properties: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const str = (description: string) => ({ type: 'string', description });
export const num = (description: string) => ({ type: 'number', description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const enumOf = (values: readonly string[], description: string) => ({
  type: 'string',
  enum: [...values],
  description,
});
export const arrayOf = (items: unknown, description: string) => ({
  type: 'array',
  items,
  description,
});

/**
 * Per-role call accounting. Cost and latency were flagged as a live risk in the
 * brief (a 30-turn date is ~60 model calls), so the engine measures its own spend
 * rather than leaving it to be discovered on a bill.
 */
export interface RoleStats {
  calls: number;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

const STATS: Record<Role, RoleStats> = {
  voice: { calls: 0, ms: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  analyst: { calls: 0, ms: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
};

export function resetStats() {
  for (const k of Object.keys(STATS) as Role[]) {
    STATS[k] = { calls: 0, ms: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  }
}

export function getStats(): Record<Role, RoleStats & { model: string; meanMs: number }> {
  return {
    voice: { ...STATS.voice, model: PROFILES.voice.model, meanMs: STATS.voice.calls ? STATS.voice.ms / STATS.voice.calls : 0 },
    analyst: { ...STATS.analyst, model: PROFILES.analyst.model, meanMs: STATS.analyst.calls ? STATS.analyst.ms / STATS.analyst.calls : 0 },
  };
}

export interface Provider {
  readonly name: string;
  generate<T>(args: {
    role: Role;
    system: string;
    user: string;
    outputSchema: JsonSchema;
    /** Used only by the mock provider, to make deterministic output vary. */
    mockHint?: MockHint;
  }): Promise<T>;
}

// ---------------------------------------------------------------------------
// Live provider
// ---------------------------------------------------------------------------

// Guardrail for the low-effort path: with little or no thinking, models can
// occasionally emit internal XML into the visible response. Naming the tags
// specifically is less effective than the generic form.
const XML_GUARD = 'Do not include internal or system XML tags in your response.';

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    // Zero-arg construction resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or
    // an `ant auth login` profile. Only pass a key when one was handed to us.
    //
    // A date is ~60 sequential calls over several minutes, so a single transient
    // blip can throw away everything spent so far. More retries than the default
    // 2, and an explicit per-request timeout. Note the TypeScript SDK takes
    // milliseconds here, unlike the Python SDK's seconds.
    const options = { maxRetries: 5, timeout: 120_000 };
    this.client = apiKey ? new Anthropic({ apiKey, ...options }) : new Anthropic(options);
  }

  async generate<T>({
    role,
    system,
    user,
    outputSchema,
  }: {
    role: Role;
    system: string;
    user: string;
    outputSchema: JsonSchema;
  }): Promise<T> {
    const profile = PROFILES[role];

    const outputConfig: Record<string, unknown> = {
      format: { type: 'json_schema', schema: outputSchema },
    };
    if (profile.supportsEffort && profile.effort) outputConfig.effort = profile.effort;

    const request: Record<string, unknown> = {
      model: profile.model,
      max_tokens: profile.maxTokens,
      // The identity block is the stable prefix; cache it so a 30-turn date pays
      // for the transcript once rather than once per turn.
      system: [{ type: 'text', text: `${system}\n\n${XML_GUARD}`, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: outputConfig,
    };
    if (profile.supportsAdaptiveThinking && profile.thinking === 'adaptive') {
      request.thinking = { type: 'adaptive' };
    } else if (profile.supportsAdaptiveThinking) {
      // Legal only at effort `high` or below, which is where both roles sit.
      request.thinking = { type: 'disabled' };
    }
    // Note: no temperature / top_p / top_k. Those are rejected on Opus 5.

    const started = Date.now();
    const response = await this.client.messages.create(request as never);
    const s = STATS[role];
    s.calls++;
    s.ms += Date.now() - started;
    s.inputTokens += response.usage?.input_tokens ?? 0;
    s.outputTokens += response.usage?.output_tokens ?? 0;
    s.cachedInputTokens += response.usage?.cache_read_input_tokens ?? 0;

    if (response.stop_reason === 'refusal') {
      throw new LlmError(`model declined the request (${response.stop_details?.category ?? 'unspecified'})`);
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new LlmError(`no text block in response (stop_reason=${response.stop_reason})`);
    }
    try {
      return JSON.parse(text.text) as T;
    } catch {
      throw new LlmError(`structured output was not valid JSON: ${text.text.slice(0, 200)}`);
    }
  }
}

export class LlmError extends Error {}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

export interface MockHint {
  kind: 'turn' | 'appraisal';
  speaker?: string;
  partner?: string;
  depth?: number;
  topic?: string;
  /** Drives the sign of the mock appraisal so state actually moves. */
  bias?: number;
  index?: number;
}

/**
 * Deterministic stand-in for the API. It exists so the engine, the metrics, and
 * the UI can be exercised end-to-end without a key or a bill, and so a test can
 * assert that affect and disclosure state actually change over a date.
 *
 * It is not trying to be believable. Believability is the live provider's job.
 */
export class MockProvider implements Provider {
  readonly name = 'mock';

  async generate<T>({
    outputSchema,
    mockHint,
  }: {
    role: Role;
    system: string;
    user: string;
    outputSchema: JsonSchema;
    mockHint?: MockHint;
  }): Promise<T> {
    const hint = mockHint ?? { kind: 'turn' as const };
    const out: Record<string, unknown> = {};

    for (const [key, spec] of Object.entries(outputSchema.properties)) {
      out[key] = this.fill(key, spec as Record<string, unknown>, hint);
    }
    return out as T;
  }

  private fill(key: string, spec: Record<string, unknown>, hint: MockHint): unknown {
    const bias = hint.bias ?? 0;

    if (Array.isArray(spec.enum)) {
      const values = spec.enum as string[];
      if (key === 'emotion') {
        return bias > 0.15 ? 'interest' : bias < -0.15 ? 'awkwardness' : 'neutral';
      }
      if (key === 'kind') {
        const i = (hint.index ?? 0) % 4;
        return (['ask', 'answer', 'story', 'disclose'] as const)[i];
      }
      // Anticipation. The mock predicts the next slot in its own cycle, so it is
      // usually right, but every third turn it guesses one further ahead and is
      // wrong. Both branches have to occur or the scoring path is never tested
      // against a miss, and a metric only ever exercised on hits is not tested.
      if (key === 'predictPartnerKind') {
        const cycle = ['ask', 'answer', 'story', 'disclose'] as const;
        const i = hint.index ?? 0;
        return cycle[(i + (i % 3 === 0 ? 2 : 1)) % 4];
      }
      if (key === 'predictPartnerDepth') {
        return String(Math.max(0, Math.min(4, hint.depth ?? 0)));
      }
      if (key === 'depth') {
        // Push against the ceiling so the disclosure ladder is actually exercised:
        // ask for one deeper than allowed every third turn, so the code-side clamp
        // is tested too.
        const ceiling = hint.depth ?? 0;
        const want = (hint.index ?? 0) % 3 === 0 ? ceiling + 1 : ceiling;
        return String(Math.max(0, Math.min(4, want)));
      }
      if (key === 'agency') return 'other';
      return values[0];
    }

    switch (spec.type) {
      case 'string':
        if (key === 'text') {
          return `[mock] ${hint.speaker ?? 'someone'} says something at depth ${hint.depth ?? 0} about ${hint.topic ?? 'nothing in particular'}.`;
        }
        if (key === 'topic') return hint.topic ?? 'small talk';
        if (key === 'note') return `[mock] appraised with bias ${bias.toFixed(2)}`;
        if (key === 'gesture') return '';
        return `[mock:${key}]`;
      case 'number': {
        // Signed dimensions follow the bias; magnitude dimensions stay mid-scale.
        //
        // The 0.45 factor keeps the signed dimensions in the range a correctly
        // calibrated coder produces (medians well inside +/-0.5). Emitting the raw
        // bias here put the mock's median at +0.7, which is the exact signature of
        // the miscalibration described in docs §4.3.3, so the mock would have
        // tripped the assertion written to catch that bug. A fixture that fails the
        // check it exists to exercise is no use.
        const signed = ['goalCongruence', 'socialEsteem', 'partnerDesirability'];
        if (signed.includes(key)) return clamp(bias * 0.45, -1, 1);
        if (key === 'novelty') return 0.4;
        if (key === 'certainty') return 0.5;
        // Responsiveness components: 0..1 centred on 0.5, moved by bias.
        return clamp(0.5 + bias * 0.4, 0, 1);
      }
      case 'boolean': {
        const i = hint.index ?? 0;
        if (key === 'initiatedTopic') return i % 3 === 0;
        // Predicted an ask when the cycle is about to come round to one, but not
        // every time, so the boolean slots are scored against misses too.
        if (key === 'predictPartnerAsks') return (i + 1) % 4 === 0 && i % 5 !== 0;
        if (key === 'predictPartnerStaysOnTopic') return (i + 1) % 3 !== 0;
        return false;
      }
      case 'array':
        return [];
      default:
        return null;
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function makeProvider(live: boolean): Provider {
  return live ? new AnthropicProvider() : new MockProvider();
}

export function describeModels(): string {
  return `voice=${PROFILES.voice.model} (effort=${PROFILES.voice.effort}, thinking=${PROFILES.voice.thinking}) analyst=${PROFILES.analyst.model}`;
}
