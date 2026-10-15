'use client';

/**
 * The debrief's primary view: two channels of felt experience over the clock.
 *
 * This is not a chart generated *about* the date afterwards, every point is an
 * AffectRecord the engine wrote while the date was running. The divergences are
 * the product: where one person's valence drops and the other's does not is a
 * responsiveness gap, and that is the thing worth showing a human being.
 *
 * Drawn the way a terminal plotter would: stepped lines, square points, crisp
 * edges, phosphor grid.
 */

import type { AffectRecord, Moment } from '@/lib/lovesims/types';
import { CHANNELS } from './terminal';

const CH = CHANNELS; // A = rose, B = periwinkle
const FONT = 'var(--font-vt323), VT323, ui-monospace, monospace';

interface Props {
  records: AffectRecord[];
  agentIds: string[];
  names: Record<string, string>;
  moments?: Moment[];
  timeBudget: number;
  height?: number;
}

export function AffectTrack({ records, agentIds, names, moments = [], timeBudget, height = 200 }: Props) {
  const W = 760;
  const H = height;
  const padL = 34;
  const padR = 14;
  const padT = 30;
  const padB = 26;

  // Scale to the time actually elapsed, not the scene's budget. A date that ends
  // at minute 30 of a 100-minute budget would otherwise draw itself into the left
  // third of the chart. The axis grows during a live run, which reads fine.
  const lastMinute = Math.max(...records.map((r) => r.minute), 1);
  const maxMinute = Math.min(timeBudget, Math.ceil(Math.max(lastMinute * 1.05, 10)));
  const x = (minute: number) => padL + (minute / maxMinute) * (W - padL - padR);
  // Felt valence = slow mood plus the fast spike, the same combination the gates use.
  const felt = (r: AffectRecord) => Math.max(-1, Math.min(1, r.mood.valence + 0.6 * r.emotion.valence));
  const y = (v: number) => padT + ((1 - v) / 2) * (H - padT - padB);

  const series = agentIds.map((id, i) => {
    const pts = records
      .filter((r) => r.agentId === id)
      .sort((a, b) => a.turn - b.turn)
      .map((r) => ({ x: Math.round(x(r.minute)), y: Math.round(y(felt(r))), r }));
    return { id, colour: CH[i % 2], pts };
  });

  // A stepped path: hold the value, then jump at the next reading.
  const stepped = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `H${p.x} V${p.y}`)).join(' ');

  return (
    <figure className="ls-box" data-title="felt valence over the clock">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[17px]">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-2" style={{ color: s.colour }}>
            <span>{'██'}</span>
            {names[s.id]}
          </span>
        ))}
        <span className="ls-dim ml-auto">{records.length} readings</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" shapeRendering="crispEdges"
        aria-label={`Two-channel affect timeline across ${maxMinute} minutes for ${agentIds.map((i) => names[i]).join(' and ')}.`}>
        {/* grid */}
        <line x1={padL} y1={y(1)} x2={W - padR} y2={y(1)} style={{ stroke: 'var(--ls-line)' }} />
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} style={{ stroke: 'var(--ls-dim)' }} strokeDasharray="2 4" />
        <line x1={padL} y1={y(-1)} x2={W - padR} y2={y(-1)} style={{ stroke: 'var(--ls-line)' }} />
        {[1, 0, -1].map((v) => (
          <text key={v} x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="14" style={{ fill: 'var(--ls-dim)' }} fontFamily={FONT}>
            {v > 0 ? '+1' : v < 0 ? '-1' : '0'}
          </text>
        ))}

        {/* moment markers */}
        {moments.map((m, i) => (
          // Stagger the labels: moments cluster in time, and overlapping text is
          // worse than a slightly taller header band.
          <g key={`${m.kind}-${m.turn}`}>
            <line x1={Math.round(x(m.minute))} y1={padT} x2={Math.round(x(m.minute))} y2={H - padB} style={{ stroke: 'var(--ls-dim)' }} strokeDasharray="1 5" />
            <text
              x={Math.round(x(m.minute))}
              y={padT - 12 + (i % 2) * 11}
              textAnchor="middle" fontSize="13" style={{ fill: 'var(--ls-hi)' }} fontFamily={FONT}
            >
              {m.kind}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <g key={s.id}>
            <path fill="none" style={{ stroke: s.colour }} strokeWidth={2} d={stepped(s.pts)} />
            {s.pts.map((p) => (
              <rect key={p.r.turn} x={p.x - 3} y={p.y - 3} width={6} height={6} style={{ fill: s.colour }}>
                <title>{`${names[s.id]} · min ${p.r.minute} · ${p.r.label} · felt ${felt(p.r).toFixed(2)} · intimacy ${p.r.intimacy.toFixed(2)}`}</title>
              </rect>
            ))}
          </g>
        ))}

        <text x={padL} y={H - 6} fontSize="14" style={{ fill: 'var(--ls-dim)' }} fontFamily={FONT}>0 min</text>
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize="14" style={{ fill: 'var(--ls-dim)' }} fontFamily={FONT}>{maxMinute} min</text>
      </svg>

      <figcaption className="ls-dim mt-2 border-t-2 border-dashed pt-2 text-[17px] leading-snug" style={{ borderColor: 'var(--ls-line)' }}>
        Both channels are simulation state, not post-hoc analysis. A divergence, one line falling while
        the other holds, is a responsiveness gap: one of them read the moment differently than it was.
      </figcaption>
    </figure>
  );
}

export const CHANNEL_COLOURS = CH;
