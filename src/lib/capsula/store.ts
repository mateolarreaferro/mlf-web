import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { UIMessage } from "ai";

/*
  Everything the capsule keeps, and the only module that touches Redis.

  The capsule holds friends' interviews: who they love, what they fear,
  what they cried about. So every value is sealed with AES-256-GCM under
  CAPSULA_KEY before it reaches Upstash, and a leaked database token reveals
  nothing readable. Lose the key and the capsule is unreadable too, so it is
  never rotated casually. Recordings and original files sit in the private
  Blob store (paths under capsula/<env>/), referenced from their entry.

  Keys, under capsula:<VERCEL_ENV|dev> so production, preview and local dev
  never share a capsule:
    people              hash  username -> Person
    entries:<username>  hash  id -> Entry
    draft:<username>    value the interview in progress
    insight:<username>  value the themes map and reading (insight.ts), cached
    asks:<username>     hash  requester username -> Ask, who asked to read this capsule
    rate:<what>         counters with an expiry
*/

export type Person = {
  username: string;
  name: string;
  createdAt: number;
  /** Bumped on every new password: signs out sessions made with the old one. */
  version: number;
  passwordHash: string;
  /** The password itself, sealed, so the admin can hand it out again. */
  passwordSealed: string;
};

export type Answer = { questionId: string | null; question: string; answer: string };

export type Source = "entrevista" | "hoja" | "audio" | "texto";

export type Entry = {
  id: string;
  /** The capsule's round: the year these answers belong to. */
  round: number;
  /** When it was recorded, YYYY-MM-DD. */
  date: string;
  source: Source;
  answers: Answer[];
  summary?: string;
  /** The interview or recording as text, kept whole. */
  transcript?: string;
  files?: { pathname: string; name: string; type: string }[];
  createdAt: number;
};

export type Mode = "guiada" | "conversacion";

/** One plain fact on a person's map (insight.ts): someone, somewhere, something that happened or that they like. */
export type Point = {
  id: string;
  label: string;
  kind: "personas" | "lugares" | "vida" | "gustos";
  /** 1 (mentioned once) to 5 (comes up again and again). */
  weight: number;
  note: string;
  rounds: number[];
  quotes: { round: number; text: string }[];
};

export type Insight = {
  /** The shape it was made in; insight.ts re-reads older ones. */
  v: number;
  /** Which entries it was read from; when they change it is stale. */
  fingerprint: string;
  /** The map's few plain sentences. */
  overview: string;
  points: Point[];
  links: { a: string; b: string; label: string }[];
  /** "lo que veo": the letter from the agent instructed to read them as a loving psychologist. */
  reading: string;
  createdAt: number;
};

/** A friend asking to read someone's capsule; "aceptada" once the owner said yes, until they take it back. */
export type Ask = { from: string; at: number; status: "pendiente" | "aceptada" };

export type Draft = { mode: Mode; round: number; messages: UIMessage[]; startedAt: number; updatedAt: number };

export const ENV = process.env.VERCEL_ENV ?? "dev";
const prefix = `capsula:${ENV}`;

/** Upstash, read raw: values are sealed strings, never JSON to parse. */
const redis = (() => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
})();

// Without Redis (local dev with no variables) the capsule lives in memory and is gone on restart.
const memory = new Map<string, Map<string, string> | string>();
const hash = (key: string) => {
  let h = memory.get(key);
  if (!(h instanceof Map)) memory.set(key, (h = new Map()));
  return h;
};

const kv = {
  hget: async (key: string, field: string) =>
    redis ? ((await redis.hget<string>(key, field)) ?? null) : (hash(key).get(field) ?? null),
  hgetall: async (key: string): Promise<Record<string, string>> =>
    redis ? ((await redis.hgetall<Record<string, string>>(key)) ?? {}) : Object.fromEntries(hash(key)),
  hset: async (key: string, field: string, value: string) => {
    if (redis) await redis.hset(key, { [field]: value });
    else hash(key).set(field, value);
  },
  hsetnx: async (key: string, field: string, value: string) => {
    if (redis) return Boolean(await redis.hsetnx(key, field, value));
    if (hash(key).has(field)) return false;
    hash(key).set(field, value);
    return true;
  },
  hdel: async (key: string, field: string) => {
    if (redis) await redis.hdel(key, field);
    else hash(key).delete(field);
  },
  get: async (key: string) => (redis ? ((await redis.get<string>(key)) ?? null) : ((memory.get(key) as string) ?? null)),
  set: async (key: string, value: string) => {
    if (redis) await redis.set(key, value);
    else memory.set(key, value);
  },
  del: async (key: string) => {
    if (redis) await redis.del(key);
    else memory.delete(key);
  },
};

