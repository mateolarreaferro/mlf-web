"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { Project } from "@/lib/projects";
import LorenzThumb from "./LorenzThumb";
import MateoChat from "./MateoChat";

/*
  The work as a living graph, with Mateo at the center.
  "me" is the photo node — press it and the agent chat opens.
  Pressing a project swaps the graph for a full card in the same
  space: image, name, category, description, video/repo links.
*/

const ease = [0.22, 1, 0.36, 1] as const;

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
};

export default function KnowledgeGraph({ projects }: { projects: Project[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // deep link: /?project=<slug> opens that card directly
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("project");
    if (slug) setSelected(projects.find((p) => p.slug === slug) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    let labelFont = "11px var(--font-geist), system-ui, sans-serif";

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
      nodes.push({
        id: p.slug,
        label: p.name,
        kind: "project",
        project: p,
        x: Math.cos(a) * 230,
        y: Math.sin(a) * 170,
        vx: 0,
        vy: 0,
        r: 5,
        e: 0,
      });
    });

    let hovered: Node | null = null;
    let dragging: Node | null = null;
    let dragMoved = 0;

    let colors = { ink: "#0d0d0c", faint: "#8a8a83", accent: "#d9645e", soft: "#f3f3ef", paper: "#ffffff", ochre: "#d89b44", sun: "#e5dc5a" };
    const readColors = () => {
      const s = getComputedStyle(document.documentElement);
      colors = {
        ink: s.getPropertyValue("--ink").trim() || colors.ink,
        faint: s.getPropertyValue("--faint").trim() || colors.faint,
        accent: s.getPropertyValue("--accent").trim() || colors.accent,
        soft: s.getPropertyValue("--soft").trim() || colors.soft,
        paper: s.getPropertyValue("--paper").trim() || colors.paper,
        ochre: s.getPropertyValue("--ochre").trim() || colors.ochre,
        sun: s.getPropertyValue("--sun").trim() || colors.sun,
      };
    };

    const groupColor = (g: string | undefined) =>
      ({
        agents: colors.accent,
        "tools for creativity": colors.sun,
        perception: colors.ochre,
        education: colors.faint,
        "music/art": colors.ink,
      })[g ?? ""] ?? colors.ink;

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
      labelFont = `${width < 480 ? 10 : 11}px var(--font-geist), system-ui, sans-serif`;
      readColors();
      ctx.font = labelFont;
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

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);

      for (const n of nodes) {
        const target = hovered === n ? 1 : 0;
        n.e += (target - n.e) * 0.15;
      }

      // threads from me to every project
      for (const n of nodes) {
        if (n === me) continue;
        ctx.strokeStyle = groupColor(n.project?.group);
        ctx.globalAlpha = 0.14 + n.e * 0.4;
        ctx.lineWidth = 1 + n.e * 0.5;
        const mx = (me.x + n.x) / 2 + (me.y - n.y) * 0.1;
        const my = (me.y + n.y) / 2 + (n.x - me.x) * 0.1;
        ctx.beginPath();
        ctx.moveTo(me.x, me.y);
        ctx.quadraticCurveTo(mx, my, n.x, n.y);
        ctx.stroke();
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
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.55 + n.e * 0.45;
        ctx.fillStyle = n.e > 0.35 ? colors.ink : colors.faint;
        ctx.fillText(n.label, n.x, n.y + r + 12);
      }

      // me, on top: photo in a breathing ochre ring
      const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(frame * 0.04);
      const R = me.r + me.e * 4;
      ctx.globalAlpha = 0.3 + pulse * 0.35 + me.e * 0.4;
      ctx.strokeStyle = colors.ochre;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(me.x, me.y, R + 6 + pulse * 3, 0, Math.PI * 2);
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
        ctx.drawImage(photo, sx, sy, side, side, me.x - R, me.y - R, R * 2, R * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = colors.soft;
        ctx.beginPath();
        ctx.arc(me.x, me.y, R, 0, Math.PI * 2);
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
          setSelected(n.project!);
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
      <div className="relative h-[520px] w-full sm:h-[560px] lg:h-[640px] xl:h-[740px]">
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
                onClick={() => setSelected(null)}
                aria-label="Back to the graph"
                className="absolute right-4 top-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-paper/85 text-ink backdrop-blur-sm transition-colors hover:text-accent"
              >
                ✕
              </button>
              <div className="flex h-full flex-col">
                <motion.div
                  className="relative min-h-0 flex-1"
                  initial={{ opacity: 0, scale: 1.03 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease }}
                >
                  {selected.image ? (
                    <Image
                      src={selected.image}
                      alt={selected.name}
                      fill
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <LorenzThumb />
                  )}
                </motion.div>
                <div className="grid max-h-[65%] shrink-0 items-start gap-x-10 gap-y-4 overflow-y-auto p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:p-8">
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease, delay: 0.12 }}
                  >
                    <p className="label !text-ochre">{selected.category}</p>
                    <h3 className="mt-1 text-2xl font-light tracking-tight lg:text-3xl">
                      {selected.name}
                    </h3>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease, delay: 0.22 }}
                  >
                    <p className="line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-faint">
                      {selected.description}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {[
                        selected.video ? { href: selected.video, text: "watch video" } : null,
                        selected.repo ? { href: selected.repo, text: "repository" } : null,
                        selected.link ? { href: selected.link, text: "visit" } : null,
                      ]
                        .filter((a): a is { href: string; text: string } => a !== null)
                        .map((a) => (
                          <a
                            key={a.text}
                            href={a.href}
                            target="_blank"
                            rel="noreferrer"
                            className="label whitespace-nowrap rounded-full bg-ink px-4 py-1.5 !text-paper transition-transform hover:scale-105"
                          >
                            {a.text} ↗
                          </a>
                        ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {[
          ["agents", "var(--accent)"],
          ["tools for creativity", "var(--sun)"],
          ["perception", "var(--ochre)"],
          ["education", "var(--faint)"],
          ["music/art", "var(--ink)"],
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

      <MateoChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </figure>
  );
}
