import { budget, hmac, lockedHeaders, noStore, readBody, sameOrigin, unlocked, usesSecret, visitor } from "@/lib/hosted";
import { createNote, deleteNote, listNotes, react, say, updateNote, visitorHash, WallError, type MessageKey } from "@/lib/open-wall";

/*
  The open wall's API (src/lib/open-wall.ts holds the rules). The page at
  /sticky-notes is Ansantuario's interface built for the web; its notes
  module (src/web/notes.ts in that repo) is the only caller. Refusals come
  in the visitor's language, from its x-wall-lang header.

    GET    notes?since=<version>   the wall, or { unchanged } if nothing moved
    POST   notes                   leave a note
    PATCH  notes/<id>              change your own note
    DELETE notes/<id>              delete your own, or any as moderator
    POST   notes/<id>/react        toggle a reaction
    GET    moderate                the site password makes you a moderator

  No model is called here, so none of this spends the three free uses.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (request: Request, key: MessageKey, status: number, vars?: Record<string, string | number>) =>
  Response.json({ error: say(request, key, vars) }, { status, headers: noStore });
const admitEdit = budget({ each: 600, all: 20_000, window: 3_600_000 });
const admitReact = budget({ each: 120, all: 10_000, window: 3_600_000 });

type Params = { params: Promise<{ op: string[] }> };

async function handle(request: Request, work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WallError) return fail(request, error.key, error.status, error.vars);
    console.error("Open wall failed", error instanceof Error ? error.message : error);
    return fail(request, "down", 502);
  }
}

export async function GET(request: Request, { params }: Params) {
  const op = (await params).op.join("/");
  const moderator = await unlocked();
  if (op === "moderate") {
    return moderator
      ? Response.json({ moderator: true }, { headers: noStore })
      : Response.json({ error: say(request, "moderate") }, { status: 401, headers: { ...lockedHeaders, "x-mlf-locked-copy": "moderate" } });
  }
  if (op !== "notes") return fail(request, "notFound", 404);
  const since = Number(new URL(request.url).searchParams.get("since"));
  return handle(request, async () => Response.json({ ...(await listNotes(visitorHash(request), Number.isFinite(since) ? since : -1)), moderator }, { headers: noStore }));
}

export async function POST(request: Request, { params }: Params) {
  const op = (await params).op;
  if (!sameOrigin(request)) return fail(request, "offsite", 403);
  const me = visitorHash(request);
  if (!me) return fail(request, "reload", 400);
  const body = await readBody(request, 8000);
  if (!body) return fail(request, "badNote", 400);
  const ip = visitor(request);

  if (op.length === 1 && op[0] === "notes") {
    // The address never reaches the database, only a keyed hash of it.
    return handle(request, async () => Response.json({ note: await createNote(me, hmac(usesSecret() || "mlf", ip), body) }, { status: 201, headers: noStore }));
  }
  if (op.length === 3 && op[0] === "notes" && op[2] === "react") {
    if (!admitReact(ip)) return fail(request, "tooManyReactions", 429);
    return handle(request, async () => Response.json({ note: await react(me, op[1], body.type) }, { headers: noStore }));
  }
  return fail(request, "notFound", 404);
}

export async function PATCH(request: Request, { params }: Params) {
  const op = (await params).op;
  if (op.length !== 2 || op[0] !== "notes") return fail(request, "notFound", 404);
  if (!sameOrigin(request)) return fail(request, "offsite", 403);
  const me = visitorHash(request);
  if (!me) return fail(request, "reload", 400);
  if (!admitEdit(visitor(request))) return fail(request, "tooManyChanges", 429);
  const body = await readBody(request, 8000);
  if (!body) return fail(request, "badChange", 400);
  return handle(request, async () => Response.json({ note: await updateNote(me, op[1], body) }, { headers: noStore }));
}

export async function DELETE(request: Request, { params }: Params) {
  const op = (await params).op;
  if (op.length !== 2 || op[0] !== "notes") return fail(request, "notFound", 404);
  if (!sameOrigin(request)) return fail(request, "offsite", 403);
  const me = visitorHash(request);
  const moderator = await unlocked();
  if (!me && !moderator) return fail(request, "reload", 400);
  return handle(request, async () => {
    await deleteNote(me, op[1], moderator);
    return Response.json({ ok: true }, { headers: noStore });
  });
}
