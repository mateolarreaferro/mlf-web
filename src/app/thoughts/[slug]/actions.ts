"use server";

import { createHash } from "crypto";
import { cookies } from "next/headers";
import { getThought, unlockCookie } from "@/lib/thoughts";

/* Compares hashes, never plain text; the right one is kept in a cookie for 30 days. */
export async function unlock(
  slug: string,
  _prev: { wrong: boolean },
  form: FormData,
): Promise<{ wrong: boolean }> {
  const hash = getThought(slug)?.password;
  const guess = String(form.get("password") ?? "").trim();
  const guessed = createHash("sha256").update(guess).digest("hex");
  if (!hash || guessed !== hash) return { wrong: true };

  (await cookies()).set(unlockCookie(slug), hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/thoughts/${slug}`,
    maxAge: 60 * 60 * 24 * 30,
  });
  return { wrong: false };
}
