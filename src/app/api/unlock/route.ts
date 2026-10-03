import { cookies } from "next/headers";
import { budget, noStore, passwordMatches, readBody, remainingUses, sameOrigin, UNLOCK_COOKIE, unlockToken, visitor } from "@/lib/hosted";

/*
  The password past the three free model calls (see `spendUse` in
  src/lib/hosted.ts). public/unlock.js asks for it when a route answers
  with x-mlf-locked, posts it here, and retries the call it was holding.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guessing is slow on purpose.
const admitAttempt = budget({ each: 10, all: 500, window: 3_600_000 });

/** How many free calls are left: a number, or null for a visitor holding the password. */
export async function GET(request: Request) {
  return Response.json({ remaining: await remainingUses(request) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Use this website to unlock." }, { status: 403, headers: noStore });
  if (!admitAttempt(visitor(request))) return Response.json({ error: "Too many tries. Wait an hour and try again." }, { status: 429, headers: noStore });
  const body = await readBody(request, 1000);
  const token = unlockToken();
  if (!token || typeof body?.password !== "string" || !passwordMatches(body.password)) {
    return Response.json({ error: "That is not the password." }, { status: 401, headers: noStore });
  }
  (await cookies()).set(UNLOCK_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 24 * 3600, path: "/",
  });
  return Response.json({ ok: true }, { headers: noStore });
}
