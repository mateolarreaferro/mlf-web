import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { MODEL } from "./ingest";
import { questionById, sectionById } from "./questions";
import { fingerprint, getInsight, listEntries, saveInsight, type Entry, type Insight, type Person } from "./store";

/*
  The capsule read by a psychologist who has known the person for years and
  loves them: the themes that run through everything they said (people, what
  moves them, what they are looking for, what weighs on them), how those
  threads touch, and a short letter. It is generated once per set of entries
  and cached sealed; a new entry makes it stale, and after() in the routes
  that add one reads it again in the background.

  The guardrails are the point: no diagnoses or clinical words, nothing
  invented, every theme anchored in their own words with the year.
*/

const schema = z.object({
  reading: z.string().describe("The letter: three short paragraphs, second person, in their language."),
  themes: z.array(z.object({
    id: z.string().describe("short kebab-case id, unique"),
    label: z.string().describe("one to four words, lowercase, in their language"),
    kind: z.enum(["personas", "mueve", "busca", "pesa"]),
    weight: z.number().int().min(1).max(5),
    note: z.string().describe("two to four sentences, second person, what you see in this thread"),
    rounds: z.array(z.number().int()),
    quotes: z.array(z.object({ round: z.number().int(), text: z.string() })).min(1).max(4),
  })),
  links: z.array(z.object({
    a: z.string(), b: z.string(),
    label: z.string().describe("two to four words, lowercase, how the two threads touch"),
  })),
});

/** Everything they answered, by round and section, as the psychologist reads it. */
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

export async function readCapsule(person: Person, entries: Entry[]): Promise<Insight> {
  const first = person.name.split(" ")[0];
  const rounds = [...new Set(entries.map((e) => e.round))];
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema }),
    instructions: `You are a psychologist who has known ${first} for many years and loves them very much. ${first} keeps a time capsule: once a year, with a group of close friends, they answer the same questions about their life. You have read every year of it (${rounds.join(", ")}). Draw the map of the threads that run through what they said, and write them a short letter.

Themes (12 to 22):
- kind "personas": the people who matter (by name, as they named them) and the relationships themselves.
- kind "mueve": what moves them: passions, values, what makes them feel alive, what gives them peace.
- kind "busca": what they are looking for: wishes, plans, who they are becoming.
- kind "pesa": what weighs on them: fears, tensions, wounds, what they struggle with.
- weight 5 for what runs through everything, 1 for what appears once but matters.
- note: what you see in that thread, written to ${first} in the second person, with tenderness and honesty. When there are several years, say what changed or held.
- quotes: their own words, copied from their answers (trim to under 30 words, never paraphrase), each with its year.
- rounds: the years the thread appears in.

Links (10 to 30): only where two threads really touch (a person tied to a fear, a value in tension with a wish, a passion that gives peace). A short label for how.

The letter (reading): three short paragraphs to ${first}, second person. What you see in them, what they might not see themselves, and one thing worth holding onto. Specific, quoting a few of their words. No advice lists.

How you speak:
- In their language (the answers are mostly Spanish; write Spanish if they are). Warm, plain, never saccharine.
- No diagnoses, no clinical or pop-psychology labels, nothing pathologising. You notice patterns; you don't judge or fix.
- Never invent: everything comes from what they said. If something is ambiguous, leave it out.
- Their intimate answers (fears, crying, wounds) deserve care: name them gently.`,
    prompt: capsuleText(entries),
    providerOptions: { anthropic: { effort: "medium" } },
    maxOutputTokens: 16_000,
  });

  // Keep the map whole: unique ids, links only between themes that exist.
  const seen = new Set<string>();
  const themes = output.themes.filter((t) => !seen.has(t.id) && seen.add(t.id));
  const links = output.links.filter((l) => l.a !== l.b && seen.has(l.a) && seen.has(l.b));
  const insight: Insight = { fingerprint: fingerprint(entries), reading: output.reading.trim(), themes, links, createdAt: Date.now() };
  await saveInsight(person.username, insight);
  return insight;
}

/** The cached reading when it is still current, null when it needs reading again. */
export async function currentInsight(person: Person, entries?: Entry[]): Promise<Insight | null> {
  const [insight, all] = await Promise.all([getInsight(person.username), entries ?? listEntries(person.username)]);
  return insight && insight.fingerprint === fingerprint(all) ? insight : null;
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
