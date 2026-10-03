import { budget, lockedHeaders, lockedMessage, modelReady, noStore, readBody, refundUse, runWorker, sameOrigin, spendUse, visitor } from "@/lib/hosted";

/*
  The public face of the Theo demo at /theo. The Studio front end calls the
  same paths its desktop backend serves (/parse, /render, /generate, ...); this
  route checks and meters each call, then hands it to the Python worker, which
  runs Theo's own code (python/theo, copied by `npm run sync:demos`).
  Parsing is free and runs on every edit. Everything else is a Claude call on
  Mateo's key, so those are budgeted per visitor and per instance.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Errors use `detail`, the shape Theo's own backend sends and its client reads.
const fail = (detail: string, status: number) => Response.json({ detail }, { status, headers: noStore });

const AI_OPS = ["render", "generate", "pre-generate/clarify", "clarify", "clarify/answer", "trajectories"];
const admitParse = budget({ each: 240, all: 6000, window: 60_000 });
// "Render all" is one call per section, so a visitor needs room for a few essays.
const admitModel = budget({ each: 40, all: 400, window: 3_600_000 });

export async function GET(_: Request, { params }: { params: Promise<{ op: string[] }> }) {
  if ((await params).op.join("/") !== "health") return fail("Not found", 404);
  return Response.json({ status: "ok", ai: modelReady() }, { headers: noStore });
}

export async function POST(request: Request, { params }: { params: Promise<{ op: string[] }> }) {
  const op = (await params).op.join("/");
  const ai = AI_OPS.includes(op);
  if (!ai && op !== "parse") return fail("Not found", 404);
  if (!sameOrigin(request)) return fail("Open Theo on this website to use it.", 403);
  if (ai && !modelReady()) return fail("Theo's writing model is not connected yet. You can still edit and explore the structure.", 503);

  const body = await readBody(request, 120_000);
  if (!body) return fail("That is more than the demo can take at once. Try a shorter text.", 413);
  const t = body.temperature;
  if (t !== undefined && (typeof t !== "number" || !(t >= 0 && t <= 1))) return fail("Invalid request", 422);

  if (!(ai ? admitModel : admitParse)(visitor(request))) {
    return fail(ai ? "The demo has reached its limit for now. Try again in a while, or run Theo from its repository." : "Too many requests. Try again in a minute.", 429);
  }
  // Each section rendered is one use, so "render all" spends one per section.
  if (ai && !(await spendUse(request))) return Response.json({ detail: lockedMessage }, { status: 401, headers: lockedHeaders });

  try {
    const result = await runWorker("theo", op, body);
    // 4xx details are Theo's own (a parse error names the line); 5xx text can
    // carry provider diagnostics, so it is replaced.
    if (result.status >= 500) {
      if (ai) await refundUse(request);
      return fail("Theo could not finish that. Try again shortly.", 502);
    }
    return Response.json(result.body, { status: result.status, headers: noStore });
  } catch {
    if (ai) await refundUse(request);
    return fail("Theo is unavailable right now.", 502);
  }
}
