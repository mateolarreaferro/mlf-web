"use client";

import type { Insight } from "@/lib/capsula/store";
import { useInsight, Waiting } from "./LifeMap";

/*
  "lo que veo": the letter from the agent instructed to read the capsule as a
  psychologist who loves them (insight.ts). It always says what it is first,
  so nobody takes it for a person's judgement or a diagnosis.
*/
export default function Letter({ username, first, initial, owner }: { username: string; first: string; initial: Insight | null; owner: boolean }) {
  const { insight, error } = useInsight(username, initial);
  if (!insight) return <Waiting error={error} owner={owner} first={first} />;
  return (
    <div className="max-w-2xl">
      <p className="rounded-2xl bg-white/60 px-5 py-4 text-sm leading-relaxed text-faint">
        Esto lo escribe un agente: una inteligencia artificial con instrucciones de leer {owner ? "tu cápsula" : `la cápsula de ${first}`} como
        lo haría un psicólogo que {owner ? "te conoce hace años y te quiere" : `conoce a ${first} hace años y le quiere`} mucho. Es una lectura con
        cariño, hecha solo con lo que {owner ? "dijiste" : "dijo"}. No es un diagnóstico, y puede equivocarse.
      </p>
      <div className="mt-10 flex flex-col gap-5 text-[17px] leading-relaxed">
        {insight.reading.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </div>
  );
}
