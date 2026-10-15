'use client';

/*
  The door to LoveSims on this site: a boot screen and a menu. The game
  (/lovesims/play) and the analyst view (/lovesims/date) run the same engine
  the research prototype did; the people are invented for the demo
  (src/lib/lovesims/cast.ts). The keys 1, 2 and 3 pick from the menu.
*/

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boot, Frame, Label, useReducedMotion } from '@/components/lovesims/terminal';

const MENU = [
  { key: '1', href: '/lovesims/play', label: 'play a date', note: 'read each line, guess how it landed' },
  { key: '2', href: '/lovesims/date', label: 'analyst view', note: 'the affect track, the metrics, the moments' },
  { key: '3', href: '/?project=love-simulations', label: 'exit', note: 'back to mateolarreaferro.com' },
];

const BOOT = [
  'lovesims v2 (c) 2026 attractor labs',
  'a date engine, not a transcript generator',
  'cast: 12 invented people, 6 pairs, 4 rooms',
  'ready.',
];

const HELP: [string, string][] = [
  ['affect', 'Appraisal to PAD to mood gates. Attachment style modulates the appraisal, not the wording, so an avoidant agent gets terser exactly when the date is going well.'],
  ['self-disclosure', 'A D0 to D4 ladder with a ceiling set by perceived responsiveness. Under-reciprocation and too-much-too-soon are both reachable states.'],
  ['scene', 'Real venues, a time budget, and budgeted interruptions: the check arriving, the room getting loud. Friction is where the diagnostic behaviour comes from.'],
  ['measurement', 'Language style matching, reciprocity, uptake, initiative, repair, and the responsiveness gap. All computed from the logs. No compatibility score.'],
];

export default function LoveSimsHome() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [booted, setBooted] = useState(false);
  const ready = booted || reduced;

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const hit = MENU.find((m) => m.key === e.key);
      if (hit) router.push(hit.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, router]);

  return (
    <Frame status="12 people · 6 pairs · 4 rooms">
      <h1 className="ls-title mb-5 text-[13px] leading-[1.8] sm:text-[16px]">
        CAN YOU TELL HOW THAT LANDED?
      </h1>

      {ready ? (
        <div className="ls-dim mb-5 space-y-0.5">{BOOT.map((l) => <p key={l}>&gt; {l}</p>)}</div>
      ) : (
        <div className="mb-5"><Boot lines={BOOT} onDone={() => setBooted(true)} /></div>
      )}

      {ready && (
        <>
          <p className="mb-6 max-w-2xl leading-snug">
            Two people meet in a real place. Each carries a mood that biases what they say, a disclosure
            ladder they can only climb when the other person earns it, a private goal, and a secret. The
            engine records what each of them felt on every turn and, separately, what they misread.
          </p>

          <Label className="mb-2">&gt; select</Label>
          <ul className="mb-7 space-y-1">
            {MENU.map((m) => (
              <li key={m.key} className="flex flex-wrap items-baseline gap-x-3">
                <Link href={m.href} className="ls-btn">
                  <span style={{ color: 'var(--ls-hi)' }}>{m.key}</span> {m.label}
                </Link>
                <span className="ls-dim text-[17px]">{m.note}</span>
              </li>
            ))}
          </ul>

          <p className="ls-dim mb-8 max-w-xl text-[17px] leading-snug">
            In the game you read each line and guess how it landed. You are not scoring the couple,
            you are scoring how well you read a person. The twelve people here are invented for this
            demo; the research version was grounded in interviews with real students, which stay
            private. A date is a few minutes of a language model talking to itself; every visitor gets
            three for free.
          </p>

          <Label className="mb-2">&gt; lovesims --help</Label>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {HELP.map(([term, def]) => (
              <div key={term}>
                <dt style={{ color: 'var(--ls-hi)' }}>--{term}</dt>
                <dd className="ls-dim text-[17px] leading-snug">{def}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Frame>
  );
}
