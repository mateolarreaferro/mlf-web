"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuCheck, LuClock, LuUserMinus, LuUserPlus, LuX } from "react-icons/lu";
import { Act, Button, IconAct, call } from "./ui";

export function RemoveEntry({ username, id }: { username: string; id: string }) {
  const router = useRouter();
  return (
    <Act confirm="¿borrarla de verdad?" onAct={async () => { await call("remove", { username, id }); router.refresh(); }}>
      borrar entrada
    </Act>
  );
}

/*
  Someone else's private capsule: ask them to let you read it, the way you ask
  to follow a private account. Until they accept, the request waits; you can
  take it back.
*/
export function RequestAccess({ username, first, status }: { username: string; first: string; status: "pendiente" | null }) {
  const router = useRouter();
  const [sent, setSent] = useState(status === "pendiente");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    const { error } = await call(sent ? "withdraw" : "request", { username });
    setBusy(false);
    if (error) return setError(error);
    setSent(!sent);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {sent ? (
        <>
          <span className="label inline-flex items-center gap-1.5"><LuClock aria-hidden className="size-4" />esperando a {first}</span>
          <Act onAct={toggle}>retirar</Act>
        </>
      ) : (
        <Button quiet onClick={toggle} disabled={busy} className="inline-flex items-center gap-2">
          <LuUserPlus aria-hidden className="size-4" />pedir acceso
        </Button>
      )}
      <span className="label" aria-live="polite">{error}</span>
    </div>
  );
}

type Asker = { username: string; name: string };

/* The owner's side: who is asking to read your capsule, and who already can. */
export function Requests({ pending, invited }: { pending: Asker[]; invited: Asker[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const answer = async (from: string, accept: boolean) => {
    setBusy(from);
    await call("answer", { from, accept });
    router.refresh();
    setBusy("");
  };
  if (!pending.length && !invited.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {pending.length ? (
        <div className="rounded-2xl bg-white/70 p-5">
          <p className="font-medium">
            {pending.length === 1 ? "Alguien quiere leer tu cápsula" : `${pending.length} personas quieren leer tu cápsula`}
          </p>
          <p className="label mt-1">Si aceptas, podrá leerla toda, sin cambiar nada. Puedes quitarle el acceso cuando quieras.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {pending.map((p) => (
              <li key={p.username} className="flex flex-wrap items-center justify-between gap-3">
                <span>{p.name}</span>
                <span className="flex items-center gap-2">
                  <Button onClick={() => answer(p.username, true)} disabled={busy === p.username} className="inline-flex items-center gap-1.5">
                    <LuCheck aria-hidden className="size-4" />aceptar
                  </Button>
                  <Button quiet onClick={() => answer(p.username, false)} disabled={busy === p.username} className="inline-flex items-center gap-1.5">
                    <LuX aria-hidden className="size-4" />rechazar
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {invited.length ? (
        <details className="group">
          <summary className="label cursor-pointer list-none transition-colors hover:text-accent">
            {invited.length === 1 ? "1 persona puede leerla" : `${invited.length} personas pueden leerla`}
          </summary>
          <ul className="mt-3 flex max-w-sm flex-col">
            {invited.map((p) => (
              <li key={p.username} className="flex items-center justify-between gap-3">
                <span className="text-sm">{p.name}</span>
                <IconAct icon={LuUserMinus} label="quitar acceso" confirm={`¿quitarle el acceso a ${p.name.split(" ")[0]}?`}
                  onAct={() => answer(p.username, false)} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
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
  const [choosing, setChoosing] = useState(self && !hasThisYear);
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

  // For the admin, someone else's interview is an occasional thing: one line, not two cards.
  if (!self && !choosing) {
    return (
      <p className="label">
        <Act className="underline decoration-faint/40 underline-offset-4" onAct={() => setChoosing(true)}>
          hacer la entrevista de {year} con {name}
        </Act>
      </p>
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
