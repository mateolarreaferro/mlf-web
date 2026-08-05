"use client";

import { useEffect, useRef } from "react";

/* A Lorenz attractor, drawn live — the card image for Attractor. */
export default function LorenzThumb() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d9645e";

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = 0.1, y = 0, z = 0;
    const sigma = 10, rho = 28, beta = 8 / 3, dt = 0.004;
    // uniform scale so the attractor keeps its shape at any canvas aspect
    const s = Math.min(w / 42, h / 50);
    const px = (v: number) => w / 2 + v * s;
    const py = (v: number) => h / 2 + 24 * s - v * s;

    let raf = 0;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.8;

    const step = (steps: number) => {
      ctx.beginPath();
      ctx.moveTo(px(x), py(z));
      for (let i = 0; i < steps; i++) {
        x += sigma * (y - x) * dt;
        y += (x * (rho - z) - y) * dt;
        z += (x * y - beta * z) * dt;
        ctx.lineTo(px(x), py(z));
      }
      ctx.stroke();
    };

    if (reduceMotion) {
      step(14000);
    } else {
      const tick = () => {
        step(60);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="w-full h-full" aria-hidden="true" />;
}