/* ---------- sealing ---------- */

export function secret(): string {
  const key = process.env.CAPSULA_KEY;
  if (!key) throw new Error("CAPSULA_KEY is not set");
  return key;
}

const sealKey = () => createHash("sha256").update(`capsula.seal.${secret()}`).digest();

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal<T>(sealed: string | null): T | null {
  if (!sealed) return null;
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1") return null;
  const decipher = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(text) as T;
}

/* ---------- passwords ---------- */

// Easy to read aloud and to type on a phone: two words and a number.
const WORDS = (
  "agua aire alba arena arce astro bahia barco bosque brisa cacao cafe cedro cielo cima cobre cometa coral " +
  "cuarzo duna eco faro flor fuego grano hoja isla jade lago lana laurel lima lirio luna lluvia malva mango " +
  "mar menta miel monte musgo nido niebla nube ola olivo onda oro palma pino playa pluma polen puerto quinua " +
  "raiz rama rio roble roca rocio sal salvia selva sol tierra trigo trueno valle vela verano viento volcan"
).split(" ");

export function newPassword(): string {
  const a = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a) b = WORDS[randomInt(WORDS.length)];
  return `${a}-${b}-${randomInt(10, 100)}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `s1.${salt.toString("base64url")}.${scryptSync(password, salt, 32).toString("base64url")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [version, salt, expected] = stored.split(".");
  if (version !== "s1") return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), 32);
  const want = Buffer.from(expected, "base64url");
  return actual.length === want.length && timingSafeEqual(actual, want);
}

/* ---------- people ---------- */

const PEOPLE = `${prefix}:people`;

export const USERNAME = /^[a-z0-9][a-z0-9.\-]{0,31}$/;

/** "Isabel Ponce" -> "isabel.ponce": lowercase, no accents, dots between names. */
export function usernameFor(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".");
}

export async function getPerson(username: string): Promise<Person | null> {
  if (!USERNAME.test(username)) return null;
  return unseal<Person>(await kv.hget(PEOPLE, username));
}

export async function listPeople(): Promise<Person[]> {
  const all = await kv.hgetall(PEOPLE);
  return Object.values(all)
    .map((v) => unseal<Person>(v)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Makes a profile and its first password. Null when the username is taken. */
export async function createPerson(name: string, username: string): Promise<{ person: Person; password: string } | null> {
  const password = newPassword();
  const person: Person = {
    username, name, createdAt: Date.now(), version: 1,
    passwordHash: hashPassword(password), passwordSealed: seal(password),
  };
  return (await kv.hsetnx(PEOPLE, username, seal(person))) ? { person, password } : null;
}

export async function savePerson(person: Person) {
  await kv.hset(PEOPLE, person.username, seal(person));
}

export async function resetPassword(person: Person): Promise<string> {
  const password = newPassword();
  await savePerson({ ...person, version: person.version + 1, passwordHash: hashPassword(password), passwordSealed: seal(password) });
  return password;
}

export const revealPassword = (person: Person) => unseal<string>(person.passwordSealed);

/** Removes the profile, its entries, draft, reading and requests. Its files stay in Blob until deleted there. */
export async function removePerson(username: string) {
  await kv.hdel(PEOPLE, username);
  for (const what of ["entries", "draft", "insight", "asks"]) await kv.del(`${prefix}:${what}:${username}`);
  await moveAsks(username, null);
}

/**
 * A new name, and optionally a new username, which moves everything that
 * hangs off the old one. The password stays; sessions under the old username
 * end. Files keep their Blob paths: entries point at them by path.
 */
export async function renamePerson(person: Person, name: string, username: string): Promise<boolean> {
  // The letter speaks to them by name: a new first name means reading it again.
  if (name.split(" ")[0] !== person.name.split(" ")[0]) await kv.del(`${prefix}:insight:${person.username}`);
  if (username === person.username) {
    await savePerson({ ...person, name });
    return true;
  }
  if (!(await kv.hsetnx(PEOPLE, username, seal({ ...person, name, username })))) return false;
  for (const [field, value] of Object.entries(await kv.hgetall(ENTRIES(person.username)))) {
    await kv.hset(ENTRIES(username), field, value);
  }
  for (const what of ["draft", "insight"]) {
    const value = await kv.get(`${prefix}:${what}:${person.username}`);
    if (value) await kv.set(`${prefix}:${what}:${username}`, value);
  }
  for (const [field, value] of Object.entries(await kv.hgetall(ASKS(person.username)))) {
    await kv.hset(ASKS(username), field, value);
  }
  await moveAsks(person.username, username);
  await removePerson(person.username);
  return true;
}

/* ---------- requests to read ---------- */

const ASKS = (username: string) => `${prefix}:asks:${username}`;

const valid = (...names: string[]) => names.every((n) => USERNAME.test(n));

export const getAsk = async (owner: string, from: string) =>
  valid(owner, from) ? unseal<Ask>(await kv.hget(ASKS(owner), from)) : null;

/** Everyone who asked to read `owner`'s capsule, oldest first. */
export async function listAsks(owner: string): Promise<Ask[]> {
  return Object.values(await kv.hgetall(ASKS(owner))).map((v) => unseal<Ask>(v)!).filter(Boolean).sort((a, b) => a.at - b.at);
}

/** Asks once; asking again leaves a pending or accepted request as it is. */
export async function ask(owner: string, from: string): Promise<Ask> {
  const fresh: Ask = { from, at: Date.now(), status: "pendiente" };
  return (await kv.hsetnx(ASKS(owner), from, seal(fresh))) ? fresh : (await getAsk(owner, from)) ?? fresh;
}

export async function acceptAsk(owner: string, from: string): Promise<boolean> {
  const held = await getAsk(owner, from);
  if (!held) return false;
  await kv.hset(ASKS(owner), from, seal({ ...held, status: "aceptada" }));
  return true;
}

/** Declining, withdrawing and taking back access are all the same: the request is gone. */
export async function dropAsk(owner: string, from: string) {
  if (valid(owner, from)) await kv.hdel(ASKS(owner), from);
}

/** Re-files `username`'s requests to everyone else under `to`, or drops them when `to` is null. */
async function moveAsks(username: string, to: string | null) {
  await Promise.all((await listPeople()).map(async (p) => {
    const held = await getAsk(p.username, username);
    if (!held) return;
    await kv.hdel(ASKS(p.username), username);
    if (to) await kv.hset(ASKS(p.username), to, seal({ ...held, from: to }));
  }));
}

/* ---------- entries ---------- */

const ENTRIES = (username: string) => `${prefix}:entries:${username}`;

export async function listEntries(username: string): Promise<Entry[]> {
  const all = await kv.hgetall(ENTRIES(username));
  return Object.values(all)
    .map((v) => unseal<Entry>(v)!)
    .filter(Boolean)
    .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date));
}

