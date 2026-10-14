import { hasAgent } from '@/lib/lovesims/agentbank';
import { runDate } from '@/lib/lovesims/date';
import { getScene } from '@/lib/lovesims/scene';
import type { DateConfig } from '@/lib/lovesims/types';
import { budget, lockedHeaders, lockedMessage, modelReady, noStore, readBody, refundUse, sameOrigin, spendUse, visitor } from '@/lib/hosted';

/*
  Streams one date as newline-delimited JSON (one DateEvent per line). The
  whole run lives in the generator's closure, so concurrent visitors cannot
  see each other's date and the stream ends when the date ends.

  A live date is around fifty model calls on Mateo's key, so it is metered
  like the other demos: same origin only, a per-visitor and per-instance
  budget, and one of the visitor's free uses per date (the password lifts
  that, see spendUse). A date on the mock provider (`live: false`, which the
  game's ?demo=1 sends) costs nothing and spends nothing. If the model fails
  before a single turn is spoken, the use is given back.
*/

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// About seven seconds a turn at 22 turns, plus the debrief. Vercel's ceiling.
export const maxDuration = 300;
const MAX_TURNS = 22;

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

const admitLive = budget({ each: 6, all: 60, window: 3_600_000 });
const admitMock = budget({ each: 30, all: 300, window: 60_000 });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('Open LoveSims on this website to play.', 403);
  const body = await readBody(request, 2_000);
  if (!body) return fail('Invalid request', 400);

  const { agentAId, agentBId, sceneId } = body;
  if (typeof agentAId !== 'string' || typeof agentBId !== 'string' || !hasAgent(agentAId) || !hasAgent(agentBId)) {
    return fail('Pick two people from the cast.', 400);
  }
  if (agentAId === agentBId) return fail('Someone cannot date themselves.', 400);
  try {
    getScene(typeof sceneId === 'string' ? sceneId : '');
  } catch {
    return fail('Unknown scene.', 400);
  }

  const live = body.live !== false;
  if (live && !modelReady()) return fail('The model is not connected yet, so the date can only run on the mock provider.', 503);
  if (!(live ? admitLive : admitMock)(visitor(request))) {
    return fail(live ? 'The demo has had its share of dates for now. Try again in a while.' : 'Too many requests. Try again in a minute.', 429);
  }
  if (live && !(await spendUse(request))) return Response.json({ error: lockedMessage }, { status: 401, headers: lockedHeaders });

  const config: DateConfig = {
    agentAId,
    agentBId,
    sceneId: sceneId as string,
    maxTurns: clampInt(typeof body.maxTurns === 'number' ? body.maxTurns : MAX_TURNS, 4, MAX_TURNS),
    seed: typeof body.seed === 'number' && Number.isFinite(body.seed) ? Math.floor(body.seed) : Math.floor(Date.now() % 100000),
    live,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      let spoke = false;
      try {
        for await (const event of runDate(config)) {
          if (event.type === 'turn') spoke = true;
          // Provider diagnostics never reach the browser; the page says the date broke.
          if (event.type === 'error') {
            send({ type: 'error', message: spoke ? 'The date lost its thread. What happened so far stands.' : 'The date could not start. Try again shortly.' });
            continue;
          }
          send(event);
          // Let the client render between turns rather than receive one block.
          if (event.type === 'turn') await new Promise((r) => setTimeout(r, 0));
        }
      } catch {
        send({ type: 'error', message: 'The date lost its thread. What happened so far stands.' });
      } finally {
        if (live && !spoke) await refundUse(request).catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
