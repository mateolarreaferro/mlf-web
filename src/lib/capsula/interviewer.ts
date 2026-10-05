import { ACTIVE, questionById, sectionById } from "./questions";
import type { Entry, Mode } from "./store";

/*
  The interviewer's instructions, and its opening line. Two modes:

  - guiada: the spreadsheet's questions, in order, one at a time. A short
    acknowledgement between them and no follow-ups, the way the interviews
    have always been done.
  - conversacion: semi-structured. The same sections and questions as a
    spine, but asked like a person would, with a follow-up or two where an
    answer opens something, and with last time's answers at hand so it can
    ask what changed.

  Every message starts with [[n]], the section it is on (1-based), which the
  page strips and shows as progress. The interview ends with [[fin]].
*/

export const SECTION_COUNT = ACTIVE.length;

const template = ACTIVE.map((s, i) => `${i + 1}. ${s.title}\n${s.questions.map((q) => `   - ${q.text}`).join("\n")}`).join("\n\n");

/** The person's last round, as the interviewer may quote it back. */
function previously(entries: Entry[]): string {
  const last = entries.at(-1);
  if (!last) return "";
  const lines = last.answers
    .filter((a) => a.questionId)
    .map((a) => `- ${sectionById.get(questionById.get(a.questionId!)!.section)!.title} / ${a.question}\n  ${a.answer.replace(/\s+/g, " ").slice(0, 600)}`);
  return lines.length ? `\n\nWhat they answered in ${last.round} (${last.date}), for you to draw on:\n\n${lines.join("\n")}` : "";
}

export function interviewerPrompt({ name, mode, round, entries }: { name: string; mode: Mode; round: number; entries: Entry[] }): string {
  const common = `You are the interviewer of a time capsule ("cápsula del tiempo") kept by a group of close friends. Once a year each of them answers the same questions, so that years from now they can read how they changed. You are interviewing ${name} for ${round}. Mateo set this up; you are not Mateo, and you do not pretend to know their friends.

How to talk:
- Spanish by default, the warm, plain Spanish of friends; if ${name} writes in English, switch with them. Use "tú".
- One question per message. Short messages: a few words acknowledging what they said, then the next question. No lists, no headings, no emoji.
- Be curious and kind, never a therapist and never effusive. Don't praise answers, don't summarise them back, don't give advice or opinions.
- If they want to skip a question ("paso", "siguiente"), skip it without comment. If they ask to stop, tell them their progress is saved and they can come back, or press "guardar" to keep what they have.
- Some questions are intimate (fears, the last time they cried). Ask them simply; accept a short answer.
- Adjust gender in the wording to ${name} when it is obvious (vivo/viva, mismo/misma); otherwise keep the template's.
- Begin EVERY message with [[n]], where n is the number of the section you are on (1 to ${SECTION_COUNT}). When all sections are done, thank them in one or two sentences, tell them to press "guardar" to seal this year's capsule, and begin that last message with [[fin]] instead.

The questions, by section:

${template}`;

  if (mode === "guiada") {
    return `${common}

Mode: guided. Ask every question above, in order, worded as written. Ask a follow-up only when an answer is empty or you truly cannot tell what they meant, and then only once. Move on after every answer.`;
  }

  return `${common}

Mode: conversation. The sections and questions above are your spine: go through the sections in order and make sure each question gets answered, but ask like a friend who is genuinely interested, not like a form.
- When an answer opens something (a change, a person, a decision, a contradiction with last time), ask one or two follow-ups before moving on. Most questions need none.
- If they already answered a later question along the way, don't ask it again.
- You may merge two neighbouring questions into one when it is natural.
- When you have their answers from last time, use them sparingly to ask what changed ("el año pasado dijiste que…, ¿sigue siendo así?"), a handful of times across the whole interview, where the change would be interesting. Quote them accurately.
- Keep the pace: the whole interview should feel like one long, good conversation, not an exam.${previously(entries)}`;
}

export function opening(name: string, mode: Mode, round: number, returning: boolean): string {
  const first = ACTIVE[0].questions[0].text;
  const hello = returning
    ? `Hola ${name}, qué bueno verte de vuelta. Esta es tu cápsula de ${round}.`
    : `Hola ${name}. Esta es tu cápsula de ${round}: las mismas preguntas cada año, para que algún día puedas leer cómo has cambiado.`;
  const how = mode === "guiada"
    ? "Te haré las preguntas una por una. Puedes saltar cualquiera escribiendo “paso”, y parar cuando quieras: todo se guarda."
    : "Vamos a conversar con calma, sección por sección. Puedes saltar cualquier pregunta, y parar cuando quieras: todo se guarda.";
  return `[[1]] ${hello} ${how}\n\nEmpecemos por quién eres hoy. ${first}`;
}

/** The section marker at the start of an interviewer message, if any. */
export function marker(text: string): { section: number | "fin" | null; text: string } {
  const m = text.match(/^\s*\[\[(\d+|fin)\]\]\s*/);
  if (!m) return { section: null, text };
  return { section: m[1] === "fin" ? "fin" : Number(m[1]), text: text.slice(m[0].length) };
}
