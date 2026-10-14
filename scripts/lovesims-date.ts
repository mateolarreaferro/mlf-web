/**
 * Headless date runner and the engine's self-checks.
 *
 *   npm run lovesims:date -- --mock                      # free, the CI path
 *   npm run lovesims:date -- --a tomas --b ingrid --scene jazz-bar
 *
 * Run it after touching anything in src/lib/lovesims: the checks at the bottom
 * assert that every layer is load-bearing, and they are what caught every
 * bug in the research notes. Ported from the lovesims repo's scripts/run-date.ts.
 *
 * Runs on the real models by default: a date on the mock provider tells you the
 * plumbing works and nothing about whether the simulation does, and defaulting to
 * the answer that costs nothing is how you end up reading fake numbers.
 *
 * `--mock` switches to the deterministic provider, which exercises the whole
 * pipeline with no key and no bill. That is the CI path, the assertions at the
 * bottom are written to hold on both.
 */

import { computeGates, initialAffect, stepAffect } from '../src/lib/lovesims/affect';
import { listAgents, hasTier0, loadAgent } from '../src/lib/lovesims/agentbank';
import { runDate } from '../src/lib/lovesims/date';
import { allocateFloor } from '../src/lib/lovesims/director';
import { initialDisclosure } from '../src/lib/lovesims/disclosure';
import { describeModels, getStats } from '../src/lib/lovesims/llm';
import { emptyRelational } from '../src/lib/lovesims/memory';
import { SCENES } from '../src/lib/lovesims/scene';
import type { AffectRecord, Appraisal, Attachment, DateAgent, Debrief, ForecastScore, Idiolect, MoodGates, Turn } from '../src/lib/lovesims/types';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const rose = (s: string) => `\x1b[38;5;168m${s}\x1b[0m`;
const teal = (s: string) => `\x1b[38;5;73m${s}\x1b[0m`;

function bar(v: number, width = 11): string {
  // -1..1 rendered as a centred bar.
  const mid = Math.floor(width / 2);
  const cells = Array.from({ length: width }, () => '·');
  cells[mid] = '|';
  const pos = Math.round(mid + v * mid);
  cells[Math.max(0, Math.min(width - 1, pos))] = v >= 0 ? '▓' : '▒';
  return cells.join('');
}

