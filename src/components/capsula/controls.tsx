"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Act, Button, call, field } from "./ui";

/* Private by default; the owner can open their capsule to the circle and close it again. */
export function PrivacyToggle({ initial }: { initial: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <p className="label flex flex-wrap items-baseline gap-x-3">
      <span>{open ? "Visible para el círculo." : "Privada: solo tú la lees."}</span>
      <Act
        className="underline decoration-faint/40 underline-offset-4"
        onAct={async () => {
          const { data } = await call<{ public: boolean }>("visibility", { public: !open });
          if (data) setOpen(data.public);
        }}
      >
        {open ? "volver a privada" : "hacerla visible para el círculo"}
      </Act>
    </p>
  );
}

export function RemoveEntry({ username, id }: { username: string; id: string }) {
  const router = useRouter();
  return (
    <Act confirm="¿borrarla de verdad?" onAct={async () => { await call("remove", { username, id }); router.refresh(); }}>
      borrar entrada
    </Act>
  );
}

/* Someone else's private capsule: their password opens it for reading, in this browser. */
export function Unlock({ username, name, inline = false }: { username: string; name?: string; inline?: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(!inline);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="cursor-pointer text-left transition-colors hover:text-accent">
        {name} <span className="label">· privada</span>
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={async (form) => {
        setBusy(true);
        const { error } = await call("view", { username, password: form.get("password") });
        setBusy(false);
        if (error) return setError(error);
        router.push(`/capsula/${username}`);
        router.refresh();
      }}
    >
      {name ? <span className="mr-1">{name}</span> : null}
      <input name="password" type="password" required autoFocus={inline} placeholder={`contraseña${name ? ` de ${name.split(" ")[0]}` : ""}…`}
        aria-label="contraseña" className={`${field} w-56`} />
      <Button type="submit" disabled={busy}>abrir</Button>
      <span className="label" aria-live="polite">{error}</span>
    </form>
  );
}

const MODES = [
  {
    mode: "conversacion",
    title: "Conversación",
    body: "Las mismas preguntas, con calma, y alguna pregunta de seguimiento cuando algo lo pide.",
  },
  {
    mode: "guiada",
    title: "Guiada",
    body: "Las preguntas de siempre, una por una y en orden. Sin desvíos.",
  },
] as const;

/* The way into this year's interview: carry on with one in progress, or start one in either mode. */
export function StartInterview({
  username, name, year, draft, hasThisYear, returning, self,
}: {
  username: string; name: string; year: number; draft: { round: number; answers: number } | null;
  hasThisYear: boolean; returning: boolean; self: boolean;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState(!hasThisYear);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const path = `/capsula/${username}/entrevista`;

  if (draft) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/70 p-6">
        <div>
          <p className="font-medium">{self ? "Tu" : "La"} entrevista de {draft.round} está a medias</p>
          <p className="label mt-1">
            {draft.answers} {draft.answers === 1 ? "respuesta" : "respuestas"} hasta ahora. Todo lo dicho está guardado.
          </p>
        </div>
        <Button onClick={() => router.push(path)}>continuar</Button>
      </div>
    );
  }

  if (!choosing) {
    return (
      <p className="label">
        {self ? "Tu" : "La"} cápsula de {year} ya está guardada.{" "}
        <Act className="underline decoration-faint/40 underline-offset-4" onAct={() => setChoosing(true)}>hacer otra entrevista</Act>
      </p>
    );
  }

  return (
    <div>
      <p className="font-medium">{self ? `${name}, es momento de tu cápsula de ${year}.` : `La cápsula de ${year} de ${name}.`}</p>
      <p className="label mt-1">Elige cómo hacer la entrevista. Puedes parar cuando quieras y seguir otro día.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy(m.mode);
              const { error } = await call("start", { username, mode: m.mode });
              if (error) { setBusy(""); return setError(error); }
              router.push(path);
            }}
            className="group cursor-pointer rounded-2xl bg-white/70 p-6 text-left transition-colors hover:bg-white disabled:cursor-default"
          >
            <span className="flex items-baseline justify-between gap-4 font-medium">
              {m.title}
              <span aria-hidden className="text-faint transition-transform group-hover:translate-x-0.5">
                {busy === m.mode ? "…" : "→"}
              </span>
            </span>
            <span className="mt-2 block text-sm text-faint">
              {m.body}
              {m.mode === "conversacion" && returning ? " Recuerda lo que dijiste la última vez." : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="label mt-3" aria-live="polite">{error}</p>
    </div>
  );
}
