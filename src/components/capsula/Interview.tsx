"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Act, Button, call } from "./ui";

/*
  The interview room: the interviewer's question in plain type, the answers
  in white, one field at the bottom. Every answer is saved as it is sent, so
  "pausar" just leaves. "guardar" asks Claude to file the conversation as
  this year's entry, which takes a little while.
*/

const marker = (text: string) => {
  const m = text.match(/^\s*\[\[(\d+|fin)\]\]\s*/);
  return m ? { section: m[1] === "fin" ? ("fin" as const) : Number(m[1]), text: text.slice(m[0].length) } : { section: null, text };
};
const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

function reason(error: Error | undefined) {
  if (!error) return "";
  try { return JSON.parse(error.message).error ?? "Algo falló. Intenta otra vez."; } catch { return "Algo falló. Intenta otra vez."; }
}

export default function Interview({
  username, initial, round, sections, home,
}: {
  username: string; initial: UIMessage[]; round: number; sections: string[]; home: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: `capsula-${username}`,
    messages: initial,
    transport: useMemo(() => new DefaultChatTransport({
      api: "/api/capsula/interview",
      prepareSendMessagesRequest: ({ messages }) => ({ body: { username, message: messages.at(-1) } }),
    }), [username]),
  });

  const busy = status === "submitted" || status === "streaming";
  const section = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "assistant") continue;
      const s = marker(textOf(messages[i])).section;
      if (s) return s;
    }
    return 1;
  }, [messages]);
  const done = section === "fin";
  const answered = messages.filter((m) => m.role === "user").length;

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, status]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
    requestAnimationFrame(() => { if (area.current) area.current.style.height = ""; });
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    const { error } = await call("finish", { username });
    if (error) { setSaving(false); return setSaveError(error); }
    router.push(`/capsula/${username}?ano=${round}`);
    router.refresh();
  }

  const current = typeof section === "number" ? Math.min(section, sections.length) : sections.length;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <header className="pt-8 pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <Link href={home} className="font-medium tracking-[-0.02em] transition-colors hover:text-accent">cápsula {round}</Link>
          <div className="flex items-baseline gap-4">
            <Link href={home} className="label transition-colors hover:text-accent">pausar</Link>
            <Act confirm="¿descartar todo?" onAct={async () => { await call("discard", { username }); router.push(home); router.refresh(); }}>
              descartar
            </Act>
          </div>
        </div>
        <div className="mt-5 flex gap-1" aria-hidden>
          {sections.map((_, i) => (
            <span key={i} className={`h-[3px] flex-1 rounded-full transition-colors duration-700 ${i < current || done ? "bg-ink/70" : "bg-ink/10"}`} />
          ))}
        </div>
        <p className="label mt-2" aria-live="polite">
          {done ? "todas las secciones" : `${current} de ${sections.length} · ${sections[current - 1].toLowerCase()}`}
        </p>
      </header>

      <ol className="flex flex-1 flex-col gap-8 pt-8 pb-10">
        {messages.map((m) => {
          const text = m.role === "assistant" ? marker(textOf(m)).text : textOf(m);
          if (!text) return null;
          return m.role === "assistant" ? (
            <li key={m.id} className="max-w-xl whitespace-pre-line text-[17px] leading-relaxed">{text}</li>
          ) : (
            <li key={m.id} className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-white/80 px-5 py-3.5">{text}</li>
          );
        })}
        {status === "submitted" ? <li className="caret h-5 w-[2px]" aria-label="escribiendo" /> : null}
        {error ? <li className="label" role="alert">{reason(error)}</li> : null}
      </ol>
      <div ref={end} />

      {/* only the white card is pinned: a band of paper here would cut across the blobs */}
      <div className="sticky bottom-0 pb-6">
        {done ? (
          <div className="mb-3 flex flex-wrap items-center gap-4 rounded-2xl bg-white/90 p-5 backdrop-blur-md">
            <p className="flex-1">Listo. Guarda tu cápsula de {round} para leerla cuando quieras.</p>
            <Button onClick={save} disabled={saving}>{saving ? "guardando…" : "guardar mi cápsula"}</Button>
          </div>
        ) : null}
        <div className="rounded-2xl bg-white/90 backdrop-blur-md transition-shadow focus-within:ring-2 focus-within:ring-accent/15">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 p-2 pl-4">
          <textarea
            ref={area}
            value={input}
            rows={1}
            autoFocus
            placeholder="Escribe tu respuesta…"
            aria-label="tu respuesta"
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
            }}
            onKeyDown={(e) => {
              // Enter sends with a keyboard; on a phone it is a new line and the arrow sends.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-60 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-faint/70 lg:text-[15px]"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="enviar"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-30"
          >
            →
          </button>
        </form>
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3">
          <p className="label">{answered ? `${answered} ${answered === 1 ? "respuesta" : "respuestas"}, todas guardadas` : "escribe “paso” para saltar una pregunta"}</p>
          {!done && answered >= 3 ? (
            <Act onAct={save}>{saving ? "guardando…" : "guardar lo que hay"}</Act>
          ) : null}
        </div>
        </div>
        {saveError ? <p className="label mt-2" role="alert">{saveError}</p> : null}
        {saving ? <p className="label mt-2" aria-live="polite">Ordenando tus respuestas por pregunta. Tarda un minuto.</p> : null}
      </div>
    </div>
  );
}
