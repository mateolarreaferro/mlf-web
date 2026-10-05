import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAsk, getPerson, secret, type Ask, type Person } from "./store";

/*
  Who may see what in the capsule. Three kinds of visitor:

  - a friend, logged in with their username and password (a session cookie);
  - the admin, Mateo, with CAPSULA_ADMIN_PASSWORD (its own cookie, keyed on
    the password so changing it signs the admin out everywhere);
  - a friend the owner let in: they asked to read the capsule from the
    circle page and the owner accepted. Read only, never write, and the owner
    can take it back at any time.

  Every capsule is closed to everyone else. There is no "public". Every
  cookie is signed with CAPSULA_KEY and carries the person's password
  version, so a new password closes every session made with the old one.
  Accepted requests live in the store (store.ts, asks:<username>), not in a
  cookie, so they follow the friend to any browser and end when the owner
  says so, not when a password changes.
*/

const SESSION = "capsula_session";
const ADMIN = "capsula_admin";
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

/* ---------- who may read ---------- */

export type Access = "owner" | "admin" | "invited";

/**
 * How the current visitor may see `person`'s capsule, or null when they may
 * not. Only "owner" and "admin" may write.
 */
export async function access(person: Person): Promise<Access | null> {
  const [viewer, admin] = await Promise.all([me(), isAdmin()]);
  if (viewer?.username === person.username) return "owner";
  if (admin) return "admin";
  if (!viewer) return null;
  return (await getAsk(person.username, viewer.username))?.status === "aceptada" ? "invited" : null;
}

export const canWrite = (a: Access | null) => a === "owner" || a === "admin";

/** Where `viewer` stands with each of `people`: asked, let in, or nothing yet. */
export async function standing(viewer: Person, people: Person[]): Promise<Map<string, Ask["status"]>> {
  const held = await Promise.all(people.map(async (p) => [p.username, (await getAsk(p.username, viewer.username))?.status] as const));
  return new Map(held.filter((h): h is [string, Ask["status"]] => Boolean(h[1])));
}
