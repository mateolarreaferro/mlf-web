import { hmac, redis, usesSecret } from "@/lib/hosted";

/*
  The open wall at /sticky-notes: anyone may leave a text note, signed with
  a name or anonymous. This is the whole store and its rules;
  src/app/api/sticky-notes/[...op]/route.ts is the HTTP face. It has nothing
  to do with Mateo and Marielisa's private wall, which lives in Firebase and
  is never reached from here.

  Notes live in Upstash Redis, one hash per environment (production, preview
  and local dev never share a wall), with a version counter the browser polls
  so an unchanged wall costs one small read. A visitor is a random token
  their browser keeps; the store holds only a keyed hash of it, which is how a
  note knows its author without knowing who that is.
*/

export const LIMITS = { content: 1000, name: 40, notes: 1000, createsPerHour: 10 };
const COLORS = ["#FFF8E7", "#FFE8D6", "#FFD6D6", "#E8D6FF", "#D6FFE8", "#D6EDFF", "#FFF5CC", "#FFD1C1", "#D6EBD6", "#E8D6F0"];
const SIZES = [180, 240, 320];
export const REACTIONS = ["heart", "smile", "flame", "sparkle", "abrazo", "teardrop"];

type Stored = {
  id: string;
  content: string;
  authorName?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  replyTo?: string;
  createdAt: number;
  updatedAt: number;
  owner: string;
  reactions: Record<string, string[]>;
};

/** Everything the wall can refuse with, in English and Spanish. */
const MESSAGES = {
  empty: ["Write something on the note.", "Escribe algo en la nota."],
  tooLong: ["A note holds {n} characters.", "Una nota cabe en {n} caracteres."],
  badPosition: ["That position does not work.", "Posición no válida."],
  badSize: ["That size does not work.", "Tamaño no válido."],
  badColor: ["That color does not work.", "Color no válido."],
  badNote: ["That note does not work.", "Nota no válida."],
  badName: ["That name does not work.", "Nombre no válido."],
  badChange: ["That change does not work.", "Cambio no válido."],
  badReaction: ["That reaction does not work.", "Reacción no válida."],
  full: ["The wall is full for now.", "El muro está lleno por ahora."],
  tooManyNotes: ["You have left several notes. Come back in a while.", "Ya dejaste varias notas. Vuelve en un rato."],
  tooManyChanges: ["Too many changes. Wait a little.", "Demasiados cambios. Espera un poco."],
  tooManyReactions: ["Too many reactions. Wait a little.", "Demasiadas reacciones. Espera un poco."],
  exists: ["That note already exists.", "Esa nota ya existe."],
  gone: ["That note is gone.", "Esa nota ya no está."],
  notYoursChange: ["Only the person who wrote a note can change it.", "Solo quien escribió la nota puede cambiarla."],
  notYoursDelete: ["Only the person who wrote a note can delete it.", "Solo quien escribió la nota puede borrarla."],
  offsite: ["Do that from the site.", "Hazlo desde el sitio."],
  reload: ["Reload the page and try again.", "Recarga la página e intenta otra vez."],
  notFound: ["Not found.", "No encontrado."],
  down: ["The wall is not answering right now. Try again.", "El muro no responde ahora mismo. Intenta otra vez."],
  moderate: ["Moderate sticky notes", "Moderar sticky notes"],
} as const;

export type MessageKey = keyof typeof MESSAGES;

