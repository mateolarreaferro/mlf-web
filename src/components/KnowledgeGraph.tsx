"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import { sfxHover, sfxPress } from "@/lib/sfx";
import { FADE_MS, subscribe as onMoodChange } from "@/lib/mood";
import { ATMOSPHERE_EVENT } from "./WeatherAtmosphere";
import ProjectMedia, { mediaRatio } from "./ProjectMedia";
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

/* one radius for every project node (its footprint; the dot drawn inside is smaller) */
const NODE_R = 6;

/*
  The graph is an instrument, not a drawing: exact circles, hairline straight
  threads, orbit rings and a slowly turning ring of ticks, with small pulses
  of light travelling out along the threads. Each node's phase is seeded from
  its slug, so the breathing and the pulses keep the same rhythm every visit.
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
  /* how fast this thread's pulse travels, so they don't march in step */
  speed: number;
  /* half-extent of the dot + its label, used to keep nodes from colliding */
  halfW: number;
  halfH: number;
};

export default function KnowledgeGraph({
  projects,
  selected,
  onSelect,
  inlineCard = true,
}: {
  projects: Project[];
  selected: Project | null;
  onSelect: (p: Project | null) => void;
  /* the project card inside the graph box; off on a phone, where it opens as ProjectSheet */
  inlineCard?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // the canvas effect only re-runs on `projects`, so reach for the
  // latest callback through a ref rather than capturing a stale one
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /*
    Let the graph rest. It breathes on every frame by design, but not while
    nobody can see it: a project card or the chat covers it, or it has been
    scrolled off the screen. The loop stops itself in those states and is
    woken by whatever ends them. `covered` reaches the loop through a ref so
    the canvas effect can stay keyed to `projects` alone.
  */
  const coveredRef = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    coveredRef.current = selected !== null || chatOpen;
    wakeRef.current();
  }, [selected, chatOpen]);

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
    /* one radius: the orbits are circles, never an oval stretched to the box */
    let orbit = 200;
    /* the outer ring of ticks: always clear of every label (see fit()) */
    let outer = 260;
    /* the ring as drawn: eases outward if a live label reaches further than fit() expected */
    let ringR = 0;
    let labelFont = "11px var(--font-inter), system-ui, sans-serif";
    /* a phone-width canvas: only featured names are written (ProjectIndex lists the rest) */
    let quiet = false;
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
      halfW: 90,
      halfH: 90,
      speed: meRand(),
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
        speed: 0.0025 + rand() * 0.002,
      });
    });

    let hovered: Node | null = null;
    let dragging: Node | null = null;
    let dragMoved = 0;

    /*
      The three group colours are the background's three blobs (--g1..3 in
      globals.css), so the graph is painted from the same light as the page
      behind it.
    */
    type Palette = { ink: string; faint: string; accent: string; soft: string; paper: string; g1: string; g2: string; g3: string };
    let target: Palette = { ink: "#1b1d1b", faint: "#5d625e", accent: "#1a3a2a", soft: "#e8e7e1", paper: "#f4f3ee", g1: "#2e6b4b", g2: "#5f71c7", g3: "#b97c3a" };
    let colors: Palette = target;
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
      target = {
        ink: read("--ink", target.ink),
        faint: read("--faint", target.faint),
        accent: read("--accent", target.accent),
        soft: read("--soft", target.soft),
        paper: read("--paper", target.paper),
        g1: read("--g1", target.g1),
        g2: read("--g2", target.g2),
        g3: read("--g3", target.g3),
      };
      if (!blendFrom) colors = target;
    };

    /*
      The tokens are plain hex and switch at once, but the page around the
      graph fades (700ms for a press, a minute when the sun sets under an open
      page), so the graph walks its own colours over the same time rather
      than snapping ahead of the paper. The mood listener says how long.
    */
    let blendFrom: Palette | null = null;
    let blendStart = 0;
    let blendMs = FADE_MS;
    const hex = (c: string) =>
      /^#[0-9a-f]{6}$/i.test(c)
        ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
        : null;
    const mix = (a: string, b: string, t: number) => {
      const x = hex(a);
      const y = hex(b);
      if (!x || !y) return b;
      const ch = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, "0");
      return `#${ch(0)}${ch(1)}${ch(2)}`;
    };
    const blend = () => {
      if (!blendFrom) return;
      const t = Math.min(1, (performance.now() - blendStart) / blendMs);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const from = blendFrom;
      colors = Object.fromEntries(
        (Object.keys(target) as (keyof Palette)[]).map((k) => [k, mix(from[k], target[k], e)]),
      ) as Palette;
      if (t >= 1) blendFrom = null;
    };
    const startBlend = (ms: number) => {
      blendFrom = { ...colors };
      blendStart = performance.now();
      blendMs = ms;
      readColors();
      if (reduceMotion) {
        blendFrom = null;
        colors = target;
        draw();
      } else wake();
    };

    const groupColor = (g: string | undefined) =>
      ({
        projects: colors.g1,
        "experiments / tools": colors.g2,
        art: colors.g3,
      })[g ?? ""] ?? colors.faint;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the largest circle that leaves room for the labels on every side;
      // on a phone the width decides, and the labels may reach the edges
      orbit = Math.max(
        Math.min(width / 2 - 80, height / 2 - 64),
        Math.min(width * 0.36, height / 2 - 64),
      );
      me.r = Math.min(width, height) > 700 ? 66 : Math.min(width, height) > 540 ? 58 : 42;
      quiet = width < 480;
      labelFont = `${width < 480 ? 10 : 11}px var(--font-inter), system-ui, sans-serif`;
      featuredFont = `${width < 480 ? 12 : 14}px var(--font-inter), system-ui, sans-serif`;
      readColors();
      ctx.font = labelFont;
      // a node's footprint is its label, not its dot — measure it once here
      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const isFeatured = n.project?.featured === true;
        ctx.font = isFeatured ? featuredFont : labelFont;
        if (quiet && !isFeatured) {
          // no label to make room for, only the dot and its ring
          n.halfW = NODE_R + 9;
          n.halfH = NODE_R + 9;
          continue;
        }
        n.halfW = Math.max(NODE_R, ctx.measureText(n.label).width / 2) + 7;
        n.halfH = NODE_R + (isFeatured ? 15 : 13) + 5;
      }
      me.halfW = me.r + 10;
      me.halfH = me.r + 32;
      ctx.font = labelFont;
      fit();
    };

    /*
      Seat everything, then measure how far the farthest label reaches (the
      far corner of its box) and put the outer ring a clear gap beyond it.
      If that ring would leave the canvas, shrink the orbit and try again,
      so the ring never runs through a name.
    */
    const GAP = 18;
    /*
      How far from the centre a node reaches: its dot and ring, or its label
      (written NODE_R + 13..15 below the dot), whichever is further. Measured
      as two boxes, not one: one box round dot and label together has an
      empty corner that over-counts every diagonal node.
    */
    const reachOf = (n: Node) => {
      const dot = Math.hypot(Math.abs(n.x) + 11, Math.abs(n.y) + 11);
      if (quiet && !n.project?.featured) return dot;
      const half = n.halfW - 7 + 2;
      const below = Math.max(Math.abs(n.y + NODE_R + 6), Math.abs(n.y + NODE_R + 22));
      return Math.max(dot, Math.hypot(Math.abs(n.x) + half, below));
    };
    // on a phone-width canvas the labels reach the edges and an outer ring
    // would run straight through them, so it is left out there
    const roomy = () => width >= 560;
    const fit = () => {
      // a phone-width canvas draws no outer ring, so there is nothing to clear
      if (!roomy()) {
        layout();
        return;
      }
      const limit = Math.min(width, height) / 2 - 8;
      for (let pass = 0; pass < 8; pass++) {
        layout();
        // settle a scratch copy with the live loop's own step (glide to the
        // seat, then separation pushes crowded nodes off it), measure that,
        // then put things back
        const saved = nodes.map((n) => [n.x, n.y]);
        for (const n of nodes) {
          if (n === me) continue;
          n.x = n.tx;
          n.y = n.ty;
        }
        for (let k = 0; k < 90; k++) tick();
        let reach = 0;
        for (const n of nodes) if (n.kind === "project") reach = Math.max(reach, reachOf(n));
        nodes.forEach((n, i) => {
          n.x = saved[i][0];
          n.y = saved[i][1];
        });
        outer = reach + GAP;
        if (outer <= limit) return;
        orbit *= (limit / outer) * 0.99;
      }
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
          n.tx = Math.cos(a) * orbit * ring;
          n.ty = Math.sin(a) * orbit * ring;
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

    /* a hex colour at an alpha, for gradients */
    const rgba = (c: string, a: number) => {
      const x = hex(c);
      return x ? `rgba(${x[0]},${x[1]},${x[2]},${a})` : c;
    };

    const circle = (r: number) => {
      ctx.beginPath();
      ctx.arc(me.x, me.y, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    const draw = () => {
      blend();
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      for (const n of nodes) {
        const target = hovered === n ? 1 : 0;
        n.e += (target - n.e) * 0.15;
      }

      /*
        The instrument: the orbits the seats sit on, dashed, and an outer
        ring of ticks turning very slowly, with each group's arc marked in
        its colour so the three neighbourhoods read before any label does.
      */
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = colors.faint;
      ctx.setLineDash([2, 7]);
      ctx.globalAlpha = 0.22;
      circle(orbit * 0.84);
      circle(orbit * 1.12);
      ctx.setLineDash([]);

      const turn = frame * 0.0006;
      // fit() placed the ring from a settled layout; the live one can sit a
      // few pixels further out, so the ring follows whichever reaches further
      let live = 0;
      for (const n of nodes) if (n.kind === "project") live = Math.max(live, reachOf(n) + 12);
      const want = Math.min(Math.max(outer, live), Math.min(width, height) / 2 - 4);
      ringR = ringR ? ringR + (want - ringR) * 0.08 : want;
      const ro = ringR;
      const ring = roomy();
      for (let i = 0; ring && i < 120; i++) {
        const a = turn + (i / 120) * Math.PI * 2;
        const major = i % 10 === 0;
        const len = major ? 7 : 3;
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        ctx.globalAlpha = major ? 0.3 : 0.14;
        ctx.beginPath();
        ctx.moveTo(cx * ro, cy * ro);
        ctx.lineTo(cx * (ro + len), cy * (ro + len));
        ctx.stroke();
      }
      ctx.lineWidth = 1.2;
      for (const [group, peers] of byGroup) {
        if (!peers.length || !ring) continue;
        const c = sectorOf(group);
        ctx.strokeStyle = groupColor(group);
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(0, 0, ro - 3, c - SECTOR * 0.41, c + SECTOR * 0.41);
        ctx.stroke();
      }

      // threads: hairlines from me, brightening toward the node they reach
      for (const n of nodes) {
        if (n === me) continue;
        const gc = groupColor(n.project?.group);
        const grad = ctx.createLinearGradient(me.x, me.y, n.x, n.y);
        grad.addColorStop(0, rgba(gc, 0));
        grad.addColorStop(1, rgba(gc, 0.38 + n.e * 0.5));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.7 + n.e * 0.6;
        ctx.beginPath();
        ctx.moveTo(me.x, me.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();

        // a pulse travelling outward, then a rest before the next one
        if (!reduceMotion) {
          const t = (frame * n.speed + n.phase) % 1.6;
          if (t < 1) {
            const k = 0.12 + t * 0.88;
            ctx.fillStyle = gc;
            ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9;
            ctx.beginPath();
            ctx.arc(me.x + (n.x - me.x) * k, me.y + (n.y - me.y) * k, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const gc = groupColor(n.project?.group);
        // the dot, exact, with a soft light of its own colour
        ctx.globalAlpha = 1;
        ctx.shadowColor = gc;
        ctx.shadowBlur = 8 + n.e * 14;
        ctx.fillStyle = gc;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 3.2 + n.e * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // a thin ring that opens out and grows crosshair ticks under the pointer
        const ring = 6.5 + n.e * 4;
        ctx.strokeStyle = gc;
        ctx.lineWidth = 0.75;
        ctx.globalAlpha = 0.45 + n.e * 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, ring, 0, Math.PI * 2);
        ctx.stroke();
        if (n.e > 0.02) {
          ctx.globalAlpha = n.e;
          ctx.beginPath();
          for (let q = 0; q < 4; q++) {
            const a = (q * Math.PI) / 2 + Math.PI / 4;
            ctx.moveTo(n.x + Math.cos(a) * (ring + 2), n.y + Math.sin(a) * (ring + 2));
            ctx.lineTo(n.x + Math.cos(a) * (ring + 6), n.y + Math.sin(a) * (ring + 6));
          }
          ctx.stroke();
        }
        const isFeatured = n.project?.featured === true;
        // on a phone an unfeatured name appears only while it is touched
        if (quiet && !isFeatured && n.e < 0.05) continue;
        ctx.font = isFeatured ? featuredFont : labelFont;
        ctx.globalAlpha =
          quiet && !isFeatured
            ? n.e
            : (isFeatured ? 0.85 : 0.6) + n.e * (isFeatured ? 0.15 : 0.4);
        ctx.fillStyle = n.e > 0.35 || isFeatured ? colors.ink : colors.faint;
        ctx.fillText(n.label, n.x, n.y + NODE_R + (isFeatured ? 15 : 13));
      }

      /*
        Me, on top: the portrait in a perfect circle, in black and white
        until the pointer finds it, inside a fine ring with a scanning arc.
      */
      const R = me.r + me.e * 3;
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = colors.faint;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(me.x, me.y, R + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([1.5, 5]);
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(me.x, me.y, R + 14, -turn * 3, Math.PI * 2 - turn * 3);
      ctx.stroke();
      ctx.setLineDash([]);
      const sweep = reduceMotion ? -Math.PI / 2 : frame * 0.012;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55 + me.e * 0.4;
      ctx.beginPath();
      ctx.arc(me.x, me.y, R + 7, sweep, sweep + Math.PI / 3);
      ctx.stroke();

      ctx.globalAlpha = 1;
      if (photoReady) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(me.x, me.y, R, 0, Math.PI * 2);
        ctx.clip();
        const side = Math.min(photo.width, photo.height);
        const sx = (photo.width - side) * 0.6;
        const sy = (photo.height - side) * 0.4;
        ctx.filter = `grayscale(${1 - me.e}) contrast(1.05)`;
        ctx.drawImage(photo, sx, sy, side, side, me.x - R, me.y - R, R * 2, R * 2);
        ctx.filter = "none";
        ctx.restore();
      } else {
        ctx.fillStyle = colors.soft;
        ctx.beginPath();
        ctx.arc(me.x, me.y, R, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = labelFont;
      ctx.globalAlpha = 0.7 + me.e * 0.3;
      ctx.fillStyle = me.e > 0.35 ? colors.ink : colors.faint;
      ctx.fillText("press to talk", me.x, me.y + R + 26);
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    let running = false;
    let onScreen = true;
    const loop = () => {
      if (!onScreen || coveredRef.current) {
        running = false;
        return;
      }
      frame++;
      tick();
      draw();
      if (frame % 90 === 0) readColors();
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (reduceMotion) {
        draw();
        return;
      }
      if (running || !onScreen || coveredRef.current) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    wakeRef.current = wake;
    const watcher = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      wake();
    });
    watcher.observe(canvas);

    resize();
    if (reduceMotion) {
      for (const n of nodes) {
        n.x = n.tx;
        n.y = n.ty;
      }
      for (let i = 0; i < 12; i++) tick();
      draw();
    } else {
      wake();
    }

    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
    };

    /*
      What a press lands on. The photo, else the nearest project whose dot or
      label was touched: the name is as good a target as the dot, and a
      fingertip gets a wider reach than a cursor.
    */
    const hit = (x: number, y: number, touch = false): Node | null => {
      const dm = Math.hypot(x - me.x, y - me.y);
      if (dm < me.r + 8) return me;
      const reach = touch ? 26 : 16;
      let best: Node | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        if (n.kind !== "project") continue;
        const dx = n.x - x;
        const dy = n.y - y;
        const d = dx * dx + dy * dy;
        // the label box hangs below the dot (see the wall in tick())
        const onLabel =
          Math.abs(dx) <= n.halfW && y >= n.y - n.r - 4 && y <= n.y + n.halfH + 2;
        if ((d < reach * reach || onLabel) && d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      const n = hit(x, y, e.pointerType !== "mouse");
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
        const n = hit(x, y, e.pointerType !== "mouse");
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
    // a swipe that began on a node becomes a page scroll (touch-pan-y) and the
    // browser cancels the pointer: let go, or the node stays held forever
    const onCancel = () => {
      dragging = null;
      hovered = null;
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
    canvas.addEventListener("pointercancel", onCancel);
    window.addEventListener("resize", resize);
    // the palette lives in CSS variables; pick the new set up the moment the
    // mood flips or the weather colours land, not 90 frames later
    const unsubscribeMood = onMoodChange((_, fadeMs) => startBlend(fadeMs));
    const onAtmosphere = () => startBlend(FADE_MS);
    window.addEventListener(ATMOSPHERE_EVENT, onAtmosphere);
    return () => {
      cancelAnimationFrame(raf);
      watcher.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("resize", resize);
      unsubscribeMood();
      window.removeEventListener(ATMOSPHERE_EVENT, onAtmosphere);
    };
  }, [projects]);

  // the card takes the shape of whatever it holds (mediaRatio)
  const cardRatio = selected ? mediaRatio(selected.media) : 1;

  return (
    <figure className="my-6 lg:my-0" data-tour="graph">
      <div className="relative h-[var(--graph-h)] w-full" data-tour="graph-box">
        <canvas
          ref={canvasRef}
          className={`h-full w-full touch-pan-y transition-opacity duration-500 ${
            selected && inlineCard ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-label="A living graph of all projects with Mateo at the center. Press the photo to chat with his agent; press a project to open its card."
        />

        <AnimatePresence>
          {selected && inlineCard ? (
            <motion.div
              key={selected.slug}
              role="dialog"
              aria-label={selected.name}
              /* Centred in the graph box and shaped to its picture: a fixed
                 square cropped every wide screenshot in half. Height is
                 capped at 70% of the box — at full bleed the card swallowed
                 the viewport and read as a billboard — and width at 90% of
                 the column, which is what a wide, short image hits first. */
              className="absolute inset-0 m-auto overflow-hidden rounded-3xl bg-soft"
              style={{
                aspectRatio: cardRatio,
                width: `min(90%, calc(var(--graph-h) * 0.7 * ${cardRatio}))`,
              }}
              initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease }}
            >
              <button
                onClick={() => onSelect(null)}
                aria-label="Back to the graph"
                className="absolute right-3 top-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-paper/85 text-ink backdrop-blur-sm transition-colors hover:text-accent"
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

        <MateoChat open={chatOpen} onClose={() => setChatOpen(false)} fullScreen={!inlineCard} />
      </div>

      {/* the legend only explains the graph: fade it whenever the graph is
          covered, by a project or by the chat, but keep its box so nothing
          below it jumps. On a phone ProjectIndex's group headings say the same. */}
      <figcaption
        aria-hidden={selected || chatOpen ? true : undefined}
        className={`mt-3 hidden min-h-10 flex-wrap items-center justify-center gap-x-5 gap-y-2 transition-opacity lg:flex duration-500 ${
          selected || chatOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {[
          ["projects", "var(--g1)"],
          ["experiments / tools", "var(--g2)"],
          ["art", "var(--g3)"],
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