export async function getEntry(username: string, id: string) {
  return unseal<Entry>(await kv.hget(ENTRIES(username), id));
}

export async function addEntry(username: string, entry: Omit<Entry, "id" | "createdAt">): Promise<Entry> {
  const full: Entry = { ...entry, id: randomBytes(8).toString("hex"), createdAt: Date.now() };
  await kv.hset(ENTRIES(username), full.id, seal(full));
  return full;
}

/** Writes an entry back as it is, keeping its id and when it was made. */
export async function saveEntry(username: string, entry: Entry) {
  await kv.hset(ENTRIES(username), entry.id, seal(entry));
}

export async function removeEntry(username: string, id: string) {
  await kv.hdel(ENTRIES(username), id);
}

/* ---------- the interview in progress ---------- */

const DRAFT = (username: string) => `${prefix}:draft:${username}`;

export const getDraft = async (username: string) => unseal<Draft>(await kv.get(DRAFT(username)));
export const saveDraft = (username: string, draft: Draft) => kv.set(DRAFT(username), seal(draft));
export const dropDraft = (username: string) => kv.del(DRAFT(username));

/* ---------- the reading ---------- */

export const fingerprint = (entries: Entry[]) => entries.map((e) => `${e.id}.${e.createdAt}`).sort().join(",");
export const getInsight = async (username: string) => unseal<Insight>(await kv.get(`${prefix}:insight:${username}`));
export const saveInsight = (username: string, insight: Insight) => kv.set(`${prefix}:insight:${username}`, seal(insight));

/* ---------- limits ---------- */

/** Counts one more against `key` for `seconds`; false once past `limit`. */
export async function within(key: string, limit: number, seconds: number): Promise<boolean> {
  const full = `${prefix}:rate:${key}`;
  if (redis) {
    const [n] = await redis.multi().incr(full).expire(full, seconds, "NX").exec<[number, number]>();
    return n <= limit;
  }
  const n = Number((memory.get(full) as string) ?? 0) + 1;
  memory.set(full, String(n));
  setTimeout(() => memory.delete(full), seconds * 1000).unref?.();
  return n <= limit;
}

/** Where a person's files go in the private Blob store. */
export const blobPrefix = (username: string) => `capsula/${ENV}/${username}/`;
