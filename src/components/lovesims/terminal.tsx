'use client';

/**
 * The terminal LoveSims runs in: the screen with its title strip and menu
 * line, bracketed buttons, text that types itself behind a block cursor, and
 * the ASCII bars. Presentation only; the engine and the stream hook never see
 * any of this. The look is a CRT: phosphor green on near black, scanlines over
 * everything (globals.css), VT323 for the copy, Press Start 2P for titles.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/* Hex, not var(): the sprite rasteriser serialises the SVG to an image, where no variable resolves. */
export const CHANNEL_A = '#ff7fa6';
export const CHANNEL_B = '#8fa8ff';
/** Channel colours by participant index: A is rose, B is periwinkle, the site's own blob colours. */
export const CHANNELS = [CHANNEL_A, CHANNEL_B] as const;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);
  return reduced;
}

/**
 * Text that arrives one character at a time. The untyped rest is laid out but
 * invisible, so nothing reflows; screen readers get the whole line at once.
 * `skip` shows it all (a press on the line), reduced motion always does.
 */
export function Typed({
  text, speed = 16, cap = 1600, cursor = true, skip = false, onDone, className,
}: {
  text: string; speed?: number; cap?: number; cursor?: boolean; skip?: boolean;
  onDone?: () => void; className?: string;
}) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  // A new text starts over (state derived from props, set during render, the React way).
  const [prev, setPrev] = useState(text);
  if (prev !== text) { setPrev(text); setN(0); }
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });
  const instant = reduced || skip;

  useEffect(() => {
    if (instant) { doneRef.current?.(); return; }
    const per = Math.min(speed, cap / Math.max(1, text.length));
    let i = 0;
    const id = setInterval(() => {
      i++;
      setN(i);
      if (i >= text.length) { clearInterval(id); doneRef.current?.(); }
    }, per);
    return () => clearInterval(id);
  }, [text, instant, speed, cap]);

  const shown = instant ? text.length : Math.min(n, text.length);
  const done = shown >= text.length;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {cursor && !done && <span className="ls-cursor" />}
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </span>
  );
}

/** Lines that arrive one after another, like a boot log. */
export function Boot({ lines, onDone, speed = 10 }: { lines: string[]; onDone?: () => void; speed?: number }) {
  const [shown, setShown] = useState(1);
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; });
  useEffect(() => {
    if (shown > lines.length) doneRef.current?.();
  }, [shown, lines.length]);
  const visible = Math.min(shown, lines.length);
  const typing = shown <= lines.length;
  return (
    <div className="space-y-0.5">
      {lines.slice(0, visible).map((l, i) => {
        const last = i === visible - 1;
        return (
          <p key={i} className="ls-dim">
            <span>&gt; </span>
            <Typed text={l} speed={speed} cap={500} cursor={last && typing} onDone={last && typing ? () => setShown((n) => n + 1) : undefined} />
          </p>
        );
      })}
    </div>
  );
}

/** A `[ bracketed ]` button. `on` inverts it, `hint` is the key that presses it. */
export function Btn({
  children, hint, on, big, className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { hint?: string; on?: boolean; big?: boolean }) {
  return (
    <button type="button" className={`ls-btn ${big ? 'ls-big' : ''} ${className}`} data-on={on ? 'true' : undefined} {...rest}>
      {hint && <span style={{ color: on ? 'inherit' : 'var(--ls-hi)' }}>{hint}</span>}
      {hint && ' '}
      {children}
    </button>
  );
}

/** A `[x]` toggle. */
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="ls-check" onClick={() => onChange(!checked)}>
      <span style={{ color: 'var(--ls-dim)' }}>[</span>
      <span>{checked ? 'x' : ' '}</span>
      <span style={{ color: 'var(--ls-dim)' }}>]</span> {children}
    </button>
  );
}

/** `████░░░░░░` for a fraction. */
export function bar(fraction: number, width = 10, fill = '█', empty = '░') {
  const f = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return fill.repeat(f) + empty.repeat(width - f);
}

/** A secret hidden as blocks: the first words' lengths kept, the rest cut, so the mask stays one or two lines. */
export function masked(text: string, max = 36) {
  const head = text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') : text;
  return head.replace(/[^\s]/g, '\u2593') + (text.length > max ? ' ...' : '');
}

const MENU = [
  { href: '/lovesims', label: 'home' },
  { href: '/lovesims/play', label: 'play' },
  { href: '/lovesims/date', label: 'analyst' },
  { href: '/?project=love-simulations', label: 'exit' },
];

/** The screen: title strip, menu line, body. */
export function Frame({ children, wide = false, status }: { children: ReactNode; wide?: boolean; status?: ReactNode }) {
  const path = usePathname();
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} py-4 sm:py-8`}>
      <div className="ls-screen">
        <div className="ls-strip">
          <span className="ls-title text-[10px] leading-[1.9]">LOVESIMS.EXE</span>
          <span>v2</span>
          <span>tty1</span>
          {status && <span className="ml-auto">{status}</span>}
        </div>
        <nav className="ls-menu" aria-label="LoveSims">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="ls-btn" data-on={path === m.href ? 'true' : undefined}>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-8 pt-6 sm:px-7">{children}</div>
      </div>
    </div>
  );
}

/** A dim label line in the terminal's own small caps. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[16px] uppercase tracking-[0.08em] ${className}`} style={{ color: 'var(--ls-dim)' }}>{children}</p>;
}
