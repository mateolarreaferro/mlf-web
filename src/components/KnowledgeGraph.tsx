"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import { sfxHover, sfxPress } from "@/lib/sfx";
import { subscribe as onMoodChange } from "@/lib/mood";
import { ATMOSPHERE_EVENT } from "./WeatherAtmosphere";
import ProjectMedia from "./ProjectMedia";
import MateoChat from "./MateoChat";

/*
  The work as a diagram, with Mateo at the center: a symbol, not a physics
  toy. Every project has a fixed seat on its group's arc; nodes glide to their
  seats once, breathe almost imperceptibly, and go back when let go of.
  "me" is the photo node — press it and the agent chat opens.
  Pressing a project swaps the graph for a full card in the same
  space: image, name, category, description, video/repo links.
*/

const ease = [0.22, 1, 0.36, 1] as const;

/* one radius for every project node — no size hierarchy in the graph */
const NODE_R = 8;

/*
  The graph is drawn rather than plotted: nothing is a perfect circle or a
  clean curve. Every wobble is seeded from the node's slug, so a given project
  always has the same hand — the shapes stay put while the layout moves, which
  is what keeps it from shimmering.
*/
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = {
  id: string;
  label: string;
  kind: "me" | "project";
  project?: Project;
  x: number;
  y: number;
  /* the seat this node glides to and returns to */
  tx: number;
  ty: number;
  /* where in its slow breath this node is, so they don't all rise together */
  phase: number;
  r: number;
  e: number; // emphasis 0..1, lerped
  /* per-node hand: radius multipliers, where the pen started, thread jitter */
  wobble: number[];
  lean: number;
  thread: number[];
  /* half-extent of the dot + its label, used to keep nodes from colliding */
  halfW: number;
  halfH: number;
};

