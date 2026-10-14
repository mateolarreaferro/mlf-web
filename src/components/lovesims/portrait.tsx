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

export interface FaceProps {
  agentId: string;
  name: string;
  /** Channel colour, rose for the first agent, teal for the second. */
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
  agentId, name, colour, valence, arousal, label, speaking = false, size = 132, muted = false,
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

      {/* aura, radius tracks arousal, opacity tracks intensity */}
      <circle
        cx="60" cy="60" r={auraR}
        fill={`url(#${gid}-aura)`}
        style={{ transition: 'r 700ms ease, opacity 700ms ease' }}
      />

      {/* speaking ring */}
      <circle
        cx="60" cy="58" r="31"
        fill="none" stroke={colour}
        strokeWidth={speaking ? 1.6 : 0}
        strokeOpacity={speaking ? 0.55 : 0}
        style={{ transition: 'stroke-width 260ms ease, stroke-opacity 260ms ease' }}
      />

      {/* head */}
      <ellipse cx="60" cy="58" rx={faceRx} ry="26" fill={muted ? '#e8e6e3' : '#f2ded2'} />
      {/* neck + shoulders */}
      <path d="M52 80 h16 v6 q14 4 18 16 h-52 q4 -12 18 -16 z" fill={muted ? '#e8e6e3' : '#f2ded2'} />

      {/* blush */}
      <ellipse cx={60 - faceRx * 0.55} cy="65" rx="5" ry="3" fill={colour} opacity={blush} style={{ transition: 'opacity 600ms ease' }} />
      <ellipse cx={60 + faceRx * 0.55} cy="65" rx="5" ry="3" fill={colour} opacity={blush} style={{ transition: 'opacity 600ms ease' }} />

      {/* hair, crown height, side length, bun and fringe all vary independently */}
      <g fill={colour} opacity={muted ? 0.28 : hairTone}>
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
        <g stroke="#2b2320" strokeWidth="1.3" fill="none" opacity="0.8">
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
          strokeWidth="1.7"
          style={{ transition: 'd 500ms ease' }}
        />
        <path
          d={`M64 ${48 + browLift} q6 ${-2.5} 12 ${browInner}`}
          strokeWidth="1.7"
          style={{ transition: 'd 500ms ease' }}
        />

        {/* eyes */}
        <ellipse
          cx={50 + gazeX} cy={57 + gazeY} rx="3.1" ry={3.1 * eyeOpen}
          fill="#2b2320" stroke="none"
          style={{ transition: 'ry 400ms ease, cx 500ms ease, cy 500ms ease' }}
        />
        <ellipse
          cx={70 + gazeX} cy={57 + gazeY} rx="3.1" ry={3.1 * eyeOpen}
          fill="#2b2320" stroke="none"
          style={{ transition: 'ry 400ms ease, cx 500ms ease, cy 500ms ease' }}
        />

        {/* mouth, closed curve, or an open one when happy and activated */}
        {mouthOpen > 0.6 ? (
          <path
            d={`M${60 - mouthWidth} ${71 - asym} Q60 ${71 + mouthCurve + mouthOpen} ${60 + mouthWidth} 71 Q60 ${71 + mouthCurve - mouthOpen} ${60 - mouthWidth} ${71 - asym}`}
            strokeWidth="1.9" fill="#2b2320" fillOpacity="0.85"
            style={{ transition: 'd 500ms ease' }}
          />
        ) : (
          <path
            d={`M${60 - mouthWidth} ${71 - asym} Q60 ${71 + mouthCurve} ${60 + mouthWidth} 71`}
            strokeWidth="2.1"
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
