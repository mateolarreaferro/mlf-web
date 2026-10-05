import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { modelReady, noStore, readBody, sameOrigin } from "@/lib/hosted";
import { access, isAdmin, me, type Access } from "@/lib/capsula/auth";
import { getPerson, listEntries, within, type Entry, type Person } from "@/lib/capsula/store";
import { capsuleText, currentInsight } from "@/lib/capsula/insight";
import { MODEL } from "@/lib/capsula/ingest";

/*
  Ask a capsule: a conversation about one person's past interviews, with
  that capsule and nothing else in its context, so it can only ever speak
  about what the asker is already allowed to read. The conversation itself
  is not stored.
*/

export const maxDuration = 120;

const no = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

function prompt(person: Person, how: Access, asker: string, entries: Entry[], themes: string) {
  const first = person.name.split(" ")[0];
  const who = how === "owner"
    ? `${first} is asking about their own capsule: talk to them in the second person.`
    : how === "admin"
      ? `Mateo, who keeps the capsules and did many of the interviews, is asking about ${first}: speak of ${first} in the third person.`
      : `${asker}, another friend in the circle whom ${first} let in, is asking about ${first}: speak of ${first} in the third person, with the discretion of someone trusted with a friend's diary.`;
  const transcripts = entries
    .filter((e) => e.transcript)
    .map((e) => `### Transcript, ${e.round}\n${e.transcript!.slice(0, 60_000)}`)
    .join("\n\n");
  return `You are the voice of ${person.name}'s time capsule: once a year ${first} answers the same questions with a group of close friends, and you have read all of it. ${who}

How to answer:
- Only from the capsule below. Quote their own words when it helps, with the year ("en 2025 dijiste: …"). If the capsule doesn't say, say so plainly; never guess or fill in.
- When there are several years, notice what changed and what held.
- Short, like a conversation: two to five sentences, then stop. Follow the asker's language (usually Spanish), in "tú".
- Warm and honest, never clinical: no diagnoses or labels, no advice unless asked.
- Speak only about ${first}'s capsule. For anything else, gently bring it back.

The capsule, by year and section:

${capsuleText(entries)}
${themes ? `\nThe plain facts already mapped from it:\n${themes}\n` : ""}
${transcripts ? `\nThe full recordings' transcripts, for detail:\n\n${transcripts}` : ""}`;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return no("Hazlo desde el sitio.", 403);
  if (!modelReady()) return no("La conversación no está conectada ahora mismo.", 503);
  const body = await readBody(request, 120_000);
  const person = body ? await getPerson(String(body.username ?? "")) : null;
  if (!body || !person) return no("Petición no válida.", 400);
  const how = await access(person);
  if (!how) return no("No tienes acceso.", 403);
  const [viewer, admin] = await Promise.all([me(), isAdmin()]);
  const asker = viewer?.username ?? (admin ? "admin" : "?");
  if (!(await within(`ask:${asker}`, 120, 86_400))) return no("Por hoy ya conversamos bastante. Vuelve mañana.", 429);

  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-30) as UIMessage[];
  const clean: UIMessage[] = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      id: String(m.id).slice(0, 60), role: m.role,
      parts: [{ type: "text" as const, text: (m.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("").slice(0, 4000) }],
    }));
  if (clean.at(-1)?.role !== "user") return no("Escribe una pregunta.", 400);

  const entries = await listEntries(person.username);
  if (!entries.length) return no("Esta cápsula todavía está vacía.", 404);
  const insight = await currentInsight(person, entries);
  const themes = insight?.points.map((t) => `- ${t.label} (${t.kind}): ${t.note}`).join("\n") ?? "";

  const result = streamText({
    model: anthropic(MODEL),
    // The same for every question about this capsule until it changes, so it is cached.
    instructions: {
      role: "system",
      content: prompt(person, how, viewer?.name.split(" ")[0] ?? "Mateo", entries, themes),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    messages: await convertToModelMessages(clean),
    providerOptions: { anthropic: { effort: "low" } },
    maxOutputTokens: 700,
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
