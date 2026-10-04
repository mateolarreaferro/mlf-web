import { createHmac, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { cookies } from "next/headers";
import { Redis } from "@upstash/redis";

/*
  What every hosted project's API route shares (see "Hosted projects" in
  CLAUDE.md). A route checks the caller, spends from a budget, and hands the
  call to that project's own Python code through `runWorker`: on Vercel a
  signed request to api/demo-worker.py, under `next dev` a spawned interpreter
  running the same python/<slug>/bridge.py. Server only.
*/

export const noStore = { "Cache-Control": "no-store" };

/** Every model call on the site bills to this one key. */
export const modelReady = () => Boolean(process.env.ANTHROPIC_API_KEY);

export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return origin.host === request.headers.get("host") && origin.protocol === new URL(request.url).protocol;
  } catch {
    return false; // Missing and opaque origins are rejected.
  }
}

export const visitor = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

/**
 * A counter per visitor with a ceiling for everyone together. Lightweight
 * per-instance protection, not a durable account-wide spend cap.
 */
export function budget({ each, all, window }: { each: number; all: number; window: number }) {
  const buckets = new Map<string, { count: number; until: number }>();
  return function admit(ip: string) {
    const now = Date.now();
    let total = 0;
    for (const [key, bucket] of buckets) {
      if (bucket.until <= now) buckets.delete(key);
      else total += bucket.count;
    }
    const bucket = buckets.get(ip) ?? { count: 0, until: now + window };
    if (bucket.count >= each || total >= all || buckets.size > 5000) return false;
    bucket.count++;
    buckets.set(ip, bucket);
    return true;
  };
}

/*
  The free allowance. Every visitor gets FREE_USES model calls in total,
  shared by the agent chat, Theo and HeadWave; past that, a call needs the
  password (MODEL_PASSWORD), which /api/unlock trades for a 30-day cookie.
  A use is counted twice, by IP address and in a signed cookie, and the higher
  count wins: clearing cookies does not reset it, and neither does a new
  network while the cookie is kept. The IP count is kept in Upstash Redis
  (connected through the Vercel Marketplace, KV_REST_API_*), under a keyed
  hash of the address rather than the address itself, for thirty days. Without
  those variables, as in local dev, it falls back to this instance's memory.
*/

const FREE_USES = 3;
const USES_COOKIE = "mlf_uses";
export const UNLOCK_COOKIE = "mlf_unlock";
const MONTH = 30 * 24 * 3600;

/** Upstash Redis (Vercel Marketplace), or null when it is not connected, as in local dev without its variables. */
export const redis = (() => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
})();

/** The per-IP counter: Redis when connected, this instance's memory otherwise. */
const counter = (() => {
  if (redis) {
    return {
      get: async (key: string) => Number(await redis.get(key)) || 0,
      // Atomic, so two calls arriving together cannot both take the last use.
      incr: async (key: string) => {
        const [count] = await redis.multi().incr(key).expire(key, MONTH).exec<[number, number]>();
        return count;
      },
      decr: async (key: string) => { await redis.decr(key); },
    };
  }
  const memory = new Map<string, { count: number; until: number }>();
  const live = (key: string) => { const e = memory.get(key); return e && e.until > Date.now() ? e.count : 0; };
  return {
    get: async (key: string) => live(key),
    incr: async (key: string) => {
      const count = live(key) + 1;
      memory.set(key, { count, until: Date.now() + MONTH * 1000 });
      if (memory.size > 50_000) memory.delete(memory.keys().next().value!);
      return count;
    },
    decr: async (key: string) => { const e = memory.get(key); if (e && e.count > 0) e.count--; },
  };
})();

/** Headers on a refusal, which public/unlock.js answers with the password box. */
export const lockedHeaders = { ...noStore, "x-mlf-locked": "1" };
export const lockedMessage = "The three free tries are used up. Enter the password to keep going.";

export const hmac = (key: string, value: string) => createHmac("sha256", key).update(value).digest("hex");
export const usesSecret = () => process.env.DEMO_WORKER_KEY || process.env.WEEKLY_NOTES_EDIT_KEY || process.env.MODEL_PASSWORD || "";
// The address never reaches the database, only a keyed hash of it.
const ipKey = (request: Request) => `mlf:uses:${hmac(usesSecret() || "mlf", visitor(request))}`;

