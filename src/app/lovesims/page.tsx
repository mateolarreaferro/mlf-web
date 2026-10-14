import Link from 'next/link';

/*
  The door to LoveSims on this site. The game (/lovesims/play) and the analyst
  view (/lovesims/date) run the same engine the research prototype did; the
  people are invented for the demo (src/lib/lovesims/cast.ts).
*/
export default function LoveSimsHome() {
  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-20">
      <p className="mb-4 flex flex-wrap items-baseline gap-x-5 font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-400">
        <span>LoveSims <span className="text-[#a3324e]">v2</span></span>
        <Link href="/?project=love-simulations" className="normal-case tracking-normal underline underline-offset-2 hover:text-neutral-700">
          mateolarreaferro.com
        </Link>
      </p>
      <h1 className="font-serif text-5xl leading-[1.05]">
        A date engine, not a transcript generator
      </h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-neutral-600">
        Two people meet in a real place. Each carries a mood that biases what they say, a disclosure
        ladder they can only climb when the other person earns it, a private goal, and a secret. The
        engine records what each of them felt on every turn and, separately, what they misread.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/lovesims/play"
          className="rounded-full bg-neutral-900 px-7 py-3.5 text-[15px] font-medium text-white hover:bg-neutral-700"
        >
          Play a date
        </Link>
        <Link
          href="/lovesims/date"
          className="rounded-full border border-neutral-300 px-7 py-3.5 text-[15px] text-neutral-700 hover:border-neutral-400"
        >
          Analyst view
        </Link>
      </div>
      <p className="mt-3 max-w-xl text-sm text-neutral-500">
        In the game you read each line and guess how it landed. You are not scoring the couple.
        You are scoring how well you read a person.
      </p>
      <p className="mt-3 max-w-xl text-sm text-neutral-500">
        The twelve people here are invented for this demo. The research version was grounded in
        interviews with real students, which stay private. A date is a few minutes of a language
        model talking to itself; every visitor gets three for free.
      </p>

      <dl className="mt-14 grid gap-x-10 gap-y-6 border-t border-neutral-200 pt-8 sm:grid-cols-2">
        {[
          ['Affect', 'Appraisal to PAD to mood gates. Attachment style modulates the appraisal, not the wording, so an avoidant agent gets terser exactly when the date is going well.'],
          ['Self-disclosure', 'A D0 to D4 ladder with a ceiling set by perceived responsiveness. Under-reciprocation and too-much-too-soon are both reachable states.'],
          ['Scene', 'Real venues, a time budget, and budgeted interruptions: the check arriving, the room getting loud. Friction is where the diagnostic behaviour comes from.'],
          ['Measurement', 'Language style matching, reciprocity, uptake, initiative, repair, and the responsiveness gap. All computed from the logs. No compatibility score.'],
        ].map(([term, def]) => (
          <div key={term}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#a3324e]">{term}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-neutral-600">{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
