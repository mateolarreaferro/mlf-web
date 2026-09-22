import { authenticated, changeNote, isPrivate, NoteError, readBoard, ready, sameOrigin, SESSION, sessionToken, validKey } from "@/lib/weekly-notes";

export const runtime = "nodejs";
export const maxDuration = 30;
// The Blob SDK calls fetch internally. Disable Next's fetch cache as well as
// Blob's CDN cache, so a conditional write always reads the current revision.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
const headers = { "Cache-Control": "private, no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

export async function GET(request: Request) {
  const canEdit = authenticated(request);
  if (!ready()) return json({ ready: false, canEdit: false, notes: [] });
  if (isPrivate() && !canEdit) return json({ ready: true, private: true, canEdit: false, notes: [] });
  try {
    const { notes } = await readBoard();
    return json({ ready: true, private: isPrivate(), canEdit, notes });
  } catch { return json({ error: "Notes couldn’t load. Please retry." }, 503); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!ready()) throw new NoteError("Note storage isn’t connected yet.", 503);
    const raw = await request.text();
    if (raw.length > 25000) throw new NoteError("Note is too long.", 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new NoteError("Invalid note.");
    if (body.action === "login") {
      if (typeof body.key !== "string" || body.key.length > 256 || !validKey(body.key)) throw new NoteError("That editing key isn’t correct.", 401);
      const response = json({ ok: true });
      response.headers.set("Set-Cookie", `${SESSION}=${sessionToken()}; Path=/api/weekly-notes; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
      return response;
    }
    if (body.action === "logout") {
      const response = json({ ok: true });
      response.headers.set("Set-Cookie", `${SESSION}=; Path=/api/weekly-notes; HttpOnly; SameSite=Strict; Max-Age=0`);
      return response;
    }
    if (!authenticated(request)) throw new NoteError("Sign in to save this note.", 401);
    return json({ note: await changeNote(body) });
  } catch (error) {
    if (error instanceof NoteError) return json({ error: error.message, ...(error.current !== undefined ? { current: error.current } : {}) }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Invalid note." }, 400);
    return json({ error: "Couldn’t save. Your draft is still here." }, 503);
  }
}
