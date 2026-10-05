"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type ReactNode } from "react";
import { hoverSpring, useTempo } from "@/components/motion";

/* What every capsule control shares: one way to call the API, one button, one field. */

export async function call<T = Record<string, unknown>>(op: string, body: Record<string, unknown> = {}): Promise<{ data?: T; error?: string }> {
  try {
    const response = await fetch(`/api/capsula/${op}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { data: data as T } : { error: data.error ?? "Algo falló. Intenta otra vez." };
  } catch {
    return { error: "Sin conexión. Intenta otra vez." };
  }
}

/** A white field on the paper, 16px on phones so iOS does not zoom on focus. */
export const field =
  "w-full rounded-xl bg-white/80 px-4 py-2.5 text-base lg:text-sm outline-none transition-shadow placeholder:text-faint/70 focus-visible:ring-2 focus-visible:ring-accent/30";

export function Button({
  children, quiet = false, className = "", ...rest
}: { children: ReactNode; quiet?: boolean } & ComponentProps<typeof motion.button>) {
  const tempo = useTempo();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={hoverSpring(tempo)}
      className={`cursor-pointer rounded-full px-5 py-2 text-sm transition-colors disabled:cursor-default disabled:opacity-50 ${
        quiet ? "bg-white/70 text-ink hover:bg-white" : "bg-ink text-paper hover:bg-accent"
      } ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

/** A text link that does something, asking once more before anything that cannot be undone. */
export function Act({
  children, confirm, onAct, className = "",
}: { children: ReactNode; confirm?: string; onAct: () => void | Promise<void>; className?: string }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onBlur={() => setAsking(false)}
      onClick={async () => {
        if (confirm && !asking) return setAsking(true);
        setBusy(true);
        await onAct();
        setBusy(false);
        setAsking(false);
      }}
      className={`label cursor-pointer transition-colors hover:text-accent disabled:opacity-50 ${asking ? "text-ink" : ""} ${className}`}
    >
      {asking ? confirm : children}
    </button>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <Act onAct={async () => { await call("logout"); router.push("/capsula"); router.refresh(); }}>salir</Act>
  );
}
