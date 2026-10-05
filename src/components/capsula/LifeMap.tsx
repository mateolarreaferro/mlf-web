"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Insight, Point } from "@/lib/capsula/store";
import { call } from "./ui";

/*
  The map: the person at the centre and the plain facts of their life
  around them, one quarter each for people, places, what happened and what
  they like (the site's three blob colours, and grey). No interpretation
  here; that is "lo que veo", a separate tab. Points that come up more sit
  closer. A hairline joins two points with a factual tie. One inspector
  beside it: a few plain sentences until a point is chosen, then that point
  with their own words.

  Laid out for the box it actually has (measured), so labels stay 12px on a
  phone; on a narrow box only the heavier points are named until touched,
  and every point is also a chip under the map.
*/

export const KINDS = {
  personas: { label: "personas", color: "var(--g1)", angle: Math.PI },
  lugares: { label: "lugares", color: "var(--g2)", angle: -Math.PI / 2 },
  vida: { label: "lo que pasó", color: "var(--g3)", angle: 0 },
  gustos: { label: "lo que te gusta", color: "var(--faint)", angle: Math.PI / 2 },
} as const;

/** The capsule's reading, from the page or, the first time, made on request (a minute or two). */
export function useInsight(username: string, initial: Insight | null) {
  const [insight, setInsight] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    if (insight) return;
    let live = true;
    call<Insight>("insight", { username }).then(({ data, error }) => {
      if (!live) return;
      if (data) setInsight(data);
      else setError(error ?? "");
    });
    return () => { live = false; };
  }, [insight, username]);
  return { insight, error };
}

export function Waiting({ error, owner, first }: { error: string; owner: boolean; first: string }) {
  return (
    <div className="py-24" aria-live="polite">
      {error ? (
        <p className="label">{error}</p>
      ) : (
        <>
          <p className="max-w-md text-[17px]">Leyendo {owner ? "tus entrevistas" : `las entrevistas de ${first}`} con calma…</p>
          <p className="label mt-2">La primera vez tarda uno o dos minutos. Después queda guardado.</p>
          <span className="caret mt-6 inline-block h-5 w-[2px]" aria-hidden />
        </>
      )}
    </div>
  );
}

type Placed = Point & { x: number; y: number; r: number; w: number; anchor: "start" | "end" };

const CHAR = 6.6; // average width of a 12px Inter character

function layout(themes: Point[], W: number, H: number): Placed[] {
  const cx = W / 2, cy = H / 2;
  // An ellipse that fills the box: wide on a desk, tall on a phone.
  const rx = W * (W < 520 ? 0.34 : 0.4), ry = H * 0.44;
  const placed: Placed[] = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    const group = themes.filter((t) => t.kind === kind).sort((a, b) => b.weight - a.weight);
    group.forEach((t, i) => {
      // Spread across the quarter; alternate sides so the heaviest sit in the middle.
      const slot = group.length === 1 ? 0 : ((i % 2 ? -1 : 1) * Math.ceil(i / 2)) / Math.max(1, group.length / 2);
      const a = k.angle + slot * (Math.PI / 3.8);
      const d = 0.4 + (5 - t.weight) * 0.13 + (i % 3) * 0.05;
      const x = cx + Math.cos(a) * d * rx, y = cy + Math.sin(a) * d * ry;
      placed.push({ ...t, x, y, r: 3 + t.weight * 1.3, w: t.label.length * CHAR + 10, anchor: x < cx ? "end" : "start" });
    });
  }
  // Relax: label boxes never overlap each other or the centre, and stay in the box.
  const box = (p: Placed) => ({ x0: p.anchor === "end" ? p.x - p.w - p.r : p.x - p.r, x1: p.anchor === "end" ? p.x + p.r : p.x + p.w + p.r, y0: p.y - 10, y1: p.y + 10 });
  for (let pass = 0; pass < 160; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = box(placed[i]), b = box(placed[j]);
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox <= 0 || oy <= 0) continue;
        const dir = placed[i].y < placed[j].y ? -1 : 1;
        placed[i].y += (dir * (oy + 1)) / 2;
        placed[j].y -= (dir * (oy + 1)) / 2;
      }
    }
    for (const p of placed) {
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
      if (d < 70) { p.x = cx + (dx / (d || 1)) * 70; p.y = cy + (dy / (d || 1)) * 70; }
      const b = box(p);
      if (b.x0 < 4) p.x += 4 - b.x0;
      if (b.x1 > W - 4) p.x -= b.x1 - (W - 4);
      p.y = Math.min(H - 12, Math.max(12, p.y));
      // The person's dot and name are a box nothing may cover: step aside along x,
      // or, for a label too long to fit beside it, above or below it.
      const c = box(p);
      if (c.x1 > cx - 34 && c.x0 < cx + 34 && c.y1 > cy - 18 && c.y0 < cy + 36) {
        const x = p.anchor === "end" ? cx - 34 - p.r - 1 : cx + 34 + p.r + 1;
        const fits = p.anchor === "end" ? x - p.w - p.r >= 4 : x + p.w + p.r <= W - 4;
        if (fits) p.x = x;
        else p.y = p.y >= cy ? cy + 48 : cy - 30;
      }
    }
  }
  return placed;
}

