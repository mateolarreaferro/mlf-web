"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, call, field } from "./ui";

/* Username and password for a friend; the password alone for the admin. */
export default function LoginForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const { data, error } = admin
      ? await call("admin", { password: form.get("password") })
      : await call<{ username: string }>("login", { username: form.get("username"), password: form.get("password") });
    setBusy(false);
    if (error) return setError(error);
    router.push(admin ? "/capsula/admin" : `/capsula/${(data as { username: string }).username}`);
    router.refresh();
  }

  return (
    <form action={submit} className="flex w-full max-w-xs flex-col gap-2.5">
      {admin ? null : (
        <input name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false}
          placeholder="usuario…" aria-label="usuario" className={field} />
      )}
      <input name="password" type="password" required autoComplete="current-password"
        placeholder="contraseña…" aria-label="contraseña" className={field} />
      <Button type="submit" disabled={busy} className="mt-2 self-start">
        {busy ? "abriendo…" : "entrar"}
      </Button>
      <p className="label min-h-6" aria-live="polite">{error}</p>
    </form>
  );
}
