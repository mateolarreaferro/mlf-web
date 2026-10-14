'use client';

/**
 * The stage: two faces, and the space between them.
 *
 * The centrepiece is the intimacy thread. Each side reaches toward the middle by
 * an amount equal to *that agent's own* intimacy, so an asymmetric date, one
 * person invested, the other not, is visible as one arm stretching across a gap
 * the other never closes. That asymmetry is the single most important thing the
 * engine knows and the hardest thing to convey in a table.
 */

import { Portrait } from './portrait';
import { DEPTH_LABELS } from '@/lib/lovesims/types';
import type { DisclosureDepth } from '@/lib/lovesims/types';

export interface Side {
  id: string;
  name: string;
  colour: string;
  valence: number;
  arousal: number;
  label?: string;
  intimacy: number;
  depth: DisclosureDepth;
  ceiling: DisclosureDepth;
  secret: string;
  secretOut: boolean;
}

export function Stage({
  left, right, speakingId, minute, timeBudget,
}: {
  left: Side; right: Side; speakingId: string | null; minute: number; timeBudget: number;
}) {
  const met = left.intimacy > 0.42 && right.intimacy > 0.42;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-linear-to-b from-white to-neutral-50/60 px-4 py-6 sm:px-8">
      <div className="grid grid-cols-[1fr_minmax(90px,1.15fr)_1fr] items-start gap-2 sm:gap-4">
        <PersonColumn side={left} speaking={speakingId === left.id} align="left" />

        <div className="flex flex-col items-center pt-6">
          <Thread left={left} right={right} met={met} />
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
            {met ? 'they are in it' : 'reaching'}
          </p>
          <p className="mt-1 text-center font-mono text-[10px] tabular-nums text-neutral-400">
            {minute}′ / {timeBudget}′
          </p>
        </div>

        <PersonColumn side={right} speaking={speakingId === right.id} align="right" />
      </div>
    </section>
  );
}

function PersonColumn({ side, speaking, align }: { side: Side; speaking: boolean; align: 'left' | 'right' }) {
  const end = align === 'right';
  return (
    <div className={`flex flex-col ${end ? 'items-end' : 'items-start'}`}>
      <div className={end ? '-scale-x-100' : ''}>
        <Portrait
          agentId={side.id}
          name={side.name}
          colour={side.colour}
          valence={side.valence}
          arousal={side.arousal}
          label={side.label}
          speaking={speaking}
          size={124}
        />
      </div>

      <h3 className="mt-1 text-lg font-semibold" style={{ color: side.colour }}>{side.name}</h3>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-400">
        {side.label ?? 'settling in'}
      </p>

      <DepthLadder side={side} align={align} />
      <SecretCard side={side} align={align} />
    </div>
  );
}

/**
 * The disclosure ladder was always a level system; this just draws it as one.
 * Filled pips are depths reached, the outlined pip is what responsiveness has
 * currently unlocked, and greyed pips are out of reach at this level of trust.
 */
function DepthLadder({ side, align }: { side: Side; align: 'left' | 'right' }) {
  return (
    <div className={`mt-3 flex flex-col gap-1 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <div className="flex gap-1">
        {([0, 1, 2, 3, 4] as DisclosureDepth[]).map((d) => {
          const reached = d <= side.depth;
          const unlocked = d <= side.ceiling;
          return (
            <span
              key={d}
              title={`D${d}, ${DEPTH_LABELS[d]}${reached ? ' (reached)' : unlocked ? ' (unlocked)' : ' (locked)'}`}
              className="h-2.5 w-5 rounded-full transition-all duration-500"
              style={{
                background: reached ? side.colour : 'transparent',
                border: `1.5px solid ${unlocked ? side.colour : '#dcdcdc'}`,
                opacity: reached ? 1 : unlocked ? 0.55 : 0.35,
              }}
            />
          );
        })}
      </div>
      <span className="font-mono text-[10px] text-neutral-400">
        D{side.depth} {DEPTH_LABELS[side.depth]}
      </span>
    </div>
  );
}

function SecretCard({ side, align }: { side: Side; align: 'left' | 'right' }) {
  const out = side.secretOut;
  return (
    <div
      className={`mt-3 max-w-[15rem] rounded-lg border px-3 py-2 transition-colors duration-700 ${align === 'right' ? 'text-right' : ''}`}
      style={{
        borderColor: out ? side.colour : '#e5e5e5',
        background: out ? `${side.colour}0f` : '#fafafa',
      }}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: out ? side.colour : '#a3a3a3' }}>
        {out ? 'said out loud' : 'sealed until D4'}
      </p>
      <p className={`mt-0.5 text-[12px] leading-snug ${out ? 'text-neutral-700' : 'select-none text-neutral-300 blur-[3px]'}`}>
        {side.secret}
      </p>
    </div>
  );
}

/**
 * Two arcs, each reaching in from its own side by its own intimacy. They only
 * touch when both people got there.
 */
function Thread({ left, right, met }: { left: Side; right: Side; met: boolean }) {
  const W = 120;
  const H = 92;
  const mid = W / 2;
  // Each side reaches at most to the centre.
  const lx = mid * Math.min(1, left.intimacy / 0.55);
  const rx = mid * Math.min(1, right.intimacy / 0.55);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 150 }} role="img"
      aria-label={`Intimacy: ${left.name} ${(left.intimacy * 100).toFixed(0)}%, ${right.name} ${(right.intimacy * 100).toFixed(0)}%`}>
      <defs>
        <linearGradient id="thread-l" x1="0" x2="1">
          <stop offset="0%" stopColor={left.colour} stopOpacity="0.15" />
          <stop offset="100%" stopColor={left.colour} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="thread-r" x1="1" x2="0">
          <stop offset="0%" stopColor={right.colour} stopOpacity="0.15" />
          <stop offset="100%" stopColor={right.colour} stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {/* the gap they are reaching across */}
      <line x1="4" y1="34" x2={W - 4} y2="34" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="2 4" />

      <path
        d={`M4 34 Q ${4 + lx / 2} 26 ${4 + lx} 34`}
        stroke="url(#thread-l)" strokeWidth="3" fill="none" strokeLinecap="round"
        style={{ transition: 'd 900ms cubic-bezier(.4,0,.2,1)' }}
      />
      <path
        d={`M${W - 4} 34 Q ${W - 4 - rx / 2} 26 ${W - 4 - rx} 34`}
        stroke="url(#thread-r)" strokeWidth="3" fill="none" strokeLinecap="round"
        style={{ transition: 'd 900ms cubic-bezier(.4,0,.2,1)' }}
      />

      {met && (
        <circle cx={mid} cy="32" r="4.5" fill="#fff" stroke={left.colour} strokeWidth="1.5">
          <animate attributeName="r" values="4;5.5;4" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* per-side intimacy readout */}
      <text x="4" y="56" fontSize="9" fill={left.colour} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {(left.intimacy * 100).toFixed(0)}
      </text>
      <text x={W - 4} y="56" fontSize="9" textAnchor="end" fill={right.colour} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {(right.intimacy * 100).toFixed(0)}
      </text>
      <text x={mid} y="56" fontSize="8" textAnchor="middle" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        closeness
      </text>
    </svg>
  );
}
