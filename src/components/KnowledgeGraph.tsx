"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import ProjectMedia from "./ProjectMedia";
import MateoChat from "./MateoChat";

/*
  The work as a living graph, with Mateo at the center.
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
  vx: number;
  vy: number;
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

    const meRand = seeded("mateo");
    const me: Node = {
      id: "me",
      label: "me",
      kind: "me",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
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

    const nodes: Node[] = [me];
    projects.forEach((p, i) => {
      const a = (i / projects.length) * Math.PI * 2 + 0.4;
      const rand = seeded(p.slug);
      nodes.push({
        id: p.slug,
        label: p.name,
        kind: "project",
        project: p,
        x: Math.cos(a) * 230,
        y: Math.sin(a) * 170,
        vx: 0,
        vy: 0,
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

    let colors = { ink: "#23282c", faint: "#656f77", accent: "#23718f", soft: "#eeece6", paper: "#f8f7f4", sun: "#f9c74f", leaf: "#90be6d", teal: "#4d908e", flame: "#f94144" };
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      colors = {
        ink: s.getPropertyValue("--ink").trim() || colors.ink,
        faint: s.getPropertyValue("--faint").trim() || colors.faint,
        accent: s.getPropertyValue("--accent").trim() || colors.accent,
        soft: s.getPropertyValue("--soft").trim() || colors.soft,
        paper: s.getPropertyValue("--paper").trim() || colors.paper,
        sun: s.getPropertyValue("--sun").trim() || colors.sun,
        leaf: s.getPropertyValue("--leaf").trim() || colors.leaf,
        teal: s.getPropertyValue("--teal").trim() || colors.teal,
        flame: s.getPropertyValue("--flame").trim() || colors.flame,
      };
    };

    const groupColor = (g: string | undefined) =>
      ({
        agents: colors.flame,
        "tools for creativity": colors.sun,
        perception: colors.leaf,
        education: colors.teal,
        "music/art": colors.accent,
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

            if (ox < oy) {
              const push = (dx < 0 ? -ox : ox) * share;
              if (!aFixed) a.x -= push;
              if (!bFixed) b.x += push;
            } else {
              const push = (dy < 0 ? -oy : oy) * share;
              if (!aFixed) a.y -= push;
              if (!bFixed) b.y += push;
            }
          }
        }
      }
    };

    const bounds = () => {
      const mx = width / 2 - 84;
      const my = height / 2 - 36;
      for (const n of nodes) {
        if (n === me) continue;
        if (n.x < -mx) n.vx += (-mx - n.x) * 0.02;
        if (n.x > mx) n.vx -= (n.x - mx) * 0.02;
        if (n.y < -my) n.vy += (-my - n.y) * 0.02;
        if (n.y > my) n.vy -= (n.y - my) * 0.02;
      }
    };

    const tick = () => {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 60);
          const k = a === me || b === me ? 9000 : 3400;
          const f = k / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx += dx * f;
          a.vy += dy * f;
          b.vx -= dx * f;
          b.vy -= dy * f;
        }
      }
      // every project is tethered to an ellipse around me,
      // so the layout fills whatever rectangle the canvas has
      for (const n of nodes) {
        if (n === me) continue;
        const dx = n.x - me.x;
        const dy = n.y - me.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const nr = Math.hypot(dx / orbitX, dy / orbitY);
        const f = (nr - 1) * 2.2;
        n.vx -= (dx / d) * f;
        n.vy -= (dy / d) * f;
      }
      separate();
      bounds();
      for (const n of nodes) {
        if (n === me) continue;
        if (!reduceMotion) {
          n.vx += Math.sin(frame * 0.008 + n.x * 0.05) * 0.006;
          n.vy += Math.cos(frame * 0.009 + n.y * 0.05) * 0.006;
        }
        if (n !== dragging) {
          n.x += n.vx;
          n.y += n.vy;
        }
        n.vx *= 0.85;
        n.vy *= 0.85;
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
    for (let i = 0; i < 320; i++) tick();
    if (reduceMotion) {
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
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return (
    <figure className="my-6 lg:my-0">
      <div className="relative h-[520px] w-full sm:h-[560px] lg:h-[min(600px,calc(100dvh-16rem))] xl:h-[min(700px,calc(100dvh-16rem))]">
        <canvas
          ref={canvasRef}
          className={`h-full w-full touch-none transition-opacity duration-500 ${
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
          ["agents", "var(--flame)"],
          ["tools for creativity", "var(--sun)"],
          ["perception", "var(--leaf)"],
          ["education", "var(--teal)"],
          ["music/art", "var(--accent)"],
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
