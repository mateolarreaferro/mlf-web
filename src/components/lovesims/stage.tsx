'use client';

/**
 * The stage: two faces, and the space between them, drawn as a terminal
 * would: sprites, and bars made of block characters.
 *
 * The centrepiece is still the closeness bar. Each side fills toward the
 * middle by an amount equal to *that agent's own* intimacy, so an asymmetric
 * date, one person invested, the other not, is visible as one bar reaching
 * across a gap the other never closes. That asymmetry is the single most
 * important thing the engine knows and the hardest thing to convey in a table.
 */

import { PixelPortrait } from './portrait';
import { bar, masked } from './terminal';
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

const CELLS = 6;

export function Stage({
  left, right, speakingId, minute, timeBudget,
}: {
  left: Side; right: Side; speakingId: string | null; minute: number; timeBudget: number;
}) {
  const met = left.intimacy > 0.42 && right.intimacy > 0.42;
  // Each side reaches at most to the centre.
  const lf = Math.round(Math.min(1, left.intimacy / 0.55) * CELLS);
  const rf = Math.round(Math.min(1, right.intimacy / 0.55) * CELLS);

  return (
    <section className="ls-box" data-title="the table">
      {/* On a phone the middle column goes under the two faces: three columns at 360px put the sprites on top of the bar. */}
      <div className="grid grid-cols-2 items-start gap-x-2 gap-y-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
        <PersonColumn side={left} speaking={speakingId === left.id} align="left" />

        <div className="order-last col-span-2 flex flex-col items-center sm:order-none sm:col-span-1 sm:pt-8">
          <p className="ls-dim text-[16px] uppercase tracking-[0.08em]">closeness</p>
          <p
            className="whitespace-pre text-[22px] leading-none sm:text-[26px]"
            aria-label={`Closeness: ${left.name} ${(left.intimacy * 100).toFixed(0)} of 100, ${right.name} ${(right.intimacy * 100).toFixed(0)} of 100`}
          >
            <span style={{ color: left.colour }}>{'█'.repeat(lf)}{'░'.repeat(CELLS - lf)}</span>
            <span style={{ color: met ? 'var(--ls-hi)' : 'var(--ls-line)' }}>{met ? '♥' : '·'}</span>
            <span style={{ color: right.colour }}>{'░'.repeat(CELLS - rf)}{'█'.repeat(rf)}</span>
          </p>
          <p className="mt-1 flex w-full justify-between text-[16px]">
            <span style={{ color: left.colour }}>{(left.intimacy * 100).toFixed(0)}</span>
            <span style={{ color: right.colour }}>{(right.intimacy * 100).toFixed(0)}</span>
          </p>
          <p className="mt-2 text-center" style={{ color: met ? 'var(--ls-hi)' : 'var(--ls-dim)' }}>
            {met ? 'they are in it' : 'reaching'}
          </p>
          <p className="ls-dim text-center tabular-nums">
            {minute}&prime; / {timeBudget}&prime;
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
    <div className={`flex min-w-0 flex-col ${end ? 'items-end text-right' : 'items-start'}`}>
      <div className={`${end ? '-scale-x-100' : ''} h-20 w-20 sm:h-[120px] sm:w-[120px]`}>
        <PixelPortrait
          agentId={side.id}
          name={side.name}
          colour={side.colour}
          valence={side.valence}
          arousal={side.arousal}
          label={side.label}
          speaking={speaking}
          size={120}
        />
      </div>

      <h3 className="mt-3 text-[24px] uppercase leading-none" style={{ color: side.colour }}>
        {side.name}
      </h3>
      <p className="ls-dim text-[17px] sm:text-[20px]">
        feeling: <span style={{ color: 'var(--ls-ph)' }}>{side.label ?? 'settling in'}</span>
      </p>

      <DepthLadder side={side} />
      <SecretLine side={side} />
    </div>
  );
}

/**
 * The disclosure ladder was always a level system; this draws it as one.
 * Filled cells are depths reached, hollow cells what responsiveness has
 * unlocked, and dim cells are out of reach at this level of trust.
 */
function DepthLadder({ side }: { side: Side }) {
  return (
    <p className="mt-2 whitespace-nowrap text-[17px] sm:text-[20px]" title={`D${side.depth}, ${DEPTH_LABELS[side.depth]}; unlocked to D${side.ceiling}`}>
      <span className="ls-dim">depth </span>
      {([0, 1, 2, 3, 4] as DisclosureDepth[]).map((d) => {
        const reached = d <= side.depth;
        const unlocked = d <= side.ceiling;
        return (
          <span key={d} style={{ color: reached ? side.colour : unlocked ? side.colour : 'var(--ls-line)', opacity: reached ? 1 : unlocked ? 0.7 : 1 }}>
            {reached ? '■' : '□'}
          </span>
        );
      })}
      <span className="ls-dim"> D{side.depth} {DEPTH_LABELS[side.depth]}</span>
    </p>
  );
}

function SecretLine({ side }: { side: Side }) {
  const out = side.secretOut;
  return (
    <p className={`mt-1 max-w-[15rem] text-[17px] leading-tight ${out ? '' : 'hidden sm:block'}`}>
      <span style={{ color: out ? side.colour : 'var(--ls-dim)' }}>{out ? 'said out loud: ' : 'sealed until D4: '}</span>
      <span className={out ? '' : 'select-none'} style={{ color: out ? 'var(--ls-ph)' : 'var(--ls-line)' }} aria-label={out ? undefined : 'a secret, still sealed'}>
        {out ? side.secret : masked(side.secret)}
      </span>
    </p>
  );
}

export { bar };