export default function LifeMap({ username, first, initial, owner }: { username: string; first: string; initial: Insight | null; owner: boolean }) {
  const { insight, error } = useInsight(username, initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      setSize({ W, H: Math.round(Math.min(640, Math.max(440, W * (W < 520 ? 1.15 : 0.8)))) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [insight]);

  // On a phone the inspector is below the map: bring it into view when a theme is picked.
  useEffect(() => {
    if (selected && size.W < 520) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected, size.W]);

  const placed = useMemo(() => (insight && size.W ? layout(insight.points, size.W, size.H) : []), [insight, size]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const focus = hover ?? selected;
  const near = useMemo(() => {
    if (!focus || !insight) return null;
    const set = new Set([focus]);
    for (const l of insight.links) {
      if (l.a === focus) set.add(l.b);
      if (l.b === focus) set.add(l.a);
    }
    return set;
  }, [focus, insight]);

  if (!insight) return <Waiting error={error} owner={owner} first={first} />;

  const chosen = selected ? insight.points.find((t) => t.id === selected) : null;
  const narrow = size.W < 520;
  const cx = size.W / 2, cy = size.H / 2;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
      <div>
        <div ref={holder} className="w-full">
          {size.W ? (
            <svg width={size.W} height={size.H} role="group" aria-label={`mapa de ${first}`} className="block touch-manipulation select-none">
              {/* spokes */}
              {placed.map((p) => (
                <line key={`s-${p.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--ink)"
                  strokeOpacity={near ? (near.has(p.id) ? 0.12 : 0.025) : 0.06} strokeWidth={1} className="transition-[stroke-opacity] duration-300" />
              ))}
              {/* threads that touch */}
              {insight.links.map((l, i) => {
                const a = byId.get(l.a), b = byId.get(l.b);
                if (!a || !b) return null;
                const on = Boolean(focus && (l.a === focus || l.b === focus));
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                const qx = mx + (cx - mx) * 0.35, qy = my + (cy - my) * 0.35;
                return (
                  <g key={`l-${i}`}>
                    <path d={`M${a.x},${a.y} Q${qx},${qy} ${b.x},${b.y}`} fill="none" stroke="var(--ink)"
                      strokeOpacity={on ? 0.45 : focus ? 0.03 : 0.1} strokeWidth={on ? 1.2 : 1} className="transition-[stroke-opacity] duration-300" />
                    {on ? (
                      <text x={(mx + qx) / 2} y={(my + qy) / 2} textAnchor="middle" className="fill-faint text-[11px]"
                        paintOrder="stroke" stroke="var(--paper)" strokeWidth={4}>{l.label}</text>
                    ) : null}
                  </g>
                );
              })}
              {/* the person */}
              <circle cx={cx} cy={cy} r={5} fill="var(--ink)" />
              <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--ink)" strokeOpacity={0.2} />
              <text x={cx} y={cy + 28} textAnchor="middle" className="fill-ink text-[13px] font-medium">{first.toLowerCase()}</text>
              {/* the threads */}
              {placed.map((p, i) => {
                const k = KINDS[p.kind];
                const dim = near && !near.has(p.id);
                const named = !narrow || p.weight >= 4 || p.id === focus || near?.has(p.id);
                return (
                  <motion.g
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: dim ? 0.25 : 1 }}
                    transition={{ duration: 0.6, delay: hover || selected ? 0 : 0.2 + i * 0.03 }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.label}, ${k.label}`}
                    aria-pressed={selected === p.id}
                    onMouseEnter={() => setHover(p.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(p.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected(selected === p.id ? null : p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(selected === p.id ? null : p.id); } }}
                    className="cursor-pointer outline-none"
                  >
                    {/* a generous hit area: the dot and its label */}
                    <rect x={p.anchor === "end" ? p.x - p.w - p.r - 4 : p.x - p.r - 4} y={p.y - 12} width={p.w + p.r * 2 + 8} height={24} fill="transparent" />
                    {selected === p.id ? <circle cx={p.x} cy={p.y} r={p.r + 5} fill="none" stroke={k.color} strokeWidth={1.2} /> : null}
                    <circle cx={p.x} cy={p.y} r={p.r} fill={k.color} />
                    {named ? (
                      <text x={p.anchor === "end" ? p.x - p.r - 6 : p.x + p.r + 6} y={p.y + 4} textAnchor={p.anchor}
                        className={`text-[12px] ${p.id === focus ? "fill-ink" : "fill-ink/80"}`}>{p.label}</text>
                    ) : null}
                  </motion.g>
                );
              })}
            </svg>
          ) : (
            <div style={{ height: 480 }} />
          )}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="leyenda">
          {Object.entries(KINDS).map(([key, k]) => (
            <li key={key} className="label flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: k.color }} aria-hidden />
              {k.label}
            </li>
          ))}
        </ul>
        {narrow ? (
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="todos los puntos">
            {[...insight.points].sort((a, b) => b.weight - a.weight).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setSelected(t.id)} aria-pressed={selected === t.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors ${selected === t.id ? "bg-white" : "bg-white/60 hover:bg-white"}`}>
                  <span className="size-2 rounded-full" style={{ background: KINDS[t.kind].color }} aria-hidden />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <aside ref={panel} className="scroll-mt-6 lg:sticky lg:top-8 lg:self-start" aria-live="polite">
        {chosen ? (
          <Fact point={chosen} insight={insight} onPick={setSelected} />
        ) : (
          <div>
            <p className="label">en pocas palabras</p>
            <p className="mt-4 leading-relaxed">{insight.overview}</p>
            <p className="label mt-8">Toca un punto del mapa para ver lo que {owner ? "dijiste" : `dijo ${first}`} de él.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Fact({ point: theme, insight, onPick }: { point: Point; insight: Insight; onPick: (id: string | null) => void }) {
  const k = KINDS[theme.kind];
  const ties = insight.links
    .filter((l) => l.a === theme.id || l.b === theme.id)
    .map((l) => ({ label: l.label, other: insight.points.find((t) => t.id === (l.a === theme.id ? l.b : l.a))! }))
    .filter((t) => t.other);
  return (
    <div>
      <button type="button" onClick={() => onPick(null)} className="label cursor-pointer transition-colors hover:text-accent">
        ← en pocas palabras
      </button>
      <p className="label mt-6 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: k.color }} aria-hidden />
        {k.label} · {theme.rounds.join(", ")}
      </p>
      <h3 className="mt-2 text-2xl font-medium tracking-[-0.02em]">{theme.label}</h3>
      <p className="mt-4 leading-relaxed">{theme.note}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {theme.quotes.map((q, i) => (
          <li key={i} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
            <span className="label tabular-nums">{q.round}</span>
            <blockquote className="text-faint break-words">«{q.text}»</blockquote>
          </li>
        ))}
      </ul>
      {ties.length ? (
        <>
          <p className="label mt-8">relacionado con</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {ties.map((t) => (
              <li key={t.other.id}>
                <button type="button" onClick={() => onPick(t.other.id)} className="cursor-pointer text-left transition-colors hover:text-accent">
                  {t.other.label} <span className="label">· {t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
