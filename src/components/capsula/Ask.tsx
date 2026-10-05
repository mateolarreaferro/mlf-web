"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  Ask a capsule about its past interviews. The answers come only from that
  capsule (see api/capsula/ask); the conversation is not kept.
*/

function reason(error: Error | undefined) {
  if (!error) return "";
  try { return JSON.parse(error.message).error ?? "Algo falló. Intenta otra vez."; } catch { return "Algo falló. Intenta otra vez."; }
}

export default function Ask({ username, first, owner, rounds }: { username: string; first: string; owner: boolean; rounds: number[] }) {
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error } = useChat({
    id: `ask-${username}`,
    transport: useMemo(() => new DefaultChatTransport({
      api: "/api/capsula/ask",
      prepareSendMessagesRequest: ({ messages }) => ({ body: { username, messages } }),
    }), [username]),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, status]);

  const ideas = owner
    ? [
        rounds.length > 1 ? `¿Qué ha cambiado en mí desde ${rounds[0]}?` : "¿Qué es lo que más se repite en lo que dije?",
        "¿Qué dije sobre mi familia?",
        "¿Qué me da paz en los momentos difíciles?",
        "¿A quién nombré entre mis mejores amigos?",
      ]
    : [
        rounds.length > 1 ? `¿Qué ha cambiado en ${first} desde ${rounds[0]}?` : `¿Qué es lo más importante para ${first} ahora?`,
        `¿Qué valora ${first} en sus amistades?`,
        `¿Con qué sueña ${first}?`,
      ];

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <div className="max-w-2xl">
      <p className="text-faint">
        {owner ? "Pregúntale a tu cápsula por lo que dijiste. Responde solo con tus propias palabras." : `Pregunta por lo que ${first} dijo. Responde solo con sus palabras.`}
      </p>

      <ol className="mt-10 flex flex-col gap-7">
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return m.role === "user" ? (
            <li key={m.id} className="ml-auto max-w-[85%] whitespace-pre-line break-words rounded-2xl bg-white/80 px-5 py-3.5">{text}</li>
          ) : (
            <li key={m.id} className="whitespace-pre-line break-words text-[17px] leading-relaxed">{text}</li>
          );
        })}
        {status === "submitted" ? <li className="caret h-5 w-[2px]" aria-label="pensando" /> : null}
        {error ? <li className="label" role="alert">{reason(error)}</li> : null}
      </ol>
      <div ref={end} />

      {messages.length ? null : (
        <ul className="flex flex-wrap gap-2">
          {ideas.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => send(q)}
                className="cursor-pointer rounded-full bg-white/70 px-4 py-2 text-left text-sm transition-colors hover:bg-white">
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-8 flex items-center gap-2 rounded-2xl bg-white/90 p-2 pl-4 transition-shadow focus-within:ring-2 focus-within:ring-accent/15">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={owner ? "Pregúntale a tu cápsula…" : `Pregunta sobre ${first}…`}
          aria-label="tu pregunta" autoComplete="off" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-faint/70 lg:text-[15px]" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="preguntar"
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-30">
          →
        </button>
      </form>
    </div>
  );
}