/** A refusal in the visitor's language: Spanish when the page says es, English otherwise. */
export function say(request: Request, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const [en, es] = MESSAGES[key];
  const text = request.headers.get("x-wall-lang") === "es" ? es : en;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export class WallError extends Error {
  constructor(public key: MessageKey, public status = 400, public vars: Record<string, string | number> = {}) {
    super(key);
  }
}

const prefix = `wall:${process.env.VERCEL_ENV ?? "dev"}`;
const NOTES = `${prefix}:notes`;
const VERSION = `${prefix}:version`;

// Without Redis (local dev with no variables) the wall lives in memory.
const memory = { notes: new Map<string, string>(), version: 0, rates: new Map<string, { n: number; until: number }>() };

const store = {
  async all(): Promise<Stored[]> {
    const raw = redis ? ((await redis.hgetall<Record<string, Stored>>(NOTES)) ?? {}) : Object.fromEntries([...memory.notes].map(([k, v]) => [k, JSON.parse(v)]));
    return Object.values(raw);
  },
  async get(id: string): Promise<Stored | null> {
    if (redis) return (await redis.hget<Stored>(NOTES, id)) ?? null;
    const raw = memory.notes.get(id);
    return raw ? JSON.parse(raw) : null;
  },
  async count(): Promise<number> {
    return redis ? redis.hlen(NOTES) : memory.notes.size;
  },
  async put(note: Stored, onlyIfNew = false): Promise<boolean> {
    let written = true;
    if (redis) {
      written = onlyIfNew ? Boolean(await redis.hsetnx(NOTES, note.id, note)) : (await redis.hset(NOTES, { [note.id]: note }), true);
    } else if (!onlyIfNew || !memory.notes.has(note.id)) memory.notes.set(note.id, JSON.stringify(note));
    else written = false;
    if (written) await this.bump();
    return written;
  },
  async remove(id: string): Promise<void> {
    if (redis) await redis.hdel(NOTES, id);
    else memory.notes.delete(id);
    await this.bump();
  },
  async version(): Promise<number> {
    return redis ? Number(await redis.get(VERSION)) || 0 : memory.version;
  },
  async bump(): Promise<void> {
    if (redis) await redis.incr(VERSION);
    else memory.version++;
  },
  /** Counts an action against a one-hour window; false once over `limit`. */
  async rate(key: string, limit: number): Promise<boolean> {
    const full = `${prefix}:rate:${key}`;
    if (redis) {
      const [n] = await redis.multi().incr(full).expire(full, 3600, "NX").exec<[number, number]>();
      return n <= limit;
    }
    const now = Date.now();
    const entry = memory.rates.get(full);
    const n = entry && entry.until > now ? entry.n + 1 : 1;
    memory.rates.set(full, { n, until: entry && entry.until > now ? entry.until : now + 3_600_000 });
    return n <= limit;
  },
};

/** The visitor's token, hashed: their identity on this wall. Null for a missing or malformed token. */
export function visitorHash(request: Request): string | null {
  const token = request.headers.get("x-wall-visitor") ?? "";
  return /^[0-9a-f]{32}$/.test(token) ? hmac(usesSecret() || "mlf", `wall.${token}`) : null;
}

/** A note as one visitor sees it: no owner hash, `mine` instead, and their own reactions as "me". */
function view(note: Stored, me: string | null) {
  const { owner, reactions, ...rest } = note;
  const shown: Record<string, string[]> = {};
  for (const [type, ids] of Object.entries(reactions ?? {})) shown[type] = ids.map((id) => (id === me ? "me" : id.slice(0, 10)));
  return { ...rest, mine: owner === me, reactions: shown };
}

export async function listNotes(me: string | null, since: number) {
  const version = await store.version();
  if (since === version) return { version, unchanged: true };
  const notes = (await store.all()).sort((a, b) => a.createdAt - b.createdAt).map((n) => view(n, me));
  return { version, notes };
}

const finite = (v: unknown, limit: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;
// Control characters out, line breaks and tabs kept.
const clean = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

function text(v: unknown): string {
  if (typeof v !== "string") throw new WallError("empty");
  const content = clean(v).trim();
  if (!content) throw new WallError("empty");
  if (content.length > LIMITS.content) throw new WallError("tooLong", 400, { n: LIMITS.content });
  return content;
}

function placement(body: Record<string, unknown>, partial: boolean) {
  const out: Partial<Stored> = {};
  for (const key of ["x", "y"] as const) {
    if (key in body) {
      if (!finite(body[key], 1e6)) throw new WallError("badPosition");
      out[key] = body[key] as number;
    } else if (!partial) throw new WallError("badPosition");
  }
  for (const key of ["width", "height"] as const) {
    if (key in body) {
      if (!SIZES.includes(body[key] as number)) throw new WallError("badSize");
      out[key] = body[key] as number;
    } else if (!partial) out[key] = 240;
  }
  if ("color" in body) {
    if (!COLORS.includes(body.color as string)) throw new WallError("badColor");
    out.color = body.color as string;
  } else if (!partial) out.color = COLORS[0];
  return out;
}

export async function createNote(me: string, ipKey: string, body: Record<string, unknown>) {
  const id = body.id;
  if (typeof id !== "string" || !/^[0-9a-f]{24}$/.test(id)) throw new WallError("badNote");
  const content = text(body.content);
  let authorName: string | undefined;
  if (body.authorName !== undefined && body.authorName !== null) {
    if (typeof body.authorName !== "string") throw new WallError("badName");
    authorName = clean(body.authorName).replace(/\s+/g, " ").trim().slice(0, LIMITS.name) || undefined;
  }
  const replyTo = typeof body.replyTo === "string" && /^[0-9a-f]{24}$/.test(body.replyTo) ? body.replyTo : undefined;
  if ((await store.count()) >= LIMITS.notes) throw new WallError("full", 507);
  if (!(await store.rate(`create:${ipKey}`, LIMITS.createsPerHour))) throw new WallError("tooManyNotes", 429);
  const now = Date.now();
  const note: Stored = {
    id, content, authorName, replyTo,
    ...(placement(body, false) as Pick<Stored, "x" | "y" | "width" | "height" | "color">),
    rotation: finite(body.rotation, 6) ? (body.rotation as number) : 0,
    createdAt: now, updatedAt: now, owner: me, reactions: {},
  };
  if (!(await store.put(note, true))) throw new WallError("exists", 409);
  return view(note, me);
}

export async function updateNote(me: string, id: string, body: Record<string, unknown>) {
  const note = await store.get(id);
  if (!note) throw new WallError("gone", 404);
  if (note.owner !== me) throw new WallError("notYoursChange", 403);
  const next: Stored = { ...note, ...placement(body, true), updatedAt: Date.now() };
  if ("content" in body) next.content = text(body.content);
  await store.put(next);
  return view(next, me);
}

export async function deleteNote(me: string | null, id: string, moderator: boolean) {
  const note = await store.get(id);
  if (!note) return;
  if (!moderator && note.owner !== me) throw new WallError("notYoursDelete", 403);
  await store.remove(id);
}

export async function react(me: string, id: string, type: unknown) {
  if (typeof type !== "string" || !REACTIONS.includes(type)) throw new WallError("badReaction");
  const note = await store.get(id);
  if (!note) throw new WallError("gone", 404);
  const ids = note.reactions?.[type] ?? [];
  const reactions = { ...note.reactions, [type]: ids.includes(me) ? ids.filter((v) => v !== me) : [...ids, me] };
  if (!reactions[type].length) delete reactions[type];
  const next = { ...note, reactions };
  await store.put(next);
  return view(next, me);
}