async function main() {
  if (flag('list')) {
    for (const a of listAgents()) console.log(`${a.id.padEnd(12)} ${a.name.padEnd(10)} ${a.memoryCount} facts`);
    console.log('\nscenes: ' + SCENES.map((s) => s.id).join(', '));
    return;
  }

  // Live unless asked otherwise. `--live` is still accepted so older invocations
  // and the notes in docs/ keep working; it is now a no-op.
  const live = !flag('mock');
  if (live && !process.env.ANTHROPIC_API_KEY) {
    console.error('\nANTHROPIC_API_KEY is not set. Set it, or pass --mock to run on the deterministic provider.\n');
    process.exit(1);
  }
  const config = {
    agentAId: arg('a', 'tomas')!,
    agentBId: arg('b', 'ingrid')!,
    sceneId: arg('scene', 'jazz-bar')!,
    maxTurns: Number(arg('turns', '24')),
    seed: Number(arg('seed', '7')),
    live,
  };

  console.log(bold('\nLoveSims v2'));
  console.log(dim(`  provider  ${live ? describeModels() : 'mock (deterministic, no API calls)'}`));
  console.log(dim(`  tier 0    ${hasTier0() ? 'transcripts present' : 'absent, falling back to extracted facts'}`));
  console.log(dim(`  config    ${JSON.stringify(config)}`));

  const names = new Map<string, string>();
  const colour = new Map<string, (s: string) => string>();
  const turns: Turn[] = [];
  const records: AffectRecord[] = [];
  const forecasts: ForecastScore[] = [];
  let debrief: Debrief | null = null;
  const started = Date.now();

  for await (const ev of runDate(config)) {
    switch (ev.type) {
      case 'start':
        ev.agents.forEach((a, i) => {
          names.set(a.id, a.name);
          colour.set(a.id, i === 0 ? rose : teal);
        });
        console.log(`\n${bold(ev.scene.name)} ${dim(`- ${ev.scene.place}, ${ev.scene.city}`)}`);
        console.log(dim(`  ${ev.scene.description}`));
        for (const a of ev.agents) {
          console.log(`\n  ${colour.get(a.id)!(a.name)}`);
          console.log(dim(`    wants:      ${a.goals.overt}`));
          console.log(dim(`    carrying:   ${a.goals.covert}`));
          console.log(dim(`    constraint: ${a.goals.constraint}`));
        }
        console.log('');
        break;

      case 'scene_event':
        console.log(dim(`\n   ~ [${ev.minute}m] ${ev.text}\n`));
        break;

      case 'turn': {
        turns.push(ev.turn);
        const c = colour.get(ev.turn.agentId)!;
        const head = `${String(ev.turn.minute).padStart(3)}m ${c(names.get(ev.turn.agentId)!.padEnd(9))}`;
        const meta = dim(`[${ev.turn.kind}/D${ev.turn.depth}${ev.turn.initiatedTopic ? '/new' : ''}]`);
        const body = ev.turn.kind === 'silence' ? dim('(says nothing)') : ev.turn.text;
        console.log(`${head} ${meta} ${body}`);
        if (ev.turn.gesture) console.log(dim(`     ${' '.repeat(9)} [${ev.turn.gesture}]`));
        break;
      }

      case 'affect': {
        records.push(ev.record);
        const c = colour.get(ev.record.agentId)!;
        const r = ev.record;
        console.log(
          dim(`     ${c('→')} ${names.get(r.agentId)!.padEnd(8)} ${r.label.padEnd(14)}`) +
            dim(` mood ${bar(r.mood.valence)} ${r.mood.valence.toFixed(2).padStart(5)}`) +
            dim(`  int ${r.intimacy.toFixed(2)}`) +
            dim(`  gap ${r.responsivenessGap >= 0 ? '+' : ''}${r.responsivenessGap.toFixed(2)}`) +
            dim(`  ceil D${r.ceiling}`),
        );
        break;
      }

      case 'forecast': {
        const s = ev.score;
        forecasts.push(s);
        const c = colour.get(s.agentId)!;
        const verdict = s.kindHit && s.depthError <= 1 ? 'called it' : `expected ${s.predicted.kind}/D${s.predicted.depth}`;
        console.log(dim(`     ${c('?')} ${names.get(s.agentId)!.padEnd(8)} ${verdict.padEnd(14)} acc ${s.accuracy.toFixed(2)}`));
        break;
      }

      case 'end':
        console.log(`\n${bold('- end -')} ${dim(`${ev.reason} · ${ev.minutes} minutes · ${ev.turns} turns · ${((Date.now() - started) / 1000).toFixed(1)}s wall`)}`);
        break;

      case 'debrief':
        debrief = ev.debrief;
        break;

      case 'error':
        console.error(`\n\x1b[31mERROR\x1b[0m ${ev.message}`);
        process.exitCode = 1;
        break;
    }
  }

  if (!debrief) return;
  const d = debrief;

  console.log(bold('\nDebrief'));
  console.log(`  LSM (function-word synchrony)   ${d.lsm.toFixed(3)}`);
  console.log(`  Disclosure reciprocity          ${d.reciprocityIndex.toFixed(3)}`);
  console.log(`  Dead-air events                 ${d.deadAirEvents}`);
  console.log(
    `  Mutual interest                 ${d.mutualInterestMargin >= 0 ? '+' : ''}${d.mutualInterestMargin.toFixed(3)}` +
    dim(`  (${d.mutualInterest ? 'all six cleared' : 'held back'}; tightest is ${d.mutualInterestBinding})`),
  );

  console.log(bold('\n  Per agent'));
  const cols = ['turns', 'words', 'ask%', 'init%', 'uptake%', 'deepest', 'given', 'recv', 'repair', 'gap', 'pos%', 'mood', 'kindH', 'safe%'];
  console.log(dim('    ' + 'name'.padEnd(10) + cols.map((c) => c.padStart(8)).join('')));
  for (const m of d.perAgent) {
    const row = [
      m.turns, m.meanTurnWords,
      (m.questionRatio * 100).toFixed(0), (m.topicInitiative * 100).toFixed(0), (m.uptakeRate * 100).toFixed(0),
      `D${m.deepestDepth}`, m.disclosureGiven, m.disclosureReceived, m.repairAttempts,
      m.responsivenessGap.toFixed(2), (m.positivityRatio * 100).toFixed(0), m.finalMoodValence.toFixed(2),
      m.kindEntropy.toFixed(2), (m.safeMoveRatio * 100).toFixed(0),
    ];
    console.log('    ' + m.name.padEnd(10) + row.map((v) => String(v).padStart(8)).join(''));
  }

  console.log(bold('\n  Reading each other'));
  console.log(dim('    how well each one called the other\'s next move. accuracy alone mostly measures'));
  console.log(dim('    how predictable the partner was, so read the skill columns. "skill" scores against'));
  console.log(dim('    a constant fitted over the whole date, which flatters it; "causal" refits using only'));
  console.log(dim('    what had been seen at the time and is the honest one.'));
  console.log(dim('    ' + 'name'.padEnd(10) + ['n', 'kind%', 'depthMAE', 'ask%', 'topic%', 'acc', 'base', 'skill', 'causal'].map((c) => c.padStart(9)).join('')));
  for (const m of d.perAgent) {
    const t = m.anticipation;
    const row = [
      t.forecasts,
      (t.kindAccuracy * 100).toFixed(0),
      t.depthMae.toFixed(2),
      (t.askAccuracy * 100).toFixed(0),
      (t.topicAccuracy * 100).toFixed(0),
      t.composite.toFixed(3),
      t.baseline.toFixed(3),
      (t.skill >= 0 ? '+' : '') + t.skill.toFixed(3),
      (t.causalSkill >= 0 ? '+' : '') + t.causalSkill.toFixed(3),
    ];
    console.log('    ' + m.name.padEnd(10) + row.map((v) => String(v).padStart(9)).join(''));
  }

  // Is the analyst actually using the signed scale, or only its positive half?
  // Mood is an EWMA of these, so a coder that never goes below zero produces a
  // simulation in which no date can end badly, however the dynamics are written.
  console.log(bold('\n  Appraisal scale use'));
  console.log(dim('    the three signed dimensions run -1..+1. A dating sim in which these never go'));
  console.log(dim('    negative cannot produce a bad date, whatever the mood dynamics say.'));
  const dims = [
    ['goalCongruence', (r: AffectRecord) => r.appraisal.goalCongruence],
    ['socialEsteem', (r: AffectRecord) => r.appraisal.socialEsteem],
    ['partnerDesirability', (r: AffectRecord) => r.appraisal.partnerDesirability],
  ] as const;
  console.log(dim('    ' + 'dimension'.padEnd(22) + ['min', 'median', 'max', 'mean', '% < 0'].map((c) => c.padStart(9)).join('')));
  for (const [name, get] of dims) {
    const vs = records.map(get).sort((x, y) => x - y);
    if (!vs.length) continue;
    const neg = vs.filter((v) => v < 0).length / vs.length;
    const row = [
      vs[0].toFixed(2), vs[Math.floor(vs.length / 2)].toFixed(2), vs[vs.length - 1].toFixed(2),
      (vs.reduce((s, v) => s + v, 0) / vs.length).toFixed(2), (neg * 100).toFixed(0) + '%',
    ];
    console.log('    ' + name.padEnd(22) + row.map((v) => String(v).padStart(9)).join(''));
  }

  console.log(bold('\n  Moments that mattered'));
  for (const m of d.moments) {
    console.log(`    [${String(m.minute).padStart(3)}m] ${bold(m.label)}`);
    console.log(dim(`           "${m.excerpt.slice(0, 96)}${m.excerpt.length > 96 ? '…' : ''}"`));
    console.log(dim(`           ${m.evidence}`));
  }

  if (d.sharedInterests.length) {
    console.log(bold('\n  Shared ground (bridge-to-real input)'));
    for (const s of d.sharedInterests) {
      console.log(`    ${s.topic.padEnd(28)} ${dim(`${s.turns.length} turns, longest run ${s.sustainedTurns}, at turns ${s.turns.join(',')}`)}`);
    }
  }

  if (live) {
    console.log(bold('\n  Model spend'));
    const stats = getStats();
    console.log(dim('    role      model                 calls   mean ms      in   cached     out'));
    for (const [role, s] of Object.entries(stats)) {
      console.log(
        '    ' + role.padEnd(10) + s.model.padEnd(22) +
        String(s.calls).padStart(5) + String(Math.round(s.meanMs)).padStart(10) +
        String(s.inputTokens).padStart(8) + String(s.cachedInputTokens).padStart(9) + String(s.outputTokens).padStart(8),
      );
    }
    const cacheRate = stats.voice.inputTokens + stats.voice.cachedInputTokens > 0
      ? stats.voice.cachedInputTokens / (stats.voice.inputTokens + stats.voice.cachedInputTokens)
      : 0;
    console.log(dim(`    voice prompt-cache hit rate: ${(cacheRate * 100).toFixed(0)}%`));
  }

  // --- assertions: the state must actually move, or the layers are decorative ---
  console.log(bold('\n  Self-check'));
  const checks: [string, boolean, string][] = [];

  const moodRange = (id: string) => {
    const vs = records.filter((r) => r.agentId === id).map((r) => r.mood.valence);
    return vs.length ? Math.max(...vs) - Math.min(...vs) : 0;
  };
  const ids = [...names.keys()];
  checks.push(['affect state varies over the date', ids.every((id) => moodRange(id) > 0.05), ids.map((id) => `${names.get(id)} range ${moodRange(id).toFixed(2)}`).join(', ')]);

  const depths = new Set(turns.map((t) => t.depth));
  // Intimacy needs turns to climb; on a short run staying at D1 is correct behaviour,
  // not a failure. Only assert escalation once the date was long enough to allow it.
  if (turns.length >= 14) {
    checks.push(['disclosure depth escalates', depths.size > 1, `depths used: ${[...depths].sort().join(', ')}`]);
  } else {
    console.log(dim(`    (skipped depth-escalation check: only ${turns.length} turns; depths used ${[...depths].sort().join(', ')})`));
  }

  const gaps = records.map((r) => Math.abs(r.responsivenessGap));
  checks.push(['perceived ≠ actual responsiveness', gaps.some((g) => g > 0.01), `max gap ${Math.max(...gaps, 0).toFixed(3)}`]);

  // Alternation is the *common* case in real conversation, so observing it in one
  // run proves nothing. What must be true is that the director can deviate, so
  // probe the mechanism directly with divergent state.
  const probe = probeDirector();
  checks.push(['director can produce a double-turn', probe.doubleTurn, probe.doubleTurnDetail]);
  checks.push(['director can produce dead air', probe.deadAir, probe.deadAirDetail]);
  checks.push(['question obligation flips the floor', probe.obligation, probe.obligationDetail]);

  // Attachment has to change outcomes, not just prompt text. Probed directly with a
  // fixed appraisal sequence rather than read off this run, because whether a given
  // date happens to contain negative turns is not something one run can guarantee.
  const att = probeAttachment();
  checks.push(['attachment changes the trajectory', att.trajectory, att.trajectoryDetail]);
  checks.push(['avoidance inverts the intimacy response', att.inversion, att.inversionDetail]);

  const clamps = turns.filter((t) => t.clamped).length;
  checks.push([
    'no turn exceeded its ceiling',
    turns.every((t) => t.depth <= t.ceiling),
    `${clamps}/${turns.length} turns were clamped down by the ladder`,
  ]);
  // Anticipation is only a measure if forecasts get made, get scored, and vary.
  // A channel that always predicts the same thing is decoration however good its
  // raw accuracy looks, the base rate would score the same.
  // The first turn has nothing to score and the last forecast is never answered,
  // so full alternation yields turns-1 scores and each double-turn costs one more.
  checks.push([
    'partner forecasts are scored',
    forecasts.length > 0 && forecasts.length <= Math.max(0, turns.length - 1),
    `${forecasts.length} scored across ${turns.length} turns`,
  ]);
  const predictedKinds = new Set(forecasts.map((f) => f.predicted.kind));
  checks.push([
    'forecasts are not constant',
    predictedKinds.size > 1,
    `predicted kinds: ${[...predictedKinds].join(', ') || 'none'}`,
  ]);
  // Both branches of the scorer have to run, or the metric is only ever tested on
  // hits. Below a handful of forecasts that is a claim about luck, not the code.
  const hits = forecasts.filter((f) => f.kindHit).length;
  if (forecasts.length >= 6) {
    checks.push(['forecasts both hit and miss', hits > 0 && hits < forecasts.length, `${hits}/${forecasts.length} called the move`]);
  } else {
    console.log(dim(`    (skipped hit/miss check: only ${forecasts.length} forecasts; ${hits} called the move)`));
  }

  // The signed appraisal dimensions run -1..+1 and are centred on zero, so their
  // medians must sit well inside that range. A median near +0.6 is the signature of
  // a coder reading them as a 0-1 scale, which is exactly what happened, silently,
  // for the whole life of the project (docs §4.3.3). Mood is an EWMA of these, so
  // the consequence was that no date could end badly and an entire director path was
  // unreachable. Asserted per dimension rather than on the pooled mean, because
  // pooling hid it: the pooled mean under the bug was 0.35 and looked fine.
  const signedMedians: [string, number][] = [
    ['goalCongruence', medianOf(records.map((r) => r.appraisal.goalCongruence))],
    ['socialEsteem', medianOf(records.map((r) => r.appraisal.socialEsteem))],
    ['partnerDesirability', medianOf(records.map((r) => r.appraisal.partnerDesirability))],
  ];
  checks.push([
    'appraisal treats signed scale as centred',
    signedMedians.every(([, m]) => Math.abs(m) < 0.5),
    signedMedians.map(([n, m]) => `${n} ${m >= 0 ? '+' : ''}${m.toFixed(2)}`).join(', '),
  ]);

  // An accumulator that reaches its clamp has stopped measuring: every later
  // reading is discarded, so the back half of the date moves no state. This is a
  // regression guard on the headroom scaling in stepDisclosure.
  const peakInt = Math.max(...records.map((r) => r.intimacy), 0);
  checks.push([
    'intimacy never pins at the ceiling',
    peakInt < 1,
    `peak intimacy ${peakInt.toFixed(3)}`,
  ]);

  const maxCeil = Math.max(...turns.map((t) => t.ceiling), 0);
  const peakIntimacy = Math.max(...records.map((r) => r.intimacy), 0);
  checks.push(['ceiling rose above D1 during the date', maxCeil > 1, `max ceiling D${maxCeil}, peak intimacy ${peakIntimacy.toFixed(2)}`]);

  for (const [label, ok, detail] of checks) {
    console.log(`    ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label.padEnd(40)} ${dim(detail)}`);
    if (!ok) process.exitCode = 1;
  }
  console.log('');
}

