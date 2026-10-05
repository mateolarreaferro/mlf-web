import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt } from "@/lib/agent-context";
import { budget, lockedHeaders, lockedMessage, noStore, sameOrigin, spendUse, visitor } from "@/lib/hosted";

// The agent, Theo and HeadWave all bill to ANTHROPIC_API_KEY, so the agent
// draws on the same kind of budget the demos do.
const MODEL = "claude-opus-5-5";
const admit = budget({ each: 40, all: 400, window: 3_600_000 });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Use the agent from this website." }, { status: 403, headers: noStore });
  if (!admit(visitor(req))) {
    return Response.json({ error: "Too many messages for now. Try again in a while." }, { status: 429, headers: noStore });
  }
  // Every message is one of the visitor's free uses, the same pool as the demos.
  if (!(await spendUse(req))) return Response.json({ error: lockedMessage }, { status: 401, headers: lockedHeaders });
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic(MODEL),
    // The prompt is the same for every visitor until the content changes, so
    // it is cached: later messages read it at a fraction of the price.
    instructions: {
      role: "system",
      content: buildSystemPrompt(),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    messages: await convertToModelMessages(messages),
    // Answers about the portfolio are lookups, not hard problems.
    providerOptions: { anthropic: { effort: "low" } },
    // Two sentences is the rule (agent-context.ts); this only catches a runaway.
    maxOutputTokens: 220,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
