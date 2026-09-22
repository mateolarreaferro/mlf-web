import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { get, put, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";

// One private document, conditional writes, and uncached reads. Notes survive
// deployments; the revision on each note prevents another tab losing a draft.
const PATH = "weekly-notes/board-v1.json";
export const SESSION = "weekly-notes-session";
const WEEKS = new Set(["week01", "week02", "week03", "week04", "week06", "week07", "week09", "week10", "week11", "week12", "week13", "final"]);
const COLORS = new Set(["sea", "amber", "lilac", "rose"]);
export type Note = { id: string; week: string; text: string; color: string; x: number; y: number; revision: string; updatedAt: string };
export class NoteError extends Error {
  constructor(message: string, public status = 400, public current?: Note | null) { super(message); }
}
export const ready = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.WEEKLY_NOTES_EDIT_KEY);
export const isPrivate = () => process.env.WEEKLY_NOTES_VISIBILITY === "private";
const hash = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(hash(a), hash(b));
export const validKey = (key: string) => Boolean(process.env.WEEKLY_NOTES_EDIT_KEY && same(key, process.env.WEEKLY_NOTES_EDIT_KEY));
const sign = (s: string) => createHmac("sha256", process.env.WEEKLY_NOTES_EDIT_KEY ?? "").update(s).digest("base64url");
export function sessionToken() {
  const expires = String(Date.now() + 30 * 86400_000);
  return `${expires}.${sign(expires)}`;
}
export function authenticated(request: Request) {
  if (!ready()) return false;
  const token = request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(`${SESSION}=`))?.slice(SESSION.length + 1);
  const [expires, signature] = token?.split(".") ?? [];
  return Boolean(expires && signature && Number(expires) > Date.now() && same(signature, sign(expires)));
}
export function sameOrigin(request: Request) {
  let matches = false;
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    matches = origin.host === request.headers.get("host") && origin.protocol === new URL(request.url).protocol;
  } catch { /* Missing and opaque origins are rejected. */ }
  if (!matches) throw new NoteError("Open notes on this website to edit them.", 403);
}
export async function readBoard() {
  try {
    // Compressed responses carry weak ETags, which cannot satisfy If-Match.
    // Read the identity representation to obtain the strong storage revision.
    const blob = await get(PATH, { access: "private", useCache: false, headers: { "Accept-Encoding": "identity" } });
    if (!blob) return { notes: [] as Note[], etag: undefined };
    if (!blob.stream) throw new Error("Missing note content");
    const data = await new Response(blob.stream).json();
    if (data.version !== 1 || !Array.isArray(data.notes)) throw new Error("Invalid note document");
    return { notes: data.notes as Note[], etag: blob.blob.etag };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { notes: [] as Note[], etag: undefined };
    throw error;
  }
}
export function validateChange(body: unknown) {
  if (!body || typeof body !== "object") throw new NoteError("Invalid note.");
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !/^[a-f0-9-]{36}$/.test(b.id)) throw new NoteError("Invalid note id.");
  if (b.revision !== null && (typeof b.revision !== "string" || !/^[a-f0-9-]{36}$/.test(b.revision))) throw new NoteError("Missing note revision.");
  if (b.action === "delete") return { action: "delete" as const, id: b.id, revision: b.revision };
  if (b.action !== "save" || typeof b.week !== "string" || !WEEKS.has(b.week) || typeof b.text !== "string" || b.text.length > 4000 || typeof b.color !== "string" || !COLORS.has(b.color)) throw new NoteError("Invalid note. Use up to 4,000 characters.");
  if (typeof b.x !== "number" || typeof b.y !== "number" || !Number.isFinite(b.x) || !Number.isFinite(b.y) || Math.abs(b.x) > 6 || Math.abs(b.y) > 3.5) throw new NoteError("Move the note closer to its week.");
  return { action: "save" as const, id: b.id, revision: b.revision, week: b.week, text: b.text, color: b.color, x: b.x, y: b.y };
}
export async function changeNote(body: unknown) {
  const change = validateChange(body);
  for (let attempt = 0; attempt < 4; attempt++) {
    const board = await readBoard();
    const current = board.notes.find(n => n.id === change.id);
    if ((current?.revision ?? null) !== change.revision) throw new NoteError("This note changed on another device.", 409, current ?? null);
    if (change.action === "delete" && !current) throw new NoteError("This note was already removed.", 409, null);
    if (change.action === "save" && !current && (board.notes.length >= 288 || board.notes.filter(n => n.week === change.week).length >= 24)) throw new NoteError("This week has 24 notes. Remove one to make room.");
    const note: Note | null = change.action === "delete" ? null : {
      id: change.id, week: change.week, text: change.text, color: change.color, x: change.x, y: change.y,
      revision: randomUUID(), updatedAt: new Date().toISOString(),
    };
    const notes = note && current ? board.notes.map(n => n.id === note.id ? note : n) : board.notes.filter(n => n.id !== change.id);
    if (note && !current) notes.push(note);
    try {
      await put(PATH, JSON.stringify({ version: 1, notes }), { access: "private", addRandomSuffix: false,
        allowOverwrite: Boolean(board.etag), ...(board.etag ? { ifMatch: board.etag } : {}), contentType: "application/json" });
      return note;
    } catch (error) {
      // A different note may have changed: merge into the fresh document.
      // A change to THIS note is rejected at the revision check above.
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }
  throw new NoteError("Notes are busy. Try saving again.", 409);
}
