import { hmac, redis, usesSecret } from "@/lib/hosted";

/*
  The Ansantuario open wall at /ansantuario: anyone may leave a text note,
  signed with a name or anonymous. This is the whole store and its rules;
  src/app/api/ansantuario/[...op]/route.ts is the HTTP face. It has nothing
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

export class WallError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
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
  if (typeof v !== "string") throw new WallError("Escribe algo en la nota.");
  const content = clean(v).trim();
  if (!content) throw new WallError("Escribe algo en la nota.");
  if (content.length > LIMITS.content) throw new WallError(`Una nota cabe en ${LIMITS.content} caracteres.`);
  return content;
}

function placement(body: Record<string, unknown>, partial: boolean) {
  const out: Partial<Stored> = {};
  for (const key of ["x", "y"] as const) {
    if (key in body) {
      if (!finite(body[key], 1e6)) throw new WallError("Posición no válida.");
      out[key] = body[key] as number;
    } else if (!partial) throw new WallError("Posición no válida.");
  }
  for (const key of ["width", "height"] as const) {
    if (key in body) {
      if (!SIZES.includes(body[key] as number)) throw new WallError("Tamaño no válido.");
      out[key] = body[key] as number;
    } else if (!partial) out[key] = 240;
  }
  if ("color" in body) {
    if (!COLORS.includes(body.color as string)) throw new WallError("Color no válido.");
    out.color = body.color as string;
  } else if (!partial) out.color = COLORS[0];
  return out;
}

export async function createNote(me: string, ipKey: string, body: Record<string, unknown>) {
  const id = body.id;
  if (typeof id !== "string" || !/^[0-9a-f]{24}$/.test(id)) throw new WallError("Nota no válida.");
  const content = text(body.content);
  let authorName: string | undefined;
  if (body.authorName !== undefined && body.authorName !== null) {
    if (typeof body.authorName !== "string") throw new WallError("Nombre no válido.");
    authorName = clean(body.authorName).replace(/\s+/g, " ").trim().slice(0, LIMITS.name) || undefined;
  }
  const replyTo = typeof body.replyTo === "string" && /^[0-9a-f]{24}$/.test(body.replyTo) ? body.replyTo : undefined;
  if ((await store.count()) >= LIMITS.notes) throw new WallError("El muro está lleno por ahora.", 507);
  if (!(await store.rate(`create:${ipKey}`, LIMITS.createsPerHour))) throw new WallError("Ya dejaste varias notas. Vuelve en un rato.", 429);
  const now = Date.now();
  const note: Stored = {
    id, content, authorName, replyTo,
    ...(placement(body, false) as Pick<Stored, "x" | "y" | "width" | "height" | "color">),
    rotation: finite(body.rotation, 6) ? (body.rotation as number) : 0,
    createdAt: now, updatedAt: now, owner: me, reactions: {},
  };
  if (!(await store.put(note, true))) throw new WallError("Esa nota ya existe.", 409);
  return view(note, me);
}

export async function updateNote(me: string, id: string, body: Record<string, unknown>) {
  const note = await store.get(id);
  if (!note) throw new WallError("Esa nota ya no está.", 404);
  if (note.owner !== me) throw new WallError("Solo quien escribió la nota puede cambiarla.", 403);
  const next: Stored = { ...note, ...placement(body, true), updatedAt: Date.now() };
  if ("content" in body) next.content = text(body.content);
  await store.put(next);
  return view(next, me);
}

export async function deleteNote(me: string | null, id: string, moderator: boolean) {
  const note = await store.get(id);
  if (!note) return;
  if (!moderator && note.owner !== me) throw new WallError("Solo quien escribió la nota puede borrarla.", 403);
  await store.remove(id);
}

export async function react(me: string, id: string, type: unknown) {
  if (typeof type !== "string" || !REACTIONS.includes(type)) throw new WallError("Reacción no válida.");
  const note = await store.get(id);
  if (!note) throw new WallError("Esa nota ya no está.", 404);
  const ids = note.reactions?.[type] ?? [];
  const reactions = { ...note.reactions, [type]: ids.includes(me) ? ids.filter((v) => v !== me) : [...ids, me] };
  if (!reactions[type].length) delete reactions[type];
  const next = { ...note, reactions };
  await store.put(next);
  return view(next, me);
}
