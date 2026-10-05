import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getPerson, secret, type Person } from "./store";

/*
  Who may see what in the capsule. Three kinds of visitor:

  - a friend, logged in with their username and password (a session cookie);
  - the admin, Mateo, with CAPSULA_ADMIN_PASSWORD (its own cookie, keyed on
    the password so changing it signs the admin out everywhere);
  - a friend who also typed someone else's password, which earns a view key
    for that one capsule: read only, never write.

  Every capsule is closed to everyone else: the circle page lists who is in
  the capsule, but reading someone's capsule takes the password they chose to
  share. There is no "public". Every cookie is signed with
  CAPSULA_KEY and carries the person's password version, so a new password
  closes every session and view key made with the old one.
*/

const SESSION = "capsula_session";
const ADMIN = "capsula_admin";
const VIEWS = "capsula_views";
const DAYS = 24 * 3600;
const SESSION_AGE = 90 * DAYS;
const ADMIN_AGE = 30 * DAYS;

const sign = (what: string, payload: string) => createHmac("sha256", secret()).update(`capsula.${what}.${payload}`).digest("base64url");

function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const pack = (what: string, value: unknown) => {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(what, payload)}`;
};

function unpack<T>(what: string, cookie: string | undefined): T | null {
  const [payload, signature] = (cookie ?? "").split(".");
  if (!payload || !signature || !equal(signature, sign(what, payload))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

const options = (maxAge: number) => ({
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge, path: "/",
});

/* ---------- the logged-in friend ---------- */

export async function me(): Promise<Person | null> {
  const session = unpack<{ u: string; v: number; exp: number }>(SESSION, (await cookies()).get(SESSION)?.value);
  if (!session || session.exp < Date.now()) return null;
  const person = await getPerson(session.u);
  return person && person.version === session.v ? person : null;
}

export async function startSession(person: Person) {
  (await cookies()).set(SESSION, pack(SESSION, { u: person.username, v: person.version, exp: Date.now() + SESSION_AGE * 1000 }), options(SESSION_AGE));
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(VIEWS);
  jar.delete(ADMIN);
}

/* ---------- the admin ---------- */

const adminStamp = () => {
  const password = process.env.CAPSULA_ADMIN_PASSWORD;
  return password ? createHash("sha256").update(password).digest("base64url") : null;
};

export function adminPasswordMatches(attempt: string) {
  const password = process.env.CAPSULA_ADMIN_PASSWORD;
  if (!password) return false;
  const a = createHash("sha256").update(attempt).digest("base64url");
  return equal(a, createHash("sha256").update(password).digest("base64url"));
}

export async function isAdmin(): Promise<boolean> {
  const stamp = adminStamp();
  const held = unpack<{ s: string; exp: number }>(ADMIN, (await cookies()).get(ADMIN)?.value);
  return Boolean(stamp && held && held.exp > Date.now() && equal(held.s, stamp));
}

export async function startAdmin() {
  (await cookies()).set(ADMIN, pack(ADMIN, { s: adminStamp(), exp: Date.now() + ADMIN_AGE * 1000 }), options(ADMIN_AGE));
}

/* ---------- view keys ---------- */

type Key = { u: string; v: number };

async function viewKeys(): Promise<Key[]> {
  return unpack<Key[]>(VIEWS, (await cookies()).get(VIEWS)?.value) ?? [];
}

/** Remembers that this browser knows `person`'s password, for reading only. */
export async function addViewKey(person: Person) {
  const keys = (await viewKeys()).filter((k) => k.u !== person.username).slice(-40);
  keys.push({ u: person.username, v: person.version });
  (await cookies()).set(VIEWS, pack(VIEWS, keys), options(SESSION_AGE));
}

export type Access = "owner" | "admin" | "key";

/**
 * How the current visitor may see `person`'s capsule, or null when they may
 * not. Only "owner" and "admin" may write.
 */
export async function access(person: Person): Promise<Access | null> {
  const [viewer, admin] = await Promise.all([me(), isAdmin()]);
  if (viewer?.username === person.username) return "owner";
  if (admin) return "admin";
  if (!viewer) return null;
  const keys = await viewKeys();
  return keys.some((k) => k.u === person.username && k.v === person.version) ? "key" : null;
}

export const canWrite = (a: Access | null) => a === "owner" || a === "admin";

/** Whether this browser holds a still-valid view key for each of `people`, without a lookup per person. */
export async function openTo(people: Person[]): Promise<Set<string>> {
  const keys = await viewKeys();
  return new Set(people.filter((p) => keys.some((k) => k.u === p.username && k.v === p.version)).map((p) => p.username));
}
