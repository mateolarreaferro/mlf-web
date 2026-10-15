'use client';

/**
 * Procedural portraits whose expression is driven by live engine state.
 *
 * No image assets and no per-agent art: the silhouette is derived from a hash of
 * the agent id, and every facial feature, eye openness, gaze direction, brow
 * angle, mouth curve, blush, is a function of the PAD values and the discrete
 * emotion label that L3 wrote on the last AffectRecord.
 *
 * This is the intimacy of the interface: you watch someone's face change, and
 * what you are actually watching is `mood.valence + 0.6 * emotion.valence`.
 */

import { useEffect, useRef } from 'react';

export interface FaceProps {
  agentId: string;
  name: string;
  /** Channel colour, rose for the first agent, periwinkle for the second (the hair, the blush, the name). */
  colour: string;
  /** Felt valence, -1..1. */
  valence: number;
  /** Arousal, -1..1. */
  arousal: number;
  /** Discrete label, used for the handful of expressions valence can't carry. */
  label?: string;
  speaking?: boolean;
  /** Renders smaller, for the transcript gutter. */
  size?: number;
  muted?: boolean;
  /**
   * Drawn to be rasterised into a 40 by 40 sprite (PixelPortrait): no aura,
   * flat fills, strokes thick enough to survive the downsample.
   */
  pixel?: boolean;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Emotions where gaze direction says more than valence can. */
const AVERTS = new Set(['awkwardness', 'embarrassment', 'anxiety', 'hurt']);
const DROOPS = new Set(['boredom', 'disappointment']);
const ASYMMETRIC = new Set(['contempt', 'amusement', 'tease']);

export function Portrait({
  agentId, name, colour, valence, arousal, label, speaking = false, size = 132, muted = false, pixel = false,
}: FaceProps) {
  // Each trait gets its own salted hash. Slicing bits out of a single FNV value
  // gave correlated traits, two thirds of the cast ended up in glasses.
  const crownH = 16 + (hash(agentId + 'crown') % 8);      // 16–23: skull-hugging → tall
  const sideLen = [0, 0, 18, 30, 44, 56][hash(agentId + 'side') % 6];
  const bun = hash(agentId + 'bun') % 6 === 0;
  const fringe = hash(agentId + 'fringe') % 3 === 0;
  const glasses = hash(agentId + 'specs') % 4 === 0;
  const faceRx = 24.5 + (hash(agentId + 'face') % 5) * 0.9; // 24.5–28.1
  const partLeft = hash(agentId + 'part') % 2 === 0;
  const hairTone = 0.72 + (hash(agentId + 'tone') % 4) * 0.08;

  const v = clamp(valence, -1, 1);
  const a = clamp(arousal, -1, 1);

  // --- features from state -------------------------------------------------
  // Amplitudes are deliberately large: at portrait size a physically "accurate"
  // 2px mouth delta is invisible, and the whole point of the interface is that
  // you can read the affect state off the face at a glance.
  const droop = label && DROOPS.has(label) ? 0.4 : 0;
  const eyeOpen = clamp(0.62 + 0.34 * a - 0.34 * Math.max(0, -v) - droop, 0.1, 1.1);
  const gazeX = label && AVERTS.has(label) ? (partLeft ? -2.2 : 2.2) : v * 0.5;
  const gazeY = droop ? 1.4 : -v * 0.4;
  const browLift = -v * 3.4 + (label === 'anxiety' ? -2 : 0);
  // Inner brow rises on distress, the reliable sadness tell.
  const browInner = Math.max(0, -v) * 3.6;
  const mouthCurve = v * 11;
  const mouthWidth = 8.5 + 3.5 * Math.max(0, v) + 1.5 * a;
  // A real smile opens slightly when the person is also activated.
  const mouthOpen = Math.max(0, v) * Math.max(0, a) * 3.4;
  const blush = clamp(v * 0.55 + a * 0.2, 0, 0.45);
  const asym = label && ASYMMETRIC.has(label) ? 2.6 : 0;

  const auraR = 47 + a * 5;
  const auraOpacity = muted ? 0.1 : clamp(0.2 + Math.abs(v) * 0.38 + Math.max(0, a) * 0.16, 0.12, 0.68);

  const gid = `p-${agentId}`;
  // At sprite scale a 1.7px line is half a pixel, so the pixel face draws everything heavier.
  const sw = pixel ? 2.6 : 1;
  const eyeR = pixel ? 4.4 : 3.1;
  const skin = muted ? '#e8e6e3' : pixel ? '#f0c9a6' : '#f2ded2';

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={`${name}, expression: ${label ?? 'neutral'}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={`${gid}-aura`}>
          <stop offset="45%" stopColor={colour} stopOpacity={auraOpacity} />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${gid}-crown`}>
          <rect x="20" y="14" width="80" height="36" />
        </clipPath>
      </defs>

      {/* aura, radius tracks arousal, opacity tracks intensity (not in the sprite: it would quantise to a halo) */}
      {!pixel && (
        <circle
          cx="60" cy="60" r={auraR}
          fill={`url(#${gid}-aura)`}
          style={{ transition: 'r 700ms ease, opacity 700ms ease' }}
        />
      )}

      {/* speaking ring */}
      {!pixel && (
        <circle
          cx="60" cy="58" r="31"
          fill="none" stroke={colour}
          strokeWidth={speaking ? 1.6 : 0}
          strokeOpacity={speaking ? 0.55 : 0}
          style={{ transition: 'stroke-width 260ms ease, stroke-opacity 260ms ease' }}
        />
      )}

      {/* head */}
      <ellipse cx="60" cy="58" rx={faceRx} ry="26" fill={skin} />
      {/* neck + shoulders */}
      <path d="M52 80 h16 v6 q14 4 18 16 h-52 q4 -12 18 -16 z" fill={skin} />

      {/* blush, a flat patch in the sprite once it is strong enough to be seen */}
      <ellipse cx={60 - faceRx * 0.55} cy="65" rx="5" ry="3" fill={colour} opacity={pixel ? (blush > 0.18 ? 0.8 : 0) : blush} style={{ transition: 'opacity 600ms ease' }} />
      <ellipse cx={60 + faceRx * 0.55} cy="65" rx="5" ry="3" fill={colour} opacity={pixel ? (blush > 0.18 ? 0.8 : 0) : blush} style={{ transition: 'opacity 600ms ease' }} />

      {/* hair, crown height, side length, bun and fringe all vary independently */}
      <g fill={colour} opacity={muted ? 0.28 : pixel ? 1 : hairTone}>
        {bun && <circle cx="60" cy={44 - crownH} r="8.5" />}
        {sideLen > 0 && (
          <>
            <rect x={60 - faceRx - 1.5} y="44" width="7" height={sideLen} rx="3.5" />
            <rect x={60 + faceRx - 5.5} y="44" width="7" height={sideLen} rx="3.5" />
          </>
        )}
        <g clipPath={`url(#${gid}-crown)`}>
          <ellipse cx="60" cy="46" rx={faceRx + 1.5} ry={crownH} />
        </g>
        {fringe && <rect x={partLeft ? 60 - faceRx + 2 : 60} y="32" width={faceRx - 2} height="9" rx="4.5" />}
      </g>

      {glasses && (
        <g stroke="#2b2320" strokeWidth={1.3 * sw} fill="none" opacity="0.8">
          <circle cx="50" cy="57" r="7.5" />
          <circle cx="70" cy="57" r="7.5" />
          <path d="M57.5 57 h5" />
        </g>
      )}

      {/* face */}
      <g stroke="#2b2320" strokeLinecap="round" fill="none">
        {/* brows */}
        <path
          d={`M44 ${48 + browLift + browInner} q6 ${-2.5 - browInner} 12 0`}
          strokeWidth={1.7 * sw}
          style={{ transition: 'd 500ms ease' }}
        />
        <path
          d={`M64 ${48 + browLift} q6 ${-2.5} 12 ${browInner}`}
          strokeWidth={1.7 * sw}
          style={{ transition: 'd 500ms ease' }}
        />

        {/* eyes */}
        <ellipse
          cx={50 + gazeX} cy={57 + gazeY} rx={eyeR} ry={eyeR * eyeOpen}
          fill="#2b2320" stroke="none"
          style={{ transition: 'ry 400ms ease, cx 500ms ease, cy 500ms ease' }}
        />
        <ellipse
          cx={70 + gazeX} cy={57 + gazeY} rx={eyeR} ry={eyeR * eyeOpen}
          fill="#2b2320" stroke="none"
          style={{ transition: 'ry 400ms ease, cx 500ms ease, cy 500ms ease' }}
        />

        {/* mouth, closed curve, or an open one when happy and activated */}
        {mouthOpen > 0.6 ? (
          <path
            d={`M${60 - mouthWidth} ${71 - asym} Q60 ${71 + mouthCurve + mouthOpen} ${60 + mouthWidth} 71 Q60 ${71 + mouthCurve - mouthOpen} ${60 - mouthWidth} ${71 - asym}`}
            strokeWidth={1.9 * sw} fill="#2b2320" fillOpacity="0.85"
            style={{ transition: 'd 500ms ease' }}
          />
        ) : (
          <path
            d={`M${60 - mouthWidth} ${71 - asym} Q60 ${71 + mouthCurve} ${60 + mouthWidth} 71`}
            strokeWidth={2.1 * sw}
            style={{ transition: 'd 500ms ease' }}
          />
        )}
      </g>
    </svg>
  );
}

