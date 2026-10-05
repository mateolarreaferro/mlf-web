import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Reveal } from "@/components/motion";
import Bar from "@/components/capsula/Bar";
import { PrivacyToggle, RemoveEntry, StartInterview, Unlock } from "@/components/capsula/controls";
import { access, canWrite, isAdmin, me, openTo } from "@/lib/capsula/auth";
import { SECTIONS, questionById } from "@/lib/capsula/questions";
import { getDraft, getPerson, listEntries, listPeople, type Entry } from "@/lib/capsula/store";

export const dynamic = "force-dynamic";

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
        <Bar home={home} who={viewer?.name ?? "admin"} />
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">{person.name}</h1>
        <p className="mt-3 text-faint">Esta cápsula es privada. Con la contraseña de {first} puedes leerla.</p>
        <div className="mt-8"><Unlock username={person.username} /></div>
      </>
    );
  }

  const writer = canWrite(how);
  const [entries, draft] = await Promise.all([listEntries(person.username), writer ? getDraft(person.username) : null]);
  const rounds = [...new Set(entries.map((e) => e.round))];
  const view = query.vista === "tiempo" && rounds.length > 1 ? "tiempo" : "ano";
  const asked = Number(query.ano);
  const round = rounds.includes(asked) ? asked : rounds.at(-1);
  const people = how === "owner" || how === "admin" ? (await listPeople()).filter((p) => p.username !== person.username) : [];
  const opened = await openTo(people);
  const href = (q: { ano?: number; vista?: string }) => {
    const s = new URLSearchParams();
    if (q.ano) s.set("ano", String(q.ano));
    if (q.vista) s.set("vista", q.vista);
    return `/capsula/${person.username}${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <Bar home={home} who={viewer?.username === person.username ? null : (viewer?.name ?? "admin")} />

      <Reveal>
        <h1 className="text-[2.4rem] font-medium leading-tight tracking-[-0.03em]">{person.name}</h1>
        <p className="label mt-2">
          {entries.length
            ? `${entries.length} ${entries.length === 1 ? "entrada" : "entradas"} desde ${rounds[0]}`
            : "todavía sin entradas"}
          {how === "owner" ? null : how === "admin" ? ` · ${person.public ? "visible para el círculo" : "privada"}` : ""}
        </p>
        {how === "owner" ? <div className="mt-3"><PrivacyToggle initial={person.public} /></div> : null}
      </Reveal>

      {writer ? (
        <Reveal delay={0.15} className="mt-12">
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

      {rounds.length ? (
        <section className="mt-20">
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
            <nav aria-label="años" className="flex items-baseline gap-6">
              {rounds.map((r) => (
                <Link
                  key={r}
                  href={href({ ano: r })}
                  aria-current={view === "ano" && r === round ? "page" : undefined}
                  className={`text-2xl font-medium tracking-[-0.02em] transition-colors hover:text-accent ${
                    view === "ano" && r === round ? "text-ink" : "text-faint/60"
                  }`}
                >
                  {r}
                </Link>
              ))}
            </nav>
            {rounds.length > 1 ? (
              <Link
                href={view === "tiempo" ? href({ ano: round }) : href({ vista: "tiempo" })}
                className={`label transition-colors hover:text-accent ${view === "tiempo" ? "text-ink" : ""}`}
              >
                {view === "tiempo" ? "volver a un año" : "ver a través del tiempo"}
              </Link>
            ) : null}
          </div>

          {view === "tiempo" ? (
            <AcrossTime entries={entries} />
          ) : (
            entries.filter((e) => e.round === round).map((e) => (
              <OneEntry key={e.id} entry={e} username={person.username} admin={how === "admin"} />
            ))
          )}
        </section>
      ) : null}

      {people.length ? (
        <section className="mt-28">
          <h2 className="label">el círculo</h2>
          <ul className="mt-4 flex flex-col gap-2.5">
            {people.map((p) => (
              <li key={p.username} className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                {how === "admin" || p.public || opened.has(p.username) ? (
                  <Link href={`/capsula/${p.username}`} className="transition-colors hover:text-accent">{p.name}</Link>
                ) : (
                  <Unlock username={p.username} name={p.name} inline />
                )}
              </li>
            ))}
          </ul>
          {how === "owner" ? (
            <p className="label mt-6 max-w-md">
              Las cápsulas privadas se abren con la contraseña de su dueño. Las visibles se leen sin ella.
            </p>
          ) : null}
        </section>
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
      title: s.title,
      answers: filed.get(s.id)!.sort((a, b) => order.get(a.questionId!)! - order.get(b.questionId!)!),
    })),
    ...(other.length ? [{ title: "Otras cosas", answers: other }] : []),
  ];
  const audio = (entry.files ?? []).filter((f) => f.type.startsWith("audio/") || f.type.startsWith("video/"));
  const rest = (entry.files ?? []).filter((f) => !audio.includes(f));

  return (
    <article className="mt-12">
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
          <Reveal key={g.title}>
            <h3 className="label lowercase">{g.title}</h3>
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
    <div className="mt-14 flex flex-col gap-16">
      {SECTIONS.filter((s) => s.questions.some((q) => byQuestion.has(q.id))).map((s) => (
        <Reveal key={s.id}>
          <h3 className="label lowercase">{s.title}</h3>
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
