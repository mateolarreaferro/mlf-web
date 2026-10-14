'use client';

/**
 * The debrief's primary view: two channels of felt experience over the clock.
 *
 * This is not a chart generated *about* the date afterwards, every point is an
 * AffectRecord the engine wrote while the date was running. The divergences are
 * the product: where one person's valence drops and the other's does not is a
 * responsiveness gap, and that is the thing worth showing a human being.
 */

import type { AffectRecord, Moment } from '@/lib/lovesims/types';

const CH = ['#a3324e', '#136c6a'] as const; // A = rose, B = teal

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
      .map((r) => ({ x: x(r.minute), y: y(felt(r)), r }));
    return { id, colour: CH[i % 2], pts };
  });

  return (
    <figure className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 font-mono text-[11px] text-neutral-500">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-2">
            <span className="inline-block h-[2px] w-4" style={{ background: s.colour }} />
            {names[s.id]}, felt valence
          </span>
        ))}
        <span className="ml-auto">{records.length} readings</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Two-channel affect timeline across ${maxMinute} minutes for ${agentIds.map((i) => names[i]).join(' and ')}.`}>
        {/* grid */}
        <line x1={padL} y1={y(1)} x2={W - padR} y2={y(1)} stroke="#e5e5e5" />
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#d4d4d4" strokeDasharray="2 4" />
        <line x1={padL} y1={y(-1)} x2={W - padR} y2={y(-1)} stroke="#e5e5e5" />
        <text x={padL - 6} y={y(1) + 3} textAnchor="end" fontSize="9" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">+1</text>
        <text x={padL - 6} y={y(0) + 3} textAnchor="end" fontSize="9" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">0</text>
        <text x={padL - 6} y={y(-1) + 3} textAnchor="end" fontSize="9" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">−1</text>

        {/* moment markers */}
        {moments.map((m, i) => (
          // Stagger the labels: moments cluster in time, and overlapping text is
          // worse than a slightly taller header band.
          <g key={`${m.kind}-${m.turn}`}>
            <line x1={x(m.minute)} y1={padT} x2={x(m.minute)} y2={H - padB} stroke="#a3a3a3" strokeDasharray="1 5" opacity={0.7} />
            <text
              x={x(m.minute)}
              y={padT - 12 + (i % 2) * 9}
              textAnchor="middle" fontSize="9" fill="#525252" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {m.kind}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <g key={s.id}>
            <polyline
              fill="none"
              stroke={s.colour}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')}
            />
            {s.pts.map((p) => (
              <circle key={p.r.turn} cx={p.x} cy={p.y} r={2} fill={s.colour}>
                <title>{`${names[s.id]} · min ${p.r.minute} · ${p.r.label} · felt ${felt(p.r).toFixed(2)} · intimacy ${p.r.intimacy.toFixed(2)}`}</title>
              </circle>
            ))}
          </g>
        ))}

        <text x={padL} y={H - 6} fontSize="9" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">0 min</text>
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill="#a3a3a3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{maxMinute} min</text>
      </svg>

      <figcaption className="mt-3 border-t border-neutral-100 pt-3 font-mono text-[11px] leading-relaxed text-neutral-500">
        Both channels are simulation state, not post-hoc analysis. A divergence, one line falling while
        the other holds, is a responsiveness gap: one of them read the moment differently than it was.
      </figcaption>
    </figure>
  );
}

export const CHANNEL_COLOURS = CH;