/**
 * Direct probe of the floor allocator. Alternation happens most of the time by
 * design; what has to be demonstrable is that the mechanism *can* do the things
 * strict `i % 2` could not.
 */
/**
 * Direct probe of the attachment layer.
 *
 * `threatGain` only multiplies *negative* goal congruence and social esteem, so
 * before the appraisal recalibration in docs §4.3.3 it applied to 7-14% of turns
 * and the table CLAUDE.md calls the highest-leverage in the codebase was very
 * nearly inert. It now applies to 36-43%. Two claims are asserted: attachment
 * moves the trajectory at all, and avoidant/fearful agents respond to rising
 * intimacy in the opposite direction to secure/anxious ones, the `intimacyPull`
 * signature, which is the whole reason the profile table exists.
 */
function probeAttachment() {
  const scene = SCENES.find((s) => s.id === 'jazz-bar')!;
  const idiolect: Idiolect = {
    meanTurnLength: 30, questionRate: 0.35, hedging: 0.3,
    narrativity: 0.5, exemplars: [], discomfortTell: 'goes quiet',
  };
  const appraisal = (v: number): Appraisal => ({
    goalCongruence: v, novelty: 0.4, agency: 'other', socialEsteem: v,
    partnerDesirability: v * 0.6, certainty: 0.5, emotion: 'neutral', note: '',
  });
  // Mixed valence with real negatives, as the recalibrated coder now produces.
  const sequence = [0.3, -0.4, 0.1, -0.5, 0.2, -0.3, 0.0, -0.6, 0.15, -0.2];

  const out = (['secure', 'anxious', 'avoidant', 'fearful'] as Attachment[]).map((at) => {
    let s = initialAffect();
    for (const v of sequence) s = stepAffect(s, appraisal(v), at, idiolect, scene, 0.4, null, 10);
    const lo = computeGates(s, at, idiolect, scene, 0.1).disclosureWillingness;
    const hi = computeGates(s, at, idiolect, scene, 0.7).disclosureWillingness;
    return { at, mood: s.mood.valence, pull: hi - lo };
  });

  const moods = out.map((o) => o.mood);
  const spread = Math.max(...moods) - Math.min(...moods);
  const pullOf = (a: Attachment) => out.find((o) => o.at === a)!.pull;

  return {
    trajectory: spread > 0.05,
    trajectoryDetail: out.map((o) => `${o.at} ${o.mood.toFixed(2)}`).join(', ') + ` (spread ${spread.toFixed(2)})`,
    inversion: pullOf('secure') > 0 && pullOf('anxious') > 0 && pullOf('avoidant') < 0 && pullOf('fearful') < 0,
    inversionDetail: out.map((o) => `${o.at} ${o.pull >= 0 ? '+' : ''}${o.pull.toFixed(2)}`).join(', '),
  };
}

