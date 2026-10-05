import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Reveal } from "@/components/motion";
import Bar from "@/components/capsula/Bar";
import Ask from "@/components/capsula/Ask";
import LifeMap from "@/components/capsula/LifeMap";
import Letter from "@/components/capsula/Letter";
import { RemoveEntry, StartInterview, Unlock } from "@/components/capsula/controls";
import { access, canWrite, isAdmin, me } from "@/lib/capsula/auth";
import { currentInsight } from "@/lib/capsula/insight";
import { SECTIONS, questionById } from "@/lib/capsula/questions";
import { getDraft, getPerson, listEntries, type Entry } from "@/lib/capsula/store";

export const dynamic = "force-dynamic";

type Tab = "mapa" | "veo" | "respuestas" | "conversar";
const TABS: { id: Tab; label: string }[] = [
  { id: "mapa", label: "mapa" },
  { id: "veo", label: "lo que veo" },
  { id: "respuestas", label: "respuestas" },
  { id: "conversar", label: "conversar" },
];

const SOURCE = { entrevista: "entrevista", hoja: "hoja de cálculo", audio: "grabación", texto: "texto" } as const;
const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
const fileUrl = (username: string, pathname: string) =>
  `/api/capsula/file?u=${encodeURIComponent(username)}&p=${encodeURIComponent(pathname)}`;

