import { budget, lockedHeaders, lockedMessage, modelReady, noStore, readBody, refundUse, runWorker, sameOrigin, spendUse, visitor } from "@/lib/hosted";

/*
  The one part of the HeadWave demo at /headwave that needs a server: turning
  a prompt into a p5 sketch. Signals, camera tracking and the patcher all run
  in the visitor's browser (HeadWave's static/web.js stands in for its Python
  server there) and forward only /api/ai/* here. The worker runs HeadWave's
  own assistant service (python/headwave, copied by `npm run sync:demos`).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Errors use { status, message }, the shape HeadWave's server sends and its client reads.
const fail = (message: string, status: number) => Response.json({ status: "error", message }, { status, headers: noStore });

const OPS = ["ai/generate-visual", "ai/extract-parameters", "ai/validate-code", "ai/optimize-code"];
// One generation is two calls: the sketch, then its parameters.
const admit = budget({ each: 60, all: 600, window: 3_600_000 });
// The parameters call rides on the sketch's use: a generation is one use, not
// two. A visitor is owed one such call per sketch, for a couple of minutes.
const owed = new Map<string, { count: number; until: number }>();
function redeemFollowUp(ip: string) {
  const entry = owed.get(ip);
  if (!entry || entry.until < Date.now() || entry.count < 1) return false;
  entry.count--;
  return true;
}
function oweFollowUp(ip: string) {
  const now = Date.now();
  for (const [key, entry] of owed) if (entry.until < now) owed.delete(key);
  const entry = owed.get(ip);
  owed.set(ip, { count: Math.min(3, (entry && entry.until > now ? entry.count : 0) + 1), until: now + 120_000 });
}

export async function POST(request: Request, { params }: { params: Promise<{ op: string[] }> }) {
  const op = (await params).op.join("/");
  if (!OPS.includes(op)) return fail("Not available in the web version.", 404);
  if (!sameOrigin(request)) return fail("Open HeadWave on this website to use it.", 403);
  if (!modelReady()) return fail("The generation model is not connected yet.", 503);

  const body = await readBody(request, 120_000);
  if (!body) return fail("That is more than the demo can take at once.", 413);
  for (const key of ["prompt", "code", "previousCode", "previousPrompt", "backgroundColor"]) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "string") return fail("Invalid request", 422);
  }

  const ip = visitor(request);
  if (!admit(ip)) return fail("The demo has reached its limit for now. Try again in a while, or run HeadWave from its repository.", 429);
  const followUp = op === "ai/extract-parameters" && redeemFollowUp(ip);
  if (!followUp && !(await spendUse(request))) return Response.json({ status: "error", message: lockedMessage }, { status: 401, headers: lockedHeaders });
  const refund = () => (followUp ? oweFollowUp(ip) : refundUse(request));

  try {
    const result = await runWorker("headwave", op, body);
    // The service's own error text can carry provider diagnostics.
    if (result.status >= 500) {
      await refund();
      return fail("The sketch could not be generated. Try again shortly.", 502);
    }
    if (op === "ai/generate-visual") oweFollowUp(ip);
    return Response.json(result.body, { status: result.status, headers: noStore });
  } catch {
    await refund();
    return fail("HeadWave's generator is unavailable right now.", 502);
  }
}