/** The felt valence the face reads from, the same combination the gates use. */
export function felt(mood: { valence: number }, emotion: { valence: number }) {
  return clamp(mood.valence + 0.6 * emotion.valence, -1, 1);
}
export function feltArousal(mood: { arousal: number }, emotion: { arousal: number }) {
  return clamp(mood.arousal + 0.6 * emotion.arousal, -1, 1);
}

/** Six levels a channel: the 216 colours of an old palette. */
const quant = (v: number) => Math.round(v / 51) * 51;

/**
 * The same face as a sprite. The SVG is rendered out of sight, serialised,
 * drawn at `px` by `px` (40 by default), every pixel snapped to the 216-colour
 * palette with a hard alpha edge, and scaled back up without smoothing. It is
 * redrawn whenever the state that moves the face changes, so the expression
 * still changes with the date, in steps instead of eased.
 */
export function PixelPortrait({ px = 40, size = 120, speaking = false, ...face }: FaceProps & { px?: number }) {
  const holderRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { agentId, colour, valence, arousal, label, muted } = face;

  useEffect(() => {
    const svg = holderRef.current?.querySelector('svg');
    const canvas = canvasRef.current;
    if (!svg || !canvas) return;
    let cancelled = false;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (cancelled) return;
      const small = document.createElement('canvas');
      small.width = px;
      small.height = px;
      const sc = small.getContext('2d');
      const ctx = canvas.getContext('2d');
      if (!sc || !ctx) return;
      sc.drawImage(img, 0, 0, px, px);
      const image = sc.getImageData(0, 0, px, px);
      const d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
        d[i + 3] = 255;
        d[i] = quant(d[i]);
        d[i + 1] = quant(d[i + 1]);
        d[i + 2] = quant(d[i + 2]);
      }
      sc.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    return () => { cancelled = true; };
  }, [agentId, colour, valence, arousal, label, muted, px, size]);

  return (
    <span className="relative block" style={{ width: '100%', maxWidth: size, aspectRatio: '1 / 1' }}>
      <span ref={holderRef} aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <Portrait {...face} size={px * 3} pixel />
      </span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="ls-pixel block"
        style={{ width: '100%', height: '100%', outline: speaking ? `2px dashed ${colour}` : '2px solid transparent', outlineOffset: 4 }}
        role="img"
        aria-label={`${face.name}, expression: ${label ?? 'neutral'}`}
      />
    </span>
  );
}
