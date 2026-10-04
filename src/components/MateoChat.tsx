"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { hoverSpring, useTempo } from "./motion";

const ease = [0.22, 1, 0.36, 1] as const;

export default function MateoChat({
  open,
  onClose,
  fullScreen = false,
}: {
  open: boolean;
  onClose: () => void;
  /* on a phone the graph box is too small to talk in: take the whole screen */
  fullScreen?: boolean;
}) {
  const tempo = useTempo();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    // not on a phone: the keyboard would cover the suggested questions
    if (open && !fullScreen) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, fullScreen]);

  // full screen holds the page still underneath, like ProjectSheet
  useEffect(() => {
    if (!open || !fullScreen) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [open, fullScreen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    sendMessage({ text });
    setInput("");
  };

  const chat = (
    <AnimatePresence>
      {open ? (
        <motion.div
          /* absolute, not fixed: this sits on the graph card and matches it
             exactly, rather than floating over the whole viewport at a size
             that never quite lined up with the square underneath. A phone is
             the exception (fullScreen), portalled to <body> because the
             template's transform would turn fixed into absolute. */
          className={fullScreen ? "fixed inset-0 z-50 h-dvh" : "absolute inset-0 z-30"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 * tempo }}
        >
          <motion.div
            role="dialog"
            aria-label="Chat with Mateo's agent"
            className={`flex h-full w-full flex-col overflow-hidden bg-paper ${
              fullScreen
                ? "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
                : "rounded-3xl shadow-2xl"
            }`}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.45 * tempo, ease }}
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
                className="label ml-auto inline-flex min-h-11 cursor-pointer items-center rounded-full bg-soft px-4 hover:!text-accent lg:min-h-0 lg:px-3.5 lg:py-1.5"
              >
                close
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              {messages.length === 0 ? (
                <div className="pt-6">
                  <p className="text-sm text-faint">
                    Ask me anything about Mateo&apos;s work: Attractor, the Stanford
                    research, the music. En español también.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["What is Attractor?", "Tell me about Satie", "¿Quién es Mateo?"].map(
                      (q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage({ text: q })}
                          className="label cursor-pointer rounded-full bg-soft px-4 py-2.5 hover:!text-accent lg:px-3.5 lg:py-1.5"
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
                  transition={{ duration: 0.35 * tempo, ease }}
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
                  {/* the free tries ran out and the password box was closed (public/unlock.js) */}
                  {error.message.includes("free tries")
                    ? "The three free messages are used up. Ask again to enter the password, or email Mateo directly."
                    : "The agent is unreachable right now. You can always email Mateo directly instead."}
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
                  className="min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm focus-visible:outline-none placeholder:text-faint"
                />
                <motion.button
                  type="submit"
                  aria-label="Send"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink text-paper"
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  transition={hoverSpring(tempo)}
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

  return fullScreen && typeof document !== "undefined" ? createPortal(chat, document.body) : chat;
}
