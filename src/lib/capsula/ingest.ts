import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import readXlsx from "read-excel-file/node";
import mammoth from "mammoth";
import { ACTIVE, QUESTIONS, matchQuestion, questionById } from "./questions";
import type { Answer } from "./store";

/*
  Turning what the admin drops (or an interview that just ended) into
  answers against the capsule's question ids, so every year lines up.

  - A spreadsheet in the template's shape (question in column A, answer in
    B) maps straight across, no model involved.
  - Text, a .docx transcript, or a recording first becomes plain text (audio
    through OpenAI's Whisper: Claude does not take audio), then Claude reads
    it and pulls each answer out in the person's own words.
*/

export const MODEL = "claude-opus-5-5";

/** A failure whose message is meant for the person, in Spanish. */
export class Said extends Error {}

/* ---------- spreadsheets ---------- */

const cell = (v: unknown) => (v == null ? "" : String(v).trim());

/** Rows of [question, answer] from a template-shaped sheet. */
function rowsToAnswers(rows: unknown[][]): Answer[] {
  const answers: Answer[] = [];
  for (const row of rows) {
    const question = cell(row[0]);
    const answer = row.slice(1).map(cell).filter(Boolean).join("\n");
    if (!question || !answer) continue;
    if (/^preguntas?$/i.test(question) && /^respuestas?$/i.test(answer)) continue; // the header row
    const questionId = matchQuestion(question);
    answers.push({ questionId, question: questionId ? questionById.get(questionId)!.text : question, answer });
  }
  return answers;
}

export async function fromXlsx(buffer: Buffer): Promise<Answer[]> {
  const sheets = await readXlsx(buffer);
  return sheets.flatMap((s) => rowsToAnswers(s.data as unknown[][]));
}

/** A small CSV reader: quoted fields, commas or semicolons. */
export function fromCsv(text: string): Answer[] {
  const delimiter = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rowsToAnswers(rows);
}

/* ---------- text out of files ---------- */

export async function fromDocx(buffer: Buffer): Promise<string> {
  return (await mammoth.extractRawText({ buffer })).value.trim();
}

/** Whisper's own ceiling on one file. */
export const AUDIO_LIMIT = 25 * 1024 * 1024;

export async function transcribe(audio: Buffer, filename: string, type: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Said("La transcripción no está conectada (falta OPENAI_API_KEY).");
  if (audio.length > AUDIO_LIMIT) throw new Said("El audio pesa más de 25 MB. Expórtalo más liviano (por ejemplo m4a a 64 kbps) y vuelve a subirlo.");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: type || "audio/mpeg" }), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "text");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(280_000),
  });
  if (!response.ok) throw new Said("La transcripción falló. Intenta otra vez.");
  return (await response.text()).trim();
}

/* ---------- Claude reads it ---------- */

const ids = QUESTIONS.map((q) => q.id) as [string, ...string[]];

const schema = z.object({
  summary: z.string().describe("Two or three sentences on where this person is in life right now, in the language they spoke, written to them in the second person."),
  answers: z.array(z.object({
    questionId: z.enum([...ids, "otro"]).describe("The template question this answers, or \"otro\" for something important they said that no question covers."),
    question: z.string().describe("For \"otro\" only: a short question this passage answers, in their language. Otherwise repeat the template question."),
    answer: z.string().describe("Their answer in the first person, in their own words and language."),
  })),
});

const template = ACTIVE.map((s) => `## ${s.title}\n${s.questions.map((q) => `- ${q.id}: ${q.text}`).join("\n")}`).join("\n\n");

/**
 * Pulls the answers out of a transcript, an interview or free text. `context`
 * says what the text is, for the model's benefit.
 */
export async function extract({ name, text, context }: { name: string; text: string; context: string }) {
  const { output } = await generateText({
    model: anthropic(MODEL),
    output: Output.object({ schema }),
    instructions: `You are filing an entry in a time capsule: once a year a group of close friends answer the same questions, so each of them can later see how they changed. You are given ${context} with ${name}. Pull out their answers.

The questions, grouped by section, with their ids:

${template}

Rules:
- One answer per question they actually addressed. Skip a question they did not get to; never invent or guess.
- Write each answer in the first person, as ${name} would say it, in the language they spoke (usually Spanish). Keep their words, names, places, numbers and the specific details; drop the filler of speech ("o sea", "cachas", false starts) and the interviewer's words. Usually two to six sentences; longer when they said a lot.
- If an answer to one question comes up while talking about another, file it under the question it answers.
- Use "otro" sparingly, for something that clearly matters to them and fits no question.
- A transcript made by speech recognition has errors: fix obvious mishearings from context, never change meaning.
- Notes like "(escucha grabación)" mean the full answer is in the recording; keep what is written.`,
    prompt: text,
    providerOptions: { anthropic: { effort: "medium" } },
    maxOutputTokens: 32_000,
  });
  const answers: Answer[] = output.answers
    .filter((a) => a.answer.trim())
    .map((a) => a.questionId === "otro"
      ? { questionId: null, question: a.question.trim(), answer: a.answer.trim() }
      : { questionId: a.questionId, question: questionById.get(a.questionId)!.text, answer: a.answer.trim() });
  return { summary: output.summary.trim(), answers };
}
