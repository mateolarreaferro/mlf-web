import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { MODEL } from "./ingest";
import { questionById, sectionById } from "./questions";
import { fingerprint, getInsight, listEntries, saveInsight, type Entry, type Insight, type Person } from "./store";

/*
  Two readings of a capsule, made in parallel by two separate calls so the
  voices never bleed into each other:

  - the map: plain, checkable points from what they said (the people in
    their life, places, what happened, what they like), each with their own
    words and the year. No interpretation at all.
  - "lo que veo": a letter from an agent instructed to read them as a
    psychologist who has known them for years and loves them. The page says
    so, every time. No diagnoses, nothing invented.

  Cached sealed per set of entries (and per INSIGHT_VERSION, so a change of
  shape here re-reads everyone); after() in the routes that add or remove an
  entry reads it again in the background.
*/

const INSIGHT_VERSION = 2;

const mapSchema = z.object({
  overview: z.string().describe("two or three plain sentences: where they are in life, facts only, second person"),
  points: z.array(z.object({
    id: z.string().describe("short kebab-case id, unique"),
    label: z.string().describe("a short factual statement or name, lowercase, in their language"),
    kind: z.enum(["personas", "lugares", "vida", "gustos"]),
    weight: z.number().int().min(1).max(5),
    note: z.string().describe("one or two factual sentences, second person, no interpretation"),
    rounds: z.array(z.number().int()),
    quotes: z.array(z.object({ round: z.number().int(), text: z.string() })).min(1).max(3),
  })),
  links: z.array(z.object({
    a: z.string(), b: z.string(),
    label: z.string().describe("two to four words, lowercase, the factual tie"),
  })),
});

const letterSchema = z.object({ reading: z.string().describe("three short paragraphs") });

/** Everything they answered, by round and section. */
export function capsuleText(entries: Entry[]): string {
  return entries.map((e) => {
    const lines = e.answers.map((a) => {
      const q = a.questionId ? questionById.get(a.questionId) : null;
      const section = q ? sectionById.get(q.section)!.title : "Otras cosas";
      return `[${section}] ${a.question}\n${a.answer}`;
    });
    return `### ${e.round} (${e.date})${e.summary ? `\nResumen: ${e.summary}` : ""}\n\n${lines.join("\n\n")}`;
  }).join("\n\n");
}

async function drawMap(first: string, rounds: number[], text: string) {
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: mapSchema }),
    instructions: `${first} keeps a time capsule: once a year, with a group of close friends, they answer the same questions about their life. You have every year of it (${rounds.join(", ")}). Draw a map of the plain facts in it, the way a careful archivist would: what can be checked, not what it means.

Points (15 to 24):
- kind "personas": people by name or role as they named them ("luis, tu pareja", "tu madre", "eli, amiga del colegio").
- kind "lugares": places they live, left, miss or want to go ("barcelona", "nueva york, cuatro años", "quieres ir a la india").
- kind "vida": things that happened or that they did or decided: moves, jobs, studies, losses, relationships, plans ("te mudaste a brasil", "dejaste tu trabajo", "empiezas estudios en mayo", "murió tu abuela").
- kind "gustos": what they do and like: activities, music, books, series, habits, vices ("pasear en el campo", "jorge drexler", "dejaste de comer ajo").
- label: short, concrete, lowercase, second person where a verb is needed. Never an interpretation, a feeling-word or a value ("autenticidad", "miedo a quedar mal" are interpretations; leave them out).
- weight 5 for what comes up again and again, 1 for a detail mentioned once.
- note: one or two factual sentences saying what they said about it. When there are several years, what changed.
- quotes: their own words copied from the answers (trimmed under 25 words, never paraphrased), each with its year.

Links (10 to 25): only factual ties between points ("luis" and "irte de barcelona": "un plan juntos"). Short label.

overview: two or three sentences of facts: where they live, what they do, who is close. No adjectives about them.

Write in their language (usually Spanish). Never invent; if something is unclear, leave it out.`,
    prompt: text,
    providerOptions: { anthropic: { effort: "medium" } },
    maxOutputTokens: 12_000,
  });
  return output;
}

async function writeLetter(first: string, rounds: number[], text: string) {
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema: letterSchema }),
    instructions: `You are an agent instructed to read ${first}'s time capsule as a psychologist who has known them for many years and loves them very much would. Once a year, with a group of close friends, ${first} answers the same questions about their life; you have read every year (${rounds.join(", ")}).

Write ${first} a short letter: three short paragraphs, in the second person, in their language (usually Spanish; follow how they speak). What you see in them, what they might not see themselves, and one thing worth holding onto. Quote a few of their own words. When there are several years, notice what changed and what held.

- Warm, plain, honest, never saccharine. No advice lists.
- No diagnoses, no clinical or pop-psychology labels, nothing pathologising. You notice patterns; you don't judge or fix.
- Never invent: everything comes from what they said. Their intimate answers (fears, crying, wounds) deserve care: name them gently.
- Start with "Querido ${first}:" or "Querida ${first}:" as fits them.`,
    prompt: text,
    providerOptions: { anthropic: { effort: "medium" } },
    maxOutputTokens: 4_000,
  });
  return output.reading.trim();
}

export async function readCapsule(person: Person, entries: Entry[]): Promise<Insight> {
  const first = person.name.split(" ")[0];
  const rounds = [...new Set(entries.map((e) => e.round))];
  const text = capsuleText(entries);
  const [map, reading] = await Promise.all([drawMap(first, rounds, text), writeLetter(first, rounds, text)]);

  // Keep the map whole: unique ids, links only between points that exist.
  const seen = new Set<string>();
  const points = map.points.filter((t) => !seen.has(t.id) && seen.add(t.id));
  const links = map.links.filter((l) => l.a !== l.b && seen.has(l.a) && seen.has(l.b));
  const insight: Insight = {
    v: INSIGHT_VERSION, fingerprint: fingerprint(entries), overview: map.overview.trim(), reading, points, links, createdAt: Date.now(),
  };
  await saveInsight(person.username, insight);
  return insight;
}

/** The cached reading when it is still current, null when it needs reading again. */
export async function currentInsight(person: Person, entries?: Entry[]): Promise<Insight | null> {
  const [insight, all] = await Promise.all([getInsight(person.username), entries ?? listEntries(person.username)]);
  return insight && insight.v === INSIGHT_VERSION && insight.fingerprint === fingerprint(all) ? insight : null;
}

/** Reads the capsule again if its entries changed; for after(), so failures only log. */
export async function refreshInsight(person: Person) {
  try {
    const entries = await listEntries(person.username);
    if (entries.length && !(await currentInsight(person, entries))) await readCapsule(person, entries);
  } catch (error) {
    console.error("capsula insight", person.username, error);
  }
}