export default function KnowledgeGraph({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[];
  selected: Project | null;
  onSelect: (p: Project | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // the canvas effect only re-runs on `projects`, so reach for the
  // latest callback through a ref rather than capturing a stale one
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let frame = 0;
    let orbitX = 220;
    let orbitY = 180;
    let labelFont = "11px var(--font-inter), system-ui, sans-serif";
    let featuredFont = "14px var(--font-inter), system-ui, sans-serif";
    // how quickly a node closes on its seat per frame, and how far it breathes
    const GLIDE = 0.08;
    const BREATH_PX = 1.5;
    const BREATH_RATE = 0.012; // ≈ 9 s per cycle at 60 fps

    const meRand = seeded("mateo");
    const me: Node = {
      id: "me",
      label: "me",
      kind: "me",
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      phase: 0,
      r: 64,
      e: 0,
      // the portrait is only barely off-round — a cut edge, not a scribble
      halfW: 90,
      halfH: 90,
      wobble: Array.from({ length: 13 }, () => 0.968 + meRand() * 0.062),
      lean: meRand() * Math.PI * 2,
      thread: [],
    };

    const photo = new window.Image();
    photo.src = "/mlf.jpg";
    let photoReady = false;
    photo.onload = () => {
      photoReady = true;
      if (reduceMotion) draw();
    };

    /*
      The three groups each own a third of the ring around me, so the graph
      reads as three neighbourhoods rather than one confetti of colour.
      Projects sit on the left where the eye lands first coming off the bio,
      experiments over the top right, art below it. Nodes start inside their
      sector and a weak tangential pull keeps them there without pinning.
    */
    const sectorAngle: Record<string, number> = {
      projects: Math.PI,
      "experiments / tools": -Math.PI / 3,
      art: Math.PI / 3,
    };
    const sectorOf = (g: string | undefined) => sectorAngle[g ?? ""] ?? -Math.PI / 2;
    const byGroup = new Map<string, Project[]>();
    for (const p of projects) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }

    const nodes: Node[] = [me];
    projects.forEach((p) => {
      const rand = seeded(p.slug);
      const a = sectorOf(p.group);
      nodes.push({
        id: p.slug,
        label: p.name,
        kind: "project",
        project: p,
        // begin folded in close to the centre; layout() sets the seats and
        // the first frames unfold the diagram outward
        x: Math.cos(a) * 40,
        y: Math.sin(a) * 30,
        tx: 0,
        ty: 0,
        phase: rand() * Math.PI * 2,
        r: NODE_R,
        e: 0,
        halfW: 40,
        halfH: 20,
        wobble: Array.from({ length: 7 }, () => 0.7 + rand() * 0.62),
        lean: rand() * Math.PI * 2,
        thread: Array.from({ length: 6 }, () => rand()),
      });
    });

    let hovered: Node | null = null;
    let dragging: Node | null = null;
    let dragMoved = 0;

    /*
      The three group colours are the weather's three wash swatches (--w1..3),
      so the graph is painted from the same palette as the page behind it and
      the legend is the header's swatch row. weather-theme.ts keeps the three
      two ramp steps apart so the groups never blur into one another.
    */
    let colors = { ink: "#23282c", faint: "#656f77", accent: "#23718f", soft: "#eeece6", paper: "#f8f7f4", teal: "#4d908e", w1: "#f9854a", w2: "#a4c067", w3: "#499a8d" };
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      colors = {
        ink: read("--ink", colors.ink),
        faint: read("--faint", colors.faint),
        accent: read("--accent", colors.accent),
        soft: read("--soft", colors.soft),
        paper: read("--paper", colors.paper),
        teal: read("--teal", colors.teal),
        w1: read("--w1", colors.w1),
        w2: read("--w2", colors.w2),
        w3: read("--w3", colors.w3),
      };
    };

    const groupColor = (g: string | undefined) =>
      ({
        projects: colors.w1,
        "experiments / tools": colors.w2,
        art: colors.w3,
      })[g ?? ""] ?? colors.faint;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      orbitX = width / 2 - 96;
      orbitY = height / 2 - 64;
      me.r = Math.min(width, height) > 700 ? 74 : Math.min(width, height) > 540 ? 64 : 46;
      labelFont = `${width < 480 ? 10 : 11}px var(--font-inter), system-ui, sans-serif`;
      featuredFont = `${width < 480 ? 12 : 14}px var(--font-inter), system-ui, sans-serif`;
      readColors();
      ctx.font = labelFont;
      // a node's footprint is its label, not its dot — measure it once here
      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const isFeatured = n.project?.featured === true;
        ctx.font = isFeatured ? featuredFont : labelFont;
        n.halfW = Math.max(NODE_R, ctx.measureText(n.label).width / 2) + 7;
        n.halfH = NODE_R + (isFeatured ? 15 : 13) + 5;
      }
      me.halfW = me.r + 10;
      me.halfH = me.r + 22;
      ctx.font = labelFont;
      layout();
    };

    /*
      The seats. Each group owns a third of the ring; its projects sit evenly
      along that arc in catalogue order, alternating between an inner and an
      outer ring when there are enough of them that labels would otherwise
      touch. The result is the same every visit: a diagram you can learn.
    */
    const SECTOR = (Math.PI * 2) / 3;
    const layout = () => {
      for (const [group, peers] of byGroup) {
        const centre = sectorOf(group);
        const usable = SECTOR * 0.82;
        const twoRings = peers.length > 4;
        peers.forEach((p, k) => {
          const n = nodes.find((m) => m.id === p.slug);
          if (!n) return;
          const t = peers.length > 1 ? k / (peers.length - 1) - 0.5 : 0;
          const a = centre + t * usable;
          const ring = twoRings ? (k % 2 === 0 ? 0.84 : 1.12) : 1;
          n.tx = Math.cos(a) * orbitX * ring;
          n.ty = Math.sin(a) * orbitY * ring;
          // a seat must fit on the canvas, label and all
          const maxX = width / 2 - n.halfW - 4;
          const maxY = height / 2 - n.halfH - 8;
          const minY = -height / 2 + n.r + 10;
          n.tx = Math.max(-maxX, Math.min(maxX, n.tx));
          n.ty = Math.max(minY, Math.min(maxY, n.ty));
        });
      }
    };

    /*
      Inverse-square repulsion keeps the layout loose but cannot guarantee
      anything, so labels used to collide. This is the guarantee: treat every
      node as the box its label occupies and push overlapping pairs apart along
      whichever axis they overlap least. A few relaxation passes per frame is
      enough, and pushing along the shallower axis keeps the motion small.
    */
    const separate = () => {
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const ox = a.halfW + b.halfW - Math.abs(dx);
            const oy = a.halfH + b.halfH - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;

            // "me" is pinned, so a project always yields the whole distance
            const aFixed = a === me || a === dragging;
            const bFixed = b === me || b === dragging;
            if (aFixed && bFixed) continue;
            const share = aFixed || bFixed ? 1 : 0.5;

            // resolve most of the overlap, not all of it — a full snap makes
            // crowded layouts (phones) visibly pop as pairs shove each other
            const relax = 0.6;
            if (ox < oy) {
              const push = (dx < 0 ? -ox : ox) * share * relax;
              if (!aFixed) a.x -= push;
              if (!bFixed) b.x += push;
            } else {
              const push = (dy < 0 ? -oy : oy) * share * relax;
              if (!aFixed) a.y -= push;
              if (!bFixed) b.y += push;
            }
          }
        }
      }
    };

    const tick = () => {
      for (const n of nodes) {
        if (n === me || n === dragging) continue;
        // the breath is radial, a slow rise and fall along the thread
        const breath = reduceMotion ? 0 : Math.sin(frame * BREATH_RATE + n.phase) * BREATH_PX;
        const ang = Math.atan2(n.ty, n.tx);
        const gx = n.tx + Math.cos(ang) * breath;
        const gy = n.ty + Math.sin(ang) * breath;
        n.x += (gx - n.x) * GLIDE;
        n.y += (gy - n.y) * GLIDE;
      }
      separate();
      for (const n of nodes) {
        if (n === me) continue;
        /*
          The wall. Seats are on the canvas by construction, but a drag can go
          anywhere and separation can nudge a node outward; every label box
          stays fully inside, so no name is ever cut at an edge. The box hangs
          below the dot, hence the asymmetric vertical limits.
        */
        const pad = 4;
        const maxX = width / 2 - n.halfW - pad;
        const minY = -height / 2 + n.r + 6 + pad;
        const maxY = height / 2 - n.halfH - 4 - pad;
        if (n.x < -maxX) n.x = -maxX;
        else if (n.x > maxX) n.x = maxX;
        if (n.y < minY) n.y = minY;
        else if (n.y > maxY) n.y = maxY;
      }
    };

    /*
      A closed shape traced through the node's wobbled radii, smoothed by
      running quadratic curves through the midpoints between points. Offset
      rotates the pen a little so a second pass doesn't retrace the first —
      that mismatch is what makes it read as drawn by hand.
    */
    const inkBlob = (n: Node, r: number, offset = 0) => {
      const w = n.wobble;
      const count = w.length;
      const at = (i: number): [number, number] => {
        const a = n.lean + offset + ((i % count) / count) * Math.PI * 2;
        const rr = r * w[((i % count) + count) % count];
        return [n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr];
      };
      ctx.beginPath();
      const [fx, fy] = at(0);
      const [lx, ly] = at(count - 1);
      ctx.moveTo((fx + lx) / 2, (fy + ly) / 2);
      for (let i = 0; i < count; i++) {
        const [cx, cy] = at(i);
        const [nx, ny] = at(i + 1);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
      }
      ctx.closePath();
    };

    /* a thread drawn twice, each pass bowing differently, both overshooting */
    const inkThread = (n: Node, pass: number) => {
      const j = n.thread;
      const k = pass === 0 ? 1 : -1;
      const bow = 0.1 + (j[0] - 0.5) * 0.06;
      const mx = (me.x + n.x) / 2 + (me.y - n.y) * bow + (j[1] - 0.5) * 16 * k;
      const my = (me.y + n.y) / 2 + (n.x - me.x) * bow + (j[2] - 0.5) * 16 * k;
      // start a touch off-centre and run slightly past the node, as a pen does
      const sx = me.x + (j[3] - 0.5) * 5;
      const sy = me.y + (j[4] - 0.5) * 5;
      const over = 1 + j[5] * 0.05;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, sx + (n.x - sx) * over, sy + (n.y - sy) * over);
      ctx.stroke();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      for (const n of nodes) {
        const target = hovered === n ? 1 : 0;
        n.e += (target - n.e) * 0.15;
      }

      // threads from me to every project, each stroked twice
      ctx.lineCap = "round";
      for (const n of nodes) {
        if (n === me) continue;
        ctx.strokeStyle = groupColor(n.project?.group);
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = (pass === 0 ? 0.16 : 0.09) + n.e * (pass === 0 ? 0.4 : 0.22);
          ctx.lineWidth = (pass === 0 ? 1 : 0.7) + n.e * 0.5;
          inkThread(n, pass);
        }
      }

      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const r = n.r + n.e * 3;
        const gc = groupColor(n.project?.group);
        ctx.globalAlpha = 1;
        if (n.e > 0.05) {
          ctx.shadowColor = gc;
          ctx.shadowBlur = 18 * n.e;
        }
        ctx.fillStyle = gc;
        inkBlob(n, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        // the pen goes round a second time, not quite on the first line
        ctx.strokeStyle = gc;
        ctx.globalAlpha = 0.5 + n.e * 0.4;
        ctx.lineWidth = 1;
        inkBlob(n, r + 1.8 + n.e * 1.6, 0.85);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // nodes are all one size now, so "featured" reads in the label only
        const isFeatured = n.project?.featured === true;
        ctx.font = isFeatured ? featuredFont : labelFont;
        ctx.globalAlpha = (isFeatured ? 0.75 : 0.55) + n.e * (isFeatured ? 0.25 : 0.45);
        ctx.fillStyle = n.e > 0.35 || isFeatured ? colors.ink : colors.faint;
        ctx.fillText(n.label, n.x, n.y + r + (isFeatured ? 15 : 13));
      }

      // me, on top: photo in a breathing teal ring
      const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(frame * 0.04);
      const R = me.r + me.e * 4;
      ctx.strokeStyle = colors.teal;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha =
          (0.3 + pulse * 0.35 + me.e * 0.4) * (pass === 0 ? 1 : 0.45);
        ctx.lineWidth = pass === 0 ? 1.4 : 0.9;
        inkBlob(me, R + 6 + pulse * 3, pass === 0 ? 0 : 0.4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (photoReady) {
        ctx.save();
        inkBlob(me, R);
        ctx.clip();
        const side = Math.min(photo.width, photo.height);
        const sx = (photo.width - side) * 0.6;
        const sy = (photo.height - side) * 0.4;
        ctx.drawImage(photo, sx, sy, side, side, me.x - R, me.y - R, R * 2, R * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = colors.soft;
        inkBlob(me, R);
        ctx.fill();
      }
      ctx.globalAlpha = 0.7 + me.e * 0.3;
      ctx.fillStyle = me.e > 0.35 ? colors.accent : colors.faint;
      ctx.fillText("press to talk", me.x, me.y + R + 16);
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    const loop = () => {
      frame++;
      tick();
      draw();
      if (frame % 90 === 0) readColors();
      raf = requestAnimationFrame(loop);
    };

    resize();
    if (reduceMotion) {
      for (const n of nodes) {
        n.x = n.tx;
        n.y = n.ty;
      }
      for (let i = 0; i < 12; i++) tick();
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
    };

    const hit = (x: number, y: number): Node | null => {
      const dm = Math.hypot(x - me.x, y - me.y);
      if (dm < me.r + 8) return me;
      let best: Node | null = null;
      let bestD = 16 * 16;
      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const dx = n.x - x;
        const dy = n.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      const n = hit(x, y);
      if (n) {
        dragging = n;
        dragMoved = 0;
        canvas.setPointerCapture(e.pointerId);
        sfxPress();
      }
    };
    const onMove = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      if (dragging) {
        dragMoved += Math.abs(x - dragging.x) + Math.abs(y - dragging.y);
        if (dragging !== me) {
          dragging.x = x;
          dragging.y = y;
        }
        if (reduceMotion) {
          for (let i = 0; i < 30; i++) tick();
          draw();
        }
      } else {
        const n = hit(x, y);
        if (n !== hovered) {
          hovered = n;
          canvas.style.cursor = n ? "pointer" : "default";
          if (n && e.pointerType === "mouse") sfxHover();
          if (reduceMotion) draw();
        }
      }
    };
    const onUp = () => {
      if (dragging && dragMoved < 6) {
        const n = dragging;
        if (n.kind === "me") {
          setChatOpen(true);
        } else if (n.kind === "project") {
          onSelectRef.current(n.project!);
        }
      }
      dragging = null;
      if (reduceMotion) draw();
    };
    const onLeave = () => {
      hovered = null;
      if (reduceMotion) draw();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", resize);
    // the palette lives in CSS variables; pick the new set up the moment the
    // mood flips or the weather colours land, not 90 frames later
    const unsubscribeMood = onMoodChange(readColors);
    window.addEventListener(ATMOSPHERE_EVENT, readColors);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
      unsubscribeMood();
      window.removeEventListener(ATMOSPHERE_EVENT, readColors);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return (
    <figure className="my-6 lg:my-0">
      <div className="relative h-[520px] w-full sm:h-[560px] lg:h-[min(600px,calc(100dvh-16rem))] xl:h-[min(700px,calc(100dvh-16rem))]">
        <canvas
          ref={canvasRef}
          className={`h-full w-full touch-pan-y transition-opacity duration-500 ${
            selected ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-label="A living graph of all projects with Mateo at the center. Press the photo to chat with his agent; press a project to open its card."
        />

        <AnimatePresence>
          {selected ? (
            <motion.div
              key={selected.slug}
              role="dialog"
              aria-label={selected.name}
              className="absolute inset-0 overflow-hidden rounded-3xl bg-soft"
              initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease }}
            >
              <button
                onClick={() => onSelect(null)}
                aria-label="Back to the graph"
                className="absolute right-4 top-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-paper/85 text-ink backdrop-blur-sm transition-colors hover:text-accent"
              >
                ✕
              </button>
              <motion.div
                className="relative h-full w-full"
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease }}
              >
                <ProjectMedia items={selected.media} alt={selected.name} />
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <MateoChat open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>

      {/* the legend only explains the graph — fade it whenever the graph is
          covered, by a project or by the chat, but keep its box so nothing
          below it jumps */}
      <figcaption
        aria-hidden={selected || chatOpen ? true : undefined}
        className={`mt-3 flex min-h-10 flex-wrap items-center justify-center gap-x-5 gap-y-2 transition-opacity duration-500 ${
          selected || chatOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {[
          ["projects", "var(--w1)"],
          ["experiments / tools", "var(--w2)"],
          ["art", "var(--w3)"],
        ].map(([name, color]) => (
          <span key={name} className="label flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: color }}
            />
            {name}
          </span>
        ))}
      </figcaption>

    </figure>
  );
}
