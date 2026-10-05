import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { modelReady, noStore, readBody, sameOrigin } from "@/lib/hosted";
import { access, canWrite } from "@/lib/capsula/auth";
import { getDraft, getPerson, listEntries, saveDraft, within } from "@/lib/capsula/store";
import { interviewerPrompt } from "@/lib/capsula/interviewer";
import { MODEL } from "@/lib/capsula/ingest";

/*
  One turn of the interview. The browser sends only the newest answer; the
  conversation so far is the draft kept in the store, which is also what lets
  a friend stop and come back days later. Capsule members are signed in, so
  this does not draw on the site's three free calls: it has its own daily
  allowance per person instead.
*/

export const maxDuration = 120;

const no = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return no("Hazlo desde el sitio.", 403);
  if (!modelReady()) return no("La entrevistadora no está conectada ahora mismo.", 503);
  const body = await readBody(request, 40_000);
  const person = body ? await getPerson(String(body.username ?? "")) : null;
  if (!body || !person) return no("Petición no válida.", 400);
  if (!canWrite(await access(person))) return no("No tienes acceso.", 403);

  const draft = await getDraft(person.username);
  if (!draft) return no("No hay entrevista en curso.", 404);
  const message = body.message as UIMessage | undefined;
  const text = message?.parts?.map((p) => (p.type === "text" ? p.text : "")).join("").trim().slice(0, 8000);
  if (!message || message.role !== "user" || !text) return no("Escribe una respuesta.", 400);
  if (!(await within(`turns:${person.username}`, 300, 86_400))) return no("Por hoy ya es suficiente. Todo está guardado: sigue mañana.", 429);

  const messages: UIMessage[] = [...draft.messages, { id: message.id, role: "user", parts: [{ type: "text", text }] }];
  // Keep the answer even if the reply fails.
  await saveDraft(person.username, { ...draft, messages, updatedAt: Date.now() });

  const entries = await listEntries(person.username);
  const result = streamText({
    model: anthropic(MODEL),
    // The same for every turn of this interview, so it is cached after the first.
    instructions: {
      role: "system",
      content: interviewerPrompt({ name: person.name.split(" ")[0], mode: draft.mode, round: draft.round, entries }),
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    messages: await convertToModelMessages(messages),
    // A guided turn is a short acknowledgement and the next question; a conversation chooses its follow-ups.
    providerOptions: { anthropic: { effort: draft.mode === "guiada" ? "low" : "medium" } },
    maxOutputTokens: 600,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ messages: all }) => {
        await saveDraft(person.username, { ...draft, messages: all, updatedAt: Date.now() });
      },
    }),
  });
}