function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie a correct password earns. Keyed on the password, so changing it signs everyone out. */
export function unlockToken() {
  const password = process.env.MODEL_PASSWORD;
  return password ? hmac(password, "unlocked") : null;
}

export function passwordMatches(attempt: string) {
  const password = process.env.MODEL_PASSWORD;
  return Boolean(password) && equal(hmac("attempt", attempt), hmac("attempt", password!));
}

async function cookieUses() {
  const [count, signature] = ((await cookies()).get(USES_COOKIE)?.value ?? "").split(".");
  const secret = usesSecret();
  return secret && signature && equal(signature, hmac(secret, `uses.${count}`)) ? Number(count) || 0 : 0;
}

async function setCookieUses(count: number) {
  const secret = usesSecret();
  if (!secret) return;
  (await cookies()).set(USES_COOKIE, `${count}.${hmac(secret, `uses.${count}`)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: MONTH, path: "/",
  });
}

export async function unlocked() {
  const token = unlockToken();
  const held = (await cookies()).get(UNLOCK_COOKIE)?.value;
  return Boolean(token && held && equal(held, token));
}

/** How many free calls this visitor has left; null when they hold the password. */
export async function remainingUses(request: Request) {
  if (await unlocked()) return null;
  const used = Math.max(await counter.get(ipKey(request)), await cookieUses());
  return Math.max(0, FREE_USES - used);
}

/** Spends one free call, or says no. Always true for a visitor holding the password. */
export async function spendUse(request: Request) {
  if (await unlocked()) return true;
  const key = ipKey(request);
  const fromCookie = await cookieUses();
  const byIp = await counter.incr(key);
  const used = Math.max(byIp, fromCookie + 1);
  if (used > FREE_USES) {
    await counter.decr(key);
    return false;
  }
  await setCookieUses(used);
  return true;
}

/** Gives a use back when the call it paid for failed on our side. */
export async function refundUse(request: Request) {
  if (await unlocked()) return;
  await counter.decr(ipKey(request));
  const fromCookie = await cookieUses();
  if (fromCookie > 0) await setCookieUses(fromCookie - 1);
}

/** The JSON body of a request, or null when it is not an object or is over `limit` characters. */
export async function readBody(request: Request, limit: number): Promise<Record<string, unknown> | null> {
  try {
    if (Number(request.headers.get("content-length")) > limit) return null;
    const text = await request.text();
    if (text.length > limit) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function runWorker(slug: string, op: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const payload = JSON.stringify({ slug, op, body });
  if (process.env.VERCEL) {
    const secret = process.env.DEMO_WORKER_KEY || process.env.WEEKLY_NOTES_EDIT_KEY;
    const host = process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      : process.env.VERCEL_URL;
    if (!secret || !host) throw new Error("Missing worker configuration");
    const timestamp = String(Date.now());
    // The "demo." prefix keeps this signature from being valid anywhere else.
    const signature = createHmac("sha256", secret).update(`demo.${timestamp}.${payload}`).digest("hex");
    const response = await fetch(`https://${host}/api/demo-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Demo-Time": timestamp, "X-Demo-Signature": signature,
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
      },
      body: payload, cache: "no-store", signal: AbortSignal.timeout(110_000),
    });
    if (!response.ok) throw new Error("Python worker unavailable");
    return response.json();
  }
  // next dev runs the same bridge the worker imports; no second server.
  const executable = process.env.DEMO_PYTHON || path.join(process.cwd(), "hosted/.venv/bin/python");
  return new Promise((resolve, reject) => {
    // Local host only; do not trace an interpreter into the production function.
    const child = spawn(/* turbopackIgnore: true */ executable, [path.join(process.cwd(), "python", slug, "bridge.py")], {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env: process.env,
    });
    let output = "", settled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("The worker timed out")); }, 110_000);
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", () => {}); // Never send provider diagnostics to the browser.
    child.on("error", error => { settled = true; clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer); if (settled) return;
      if (code !== 0) return reject(new Error("The worker failed"));
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Invalid response")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(payload);
  });
}