function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function probeDirector() {
  const build = (id: string, gates: Partial<MoodGates>) => {
    const { identity, goals, traces } = loadAgent(id, 1);
    const agent: DateAgent = {
      identity, goals, traces,
      affect: { ...initialAffect(), gates: { ...FLAT_GATES, ...gates } },
      disclosure: initialDisclosure(),
      relational: emptyRelational(),
      pendingForecast: null,
      lastSpokeAt: 0,
      priorDates: 0,
    };
    return agent;
  };

  const turnStub = (agentId: string, kind: Turn['kind']): Turn => ({
    index: 0, minute: 5, agentId, kind, text: 'x', gesture: null,
    depth: 1, ceiling: 1, clamped: false, topic: 't', initiatedTopic: false, floorReason: '',
  });

  const rng = () => 0.5; // no jitter, so the probe is deterministic

  // 1. A driving agent who just spoke keeps the floor.
  const loud = build('tomas', { topicInitiative: 1, riskAppetite: 1, verbosity: 1, exitDesire: 0.4 });
  const quiet = build('ingrid', { topicInitiative: 0.05, riskAppetite: 0.05, verbosity: 0.2, exitDesire: 0 });
  const d1 = allocateFloor(loud, quiet, [turnStub(loud.identity.id, 'story')], rng);
  const doubleTurn = d1.speaker.identity.id === loud.identity.id;

  // 2. Two disengaged agents produce a lull.
  const flatA = build('tomas', { topicInitiative: 0.02, riskAppetite: 0.02, verbosity: 0.05, exitDesire: 0 });
  const flatB = build('ingrid', { topicInitiative: 0.02, riskAppetite: 0.02, verbosity: 0.05, exitDesire: 0 });
  const d2 = allocateFloor(flatA, flatB, [turnStub(flatA.identity.id, 'answer')], rng);
  const deadAir = d2.deadAir;

  // 3. An unanswered question outranks a driving partner.
  const d3 = allocateFloor(loud, quiet, [turnStub(quiet.identity.id, 'ask')], rng);
  const obligation = d3.speaker.identity.id === loud.identity.id && d3.reason.includes('asked');

  return {
    doubleTurn, doubleTurnDetail: `winner=${d1.speaker.identity.name} reason="${d1.reason}"`,
    deadAir, deadAirDetail: `deadAir=${d2.deadAir} reason="${d2.reason}"`,
    obligation, obligationDetail: `winner=${d3.speaker.identity.name} reason="${d3.reason}"`,
  };
}

const FLAT_GATES: MoodGates = {
  verbosity: 0.5, questionRate: 0.3, disclosureWillingness: 0.5,
  warmth: 0.5, riskAppetite: 0.5, topicInitiative: 0.5, exitDesire: 0.1,
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
