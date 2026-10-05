"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuArchive, LuArrowUp, LuCircleHelp, LuLoaderCircle, LuMic, LuPause, LuSkipForward, LuSquare, LuVolume2, LuVolumeX, LuX,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Act, Button, IconAct, call } from "./ui";
import { useRecorder, useStored, useVoice } from "./voice";

/*
  The interview room: the interviewer's question in plain type, the answers
  in white, one field at the bottom. Every answer is saved as it is sent, so
  "pausar" just leaves. "guardar" asks Claude to file the conversation as
  this year's entry, which takes a little while.

  Speech both ways: each new question is read aloud (when the site has an
  ElevenLabs key and the voice is on, remembered per browser), and with the
  field empty the main button is the microphone: speak, stop, and the
  answer arrives written in the field to fix before sending. A first visit
  opens "cómo funciona"; the ? in the header brings it back.
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

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/* How loud you are, drawn straight to the DOM each frame so the conversation does not re-render 60 times a second. */
function Level({ analyser }: { analyser: AnalyserNode }) {
  const bars = useRef<HTMLSpanElement[]>([]);
  useEffect(() => {
    const data = new Uint8Array(analyser.fftSize);
    const history = Array<number>(bars.current.length).fill(0);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      history.shift();
      history.push(Math.min(1, Math.sqrt(sum / data.length) * 5));
      bars.current.forEach((b, i) => { if (b) b.style.transform = `scaleY(${0.12 + history[i] * 0.88})`; });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return (
    <span className="flex h-7 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
      {Array.from({ length: 64 }, (_, i) => (
        <span key={i} ref={(el) => { if (el) bars.current[i] = el; }}
          className="h-full max-w-[3px] min-w-[2px] flex-1 origin-center scale-y-[0.12] rounded-full bg-accent/70 transition-transform duration-75" />
      ))}
    </span>
  );
}

function HowItWorks({ voice, onClose }: { voice: boolean; onClose: () => void }) {
  const steps: { icon: IconType; text: string }[] = [
    ...(voice ? [{ icon: LuVolume2, text: "Te leo cada pregunta en voz alta. Si prefieres leer en silencio, apaga la voz arriba." }] : []),
    { icon: LuMic, text: "Responde hablando o escribiendo. Toca el micrófono, habla con calma y toca el cuadrado al terminar: tu respuesta aparece escrita para que la revises antes de enviarla." },
    { icon: LuSkipForward, text: "Para saltar una pregunta, responde “paso”." },
    { icon: LuPause, text: "Para cuando quieras con “pausar”. Cada respuesta queda guardada y sigues otro día, donde lo dejaste." },
    { icon: LuArchive, text: "Al final, “guardar mi cápsula” ordena todo por pregunta. Solo tú puedes leerla, y quien tú dejes." },
  ];
  return (
    <section aria-label="cómo funciona" className="rounded-2xl bg-white/70 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">Cómo funciona</h2>
        <Act onAct={onClose}>cerrar</Act>
      </div>
      <ul className="mt-4 flex flex-col gap-3.5">
        {steps.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3.5 text-[15px] leading-relaxed">
            <Icon aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <Button onClick={onClose} className="mt-6">empezar</Button>
    </section>
  );
}

export default function Interview({
  username, initial, round, sections, home, voice: voiceReady,
}: {
  username: string; initial: UIMessage[]; round: number; sections: string[]; home: string; voice: boolean;
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

  const [voicePref, setVoicePref] = useStored("capsula:voz", "1");
  const [seen, setSeen] = useStored("capsula:como", "");
  const [help, setHelp] = useState<boolean | null>(null);
  const showHelp = help ?? (!seen && answered === 0);
  const closeHelp = () => { setHelp(false); setSeen("1"); };

  const voiceOn = voiceReady && voicePref === "1";
  const voice = useVoice(username);
  const recorder = useRecorder(username, (heard) => {
    setInput((had) => (had.trim() ? `${had.trim()} ${heard}` : heard));
    requestAnimationFrame(() => area.current?.focus());
  });

  // Read each new question once, when it has finished arriving. On a fresh load that is the question waiting for you.
  const last = messages.at(-1);
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    if (!voiceOn || showHelp || status !== "ready" || last?.role !== "assistant" || spoken.current.has(last.id)) return;
    spoken.current.add(last.id);
    voice.say(last.id, textOf(last));
  }, [voiceOn, showHelp, status, last, voice]);

  // Into the field with a keyboard and mouse only: on a phone focus would raise the keyboard over the question.
  useEffect(() => {
    if (!showHelp && window.matchMedia("(pointer: fine)").matches) area.current?.focus();
  }, [showHelp]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, status]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    voice.stop();
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
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col">
      <header className="pt-8 pb-5">
        <div className="flex items-center justify-between gap-4">
          <Link href={home} className="font-medium tracking-[-0.02em] transition-colors hover:text-accent">cápsula {round}</Link>
          <div className="flex items-center gap-4">
            <span className="flex items-center">
              {voiceReady ? (
                <IconAct icon={voiceOn ? LuVolume2 : LuVolumeX} label={voiceOn ? "apagar la voz" : "encender la voz"} pressed={voiceOn}
                  onAct={() => { if (voiceOn) voice.stop(); setVoicePref(voiceOn ? "0" : "1"); }} />
              ) : null}
              <IconAct icon={LuCircleHelp} label="cómo funciona" pressed={showHelp} onAct={() => (showHelp ? closeHelp() : setHelp(true))} />
            </span>
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

      {showHelp ? <div className="pt-6"><HowItWorks voice={voiceReady} onClose={closeHelp} /></div> : null}

      <ol className="flex flex-1 flex-col gap-8 pt-8 pb-10">
        {messages.map((m) => {
          const text = m.role === "assistant" ? marker(textOf(m)).text : textOf(m);
          if (!text) return null;
          const isLast = m.id === last?.id;
          return m.role === "assistant" ? (
            <li key={m.id} className="max-w-xl">
              <p className="whitespace-pre-line text-[17px] leading-relaxed">{text}</p>
              {voiceReady && isLast && !busy ? (
                <button
                  type="button"
                  onClick={() => (voice.speaking === m.id ? voice.stop() : voice.say(m.id, textOf(m)))}
                  className="label mt-2 inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-accent"
                >
                  {voice.loading === m.id ? <LuLoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                    : voice.speaking === m.id ? <LuSquare aria-hidden className="size-3.5" /> : <LuVolume2 aria-hidden className="size-4" />}
                  {voice.speaking === m.id ? "detener" : voice.loading === m.id ? "preparando la voz…" : voice.blocked ? "toca para escuchar" : "escuchar"}
                </button>
              ) : null}
            </li>
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
        {recorder.state === "recording" && recorder.analyser ? (
          <div className="flex items-center gap-3 p-2 pl-3">
            <button type="button" onClick={() => { recorder.cancel(); requestAnimationFrame(() => area.current?.focus()); }} aria-label="descartar la grabación"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-paper hover:text-ink">
              <LuX aria-hidden className="size-[18px]" />
            </button>
            <span className="flex items-center gap-2 tabular-nums text-sm" aria-live="off">
              <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
              {clock(recorder.seconds)}
            </span>
            <Level analyser={recorder.analyser} />
            {/* The mic that was pressed is gone; focus moves here so a keyboard can stop what it started. */}
            <button type="button" autoFocus onClick={recorder.stop} aria-label="terminar y escribir lo que dije"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-paper transition-colors hover:bg-ink">
              <LuSquare aria-hidden className="size-3.5 fill-current" />
            </button>
          </div>
        ) : (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 p-2 pl-4">
          <textarea
            ref={area}
            value={input}
            rows={1}
            disabled={recorder.state === "working"}
            placeholder={recorder.state === "working" ? "Escribiendo lo que dijiste…" : recorder.supported ? "Escribe o habla…" : "Escribe tu respuesta…"}
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
          {recorder.state === "working" ? (
            <span role="status" className="flex size-10 shrink-0 items-center justify-center text-faint" aria-label="escribiendo lo que dijiste">
              <LuLoaderCircle aria-hidden className="size-[18px] animate-spin motion-reduce:animate-none" />
            </span>
          ) : null}
          {/* An empty field offers the microphone; once there is something to send, the arrow. */}
          {recorder.supported && recorder.state === "idle" && input.trim() ? (
            <button type="button" onClick={() => { voice.stop(); recorder.start(); }} aria-label="seguir hablando"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:bg-paper hover:text-ink">
              <LuMic aria-hidden className="size-[18px]" />
            </button>
          ) : null}
          {recorder.supported && recorder.state === "idle" && !input.trim() ? (
            <button type="button" onClick={() => { voice.stop(); recorder.start(); }} disabled={busy} aria-label="responder hablando"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-30">
              <LuMic aria-hidden className="size-[18px]" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy || !input.trim() || recorder.state !== "idle"}
              aria-label="enviar"
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-30"
            >
              <LuArrowUp aria-hidden className="size-[18px]" />
            </button>
          )}
        </form>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3">
          <p className="label" aria-live="polite">
            {recorder.error || (recorder.state === "recording" ? (recorder.seconds >= 540 ? "queda un minuto: a los diez se detiene sola" : "escuchando · toca el cuadrado al terminar")
              : answered ? `${answered} ${answered === 1 ? "respuesta" : "respuestas"}, todas guardadas` : "responde “paso” para saltar una pregunta")}
          </p>
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
