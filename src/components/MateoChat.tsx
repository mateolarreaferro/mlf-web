"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useChat } from "@ai-sdk/react";

const ease = [0.22, 1, 0.36, 1] as const;

export default function MateoChat({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <button
            aria-label="Close chat"
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-label="Chat with Mateo's agent"
            className="relative flex h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-paper shadow-2xl"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ duration: 0.45, ease }}
          >
            <div className="flex items-center gap-3 p-5">
              <Image
                src="/mlf.jpg"
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-full object-cover object-[60%_40%]"
              />
              <div className="leading-tight">
                <p className="text-sm font-medium">mateo&apos;s agent</p>
                <p className="label">knows the projects, not the secrets</p>
              </div>
              <button
                onClick={onClose}
                className="label ml-auto cursor-pointer rounded-full bg-soft px-3.5 py-1.5 hover:!text-accent"
              >
                close
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              {messages.length === 0 ? (
                <div className="pt-6">
                  <p className="text-sm text-faint">
                    Ask me anything about Mateo&apos;s work — Attractor, the Stanford
                    research, the music. En español también.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["What is Attractor?", "Tell me about Satie", "¿Quién es Mateo?"].map(
                      (q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage({ text: q })}
                          className="label cursor-pointer rounded-full bg-soft px-3.5 py-1.5 hover:!text-accent"
                        >
                          {q}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease }}
                  className={
                    m.role === "user"
                      ? "ml-auto w-fit max-w-[80%] rounded-3xl rounded-br-lg bg-ink px-4 py-2.5 text-sm text-paper"
                      : "mr-6 text-sm leading-relaxed"
                  }
                >
                  {m.parts.map((part, i) =>
                    part.type === "text" ? <span key={i}>{part.text}</span> : null,
                  )}
                </motion.div>
              ))}
              {status === "submitted" ? (
                <motion.p
                  className="label"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  thinking…
                </motion.p>
              ) : null}
              {error ? (
                <p className="text-sm text-faint">
                  The agent is unreachable right now. You can always email Mateo
                  directly instead.
                </p>
              ) : null}
            </div>

            <form onSubmit={submit} className="p-4">
              <div className="flex items-center gap-2 rounded-full bg-soft py-1.5 pl-5 pr-1.5 transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.currentTarget.value)}
                  placeholder="ask about the work…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none placeholder:text-faint"
                />
                <motion.button
                  type="submit"
                  aria-label="Send"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  ↑
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
