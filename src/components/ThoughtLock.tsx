"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { hoverSpring, useTempo } from "@/components/motion";
import { unlock } from "@/app/thoughts/[slug]/actions";

/* The form a password-protected thought shows in place of its body. */
export function ThoughtLock({ slug, lang }: { slug: string; lang: "en" | "es" }) {
  const [state, action, pending] = useActionState(unlock.bind(null, slug), {
    wrong: false,
  });
  const tempo = useTempo();
  const es = lang === "es";

  return (
    <form action={action} className="max-w-sm">
      <p className="text-sm text-faint">
        {es ? "este texto tiene contraseña." : "this one is behind a password."}
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-full bg-soft py-1.5 pl-5 pr-1.5 transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="off"
          aria-label={es ? "contraseña" : "password"}
          placeholder={es ? "contraseña…" : "password…"}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-faint"
        />
        <motion.button
          type="submit"
          disabled={pending}
          aria-label={es ? "Abrir" : "Open"}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          transition={hoverSpring(tempo)}
        >
          →
        </motion.button>
      </div>
      <p className="label mt-3 min-h-5" aria-live="polite">
        {state.wrong ? (es ? "no es esa." : "not that one.") : ""}
      </p>
    </form>
  );
}