export default async function Capsule({ params, searchParams }: PageProps<"/capsula/[username]">) {
  const { username } = await params;
  const query = await searchParams;
  // Who is asking comes first, so a stranger cannot learn which usernames exist.
  const [viewer, admin] = await Promise.all([me(), isAdmin()]);
  if (!viewer && !admin) redirect("/capsula");
  const person = await getPerson(username);
  if (!person) notFound();
  const how = await access(person);
  const home = viewer ? `/capsula/${viewer.username}` : "/capsula/admin";
  const first = person.name.split(" ")[0];

  if (!how) {
    return (
      <>
        <Bar home={home} />
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">{person.name}</h1>
        <p className="mt-3 text-faint">Esta cápsula es privada. Si {first} te dio su contraseña, puedes leerla.</p>
        <div className="mt-8"><Unlock username={person.username} /></div>
      </>
    );
  }

  const writer = canWrite(how);
  const [entries, draft] = await Promise.all([listEntries(person.username), writer ? getDraft(person.username) : null]);
  const rounds = [...new Set(entries.map((e) => e.round))];
  const tab: Tab = TABS.some((t) => t.id === query.ver) ? (query.ver as Tab) : "mapa";
  const across = query.tiempo === "1" && rounds.length > 1;
  const asked = Number(query.ano);
  const round = rounds.includes(asked) ? asked : rounds.at(-1);
  const insight = entries.length && (tab === "mapa" || tab === "veo") ? await currentInsight(person, entries) : null;
  const href = (q: { ver?: Tab; ano?: number; tiempo?: boolean }) => {
    const s = new URLSearchParams();
    if (q.ver && q.ver !== "mapa") s.set("ver", q.ver);
    if (q.ano) s.set("ano", String(q.ano));
    if (q.tiempo) s.set("tiempo", "1");
    return `/capsula/${person.username}${s.size ? `?${s}` : ""}`;
  };
  const shown = across ? entries : entries.filter((e) => e.round === round);
  const present = SECTIONS.filter((sec) => shown.some((e) => e.answers.some((a) => a.questionId && questionById.get(a.questionId)?.section === sec.id)));

  return (
    <>
      <Bar home={home} />

      <Reveal>
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">{person.name}</h1>
        <p className="label mt-2">
          {entries.length ? `${rounds.length === 1 ? "cápsula de" : "cápsulas de"} ${rounds.join(", ")}` : "todavía sin entradas"}
          {how === "owner" ? " · solo tú y quien tenga tu contraseña pueden leerla" : ""}
          {how === "key" ? " · la abriste con su contraseña" : ""}
        </p>
      </Reveal>

      {writer ? (
        <Reveal delay={0.1} className="mt-10">
          <StartInterview
            username={person.username}
            name={first}
            year={new Date().getFullYear()}
            draft={draft ? { round: draft.round, answers: draft.messages.filter((m) => m.role === "user").length } : null}
            hasThisYear={rounds.includes(new Date().getFullYear())}
            returning={entries.length > 0}
            self={how === "owner"}
          />
        </Reveal>
      ) : null}

      {entries.length ? (
        <>
          <nav aria-label="vistas" className="mt-16 flex flex-wrap items-baseline gap-x-7 gap-y-2">
            {TABS.map((t) => (
              <Link key={t.id} href={href({ ver: t.id })} aria-current={tab === t.id ? "page" : undefined}
                className={`text-lg font-medium tracking-[-0.01em] transition-colors hover:text-accent ${tab === t.id ? "text-ink" : "text-faint/60"}`}>
                {t.label}
              </Link>
            ))}
          </nav>

          <section className="mt-10">
            {tab === "mapa" ? (
              <LifeMap username={person.username} first={first} initial={insight} owner={how === "owner"} />
            ) : tab === "veo" ? (
              <Letter username={person.username} first={first} initial={insight} owner={how === "owner"} />
            ) : tab === "conversar" ? (
              <Ask username={person.username} first={first} owner={how === "owner"} rounds={rounds} />
            ) : (
              <div className="grid gap-10 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-14">
                <nav aria-label="años y secciones" className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                    {rounds.map((r) => (
                      <Link key={r} href={href({ ver: "respuestas", ano: r })} aria-current={!across && r === round ? "page" : undefined}
                        className={`text-xl font-medium tabular-nums tracking-[-0.02em] transition-colors hover:text-accent ${!across && r === round ? "text-ink" : "text-faint/60"}`}>
                        {r}
                      </Link>
                    ))}
                    {rounds.length > 1 ? (
                      <Link href={href({ ver: "respuestas", tiempo: true })} aria-current={across ? "page" : undefined}
                        className={`text-xl font-medium tracking-[-0.02em] transition-colors hover:text-accent ${across ? "text-ink" : "text-faint/60"}`}>
                        todos
                      </Link>
                    ) : null}
                  </div>
                  <ul className="hidden flex-col gap-1.5 lg:flex">
                    {present.map((sec) => (
                      <li key={sec.id}>
                        <a href={`#${sec.id}`} className="label lowercase transition-colors hover:text-accent">{sec.title}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div>
                  {across ? (
                    <AcrossTime entries={entries} />
                  ) : (
                    shown.map((e) => <OneEntry key={e.id} entry={e} username={person.username} admin={how === "admin"} />)
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}

    </>
  );
}

/* One entry: when and how it was logged, the answers by section, and what it came from. */
function OneEntry({ entry, username, admin }: { entry: Entry; username: string; admin: boolean }) {
  const filed = new Map<string, Entry["answers"]>();
  const other: Entry["answers"] = [];
  for (const a of entry.answers) {
    const section = a.questionId ? questionById.get(a.questionId)?.section : undefined;
    if (!section) other.push(a);
    else filed.set(section, [...(filed.get(section) ?? []), a]);
  }
  const order = new Map(SECTIONS.flatMap((s) => s.questions).map((q, i) => [q.id, i]));
  const groups = [
    ...SECTIONS.filter((s) => filed.has(s.id)).map((s) => ({
      id: s.id,
      title: s.title,
      answers: filed.get(s.id)!.sort((a, b) => order.get(a.questionId!)! - order.get(b.questionId!)!),
    })),
    ...(other.length ? [{ id: "otras", title: "Otras cosas", answers: other }] : []),
  ];
  const audio = (entry.files ?? []).filter((f) => f.type.startsWith("audio/") || f.type.startsWith("video/"));
  const rest = (entry.files ?? []).filter((f) => !audio.includes(f));

  return (
    <article className="mb-20">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="label">{longDate(entry.date)} · {SOURCE[entry.source]}</p>
        {admin ? <RemoveEntry username={username} id={entry.id} /> : null}
      </div>
      {entry.summary ? <p className="mt-5 max-w-2xl text-[17px] leading-relaxed">{entry.summary}</p> : null}

      {audio.map((f, i) => (
        <figure key={f.pathname} className="mt-6">
          <figcaption className="label mb-2">{audio.length > 1 ? `grabación, parte ${i + 1}` : "la grabación"}</figcaption>
          <audio controls preload="none" src={fileUrl(username, f.pathname)} className="w-full" />
        </figure>
      ))}

      <div className="mt-14 flex flex-col gap-14">
        {groups.map((g) => (
          <Reveal key={g.id}>
            <h3 id={g.id} className="label scroll-mt-8 lowercase">{g.title}</h3>
            <dl className="mt-5 flex flex-col gap-7">
              {g.answers.map((a, i) => (
                <div key={i} className="grid gap-1.5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8">
                  <dt className="text-sm text-faint">{a.question}</dt>
                  <dd className="whitespace-pre-line break-words">{a.answer}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        ))}
      </div>

      {entry.transcript || rest.length ? (
        <div className="mt-14 flex flex-col gap-3">
          {entry.transcript ? (
            <details className="group">
              <summary className="label cursor-pointer list-none transition-colors hover:text-accent">
                <span className="group-open:hidden">leer la transcripción completa</span>
                <span className="hidden group-open:inline">cerrar la transcripción</span>
              </summary>
              <p className="mt-5 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-faint">{entry.transcript}</p>
            </details>
          ) : null}
          {rest.map((f) => (
            <a key={f.pathname} href={fileUrl(username, f.pathname)} className="label transition-colors hover:text-accent">
              archivo original: {f.name}
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/* Every question, with each year's answer under it: the point of the whole capsule. */
function AcrossTime({ entries }: { entries: Entry[] }) {
  const byQuestion = new Map<string, { round: number; answer: string }[]>();
  for (const e of entries) {
    for (const a of e.answers) {
      if (!a.questionId) continue;
      byQuestion.set(a.questionId, [...(byQuestion.get(a.questionId) ?? []), { round: e.round, answer: a.answer }]);
    }
  }
  return (
    <div className="flex flex-col gap-16">
      {SECTIONS.filter((s) => s.questions.some((q) => byQuestion.has(q.id))).map((s) => (
        <Reveal key={s.id}>
          <h3 id={s.id} className="label scroll-mt-8 lowercase">{s.title}</h3>
          <div className="mt-5 flex flex-col gap-10">
            {s.questions.filter((q) => byQuestion.has(q.id)).map((q) => (
              <div key={q.id}>
                <p className="text-sm text-faint">{q.text}</p>
                <dl className="mt-3 flex flex-col gap-3">
                  {byQuestion.get(q.id)!.map((a, i) => (
                    <div key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
                      <dt className="label tabular-nums">{a.round}</dt>
                      <dd className="whitespace-pre-line break-words">{a.answer}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
