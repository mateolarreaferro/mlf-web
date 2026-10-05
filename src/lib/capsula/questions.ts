/*
  The capsule's questions: Template.xlsx from the Cápsula del Tiempo folder,
  as data. Every answer is stored against a question id, which is what lets
  a person's answers line up across the years, so an id never changes once
  answers point at it. A question that is retired stays here with `retired`;
  a new one gets a new id.

  The wording is the spreadsheet's, with accents fixed. The one question that
  named a year ("¿Cómo sientes que el 2024 ha sido diferente...") now says
  "el último año", and the old phrasing still matches it on import.
*/

export type Question = { id: string; text: string; retired?: boolean };
export type Section = { id: string; title: string; questions: Question[] };

export const SECTIONS: Section[] = [
  {
    id: "identidad", title: "Identidad y valores", questions: [
      { id: "identidad-palabras", text: "¿Qué tres palabras usarías para describirte hoy en día?" },
      { id: "identidad-amistades", text: "¿Qué crees que más valoras en tus amistades?" },
      { id: "identidad-aprendido", text: "¿Qué es lo más importante que has aprendido sobre ti mismo este año?" },
      { id: "identidad-exito", text: "¿Cómo definirías el éxito en este momento de tu vida?" },
      { id: "identidad-familia", text: "¿Qué tan importante es para ti la familia en este momento?" },
    ],
  },
  {
    id: "pasiones", title: "Pasiones e intereses", questions: [
      { id: "pasiones-vivo", text: "¿Qué actividad te hace sentir más vivo últimamente?" },
      { id: "pasiones-libro", text: "¿Qué libro, película o serie te marcó este año?" },
      { id: "pasiones-habilidad", text: "Si pudieras aprender una habilidad nueva hoy, ¿cuál sería?" },
      { id: "pasiones-musica", text: "¿Qué música ha estado sonando más en tus días últimamente?" },
      { id: "pasiones-lugar", text: "¿Qué lugar sueñas con visitar el próximo año?" },
    ],
  },
  {
    id: "relaciones", title: "Relaciones y conexión", questions: [
      { id: "relaciones-cambio", text: "¿Cómo ha cambiado tu manera de relacionarte con los demás este año?" },
      { id: "relaciones-valioso", text: "¿Qué es lo más valioso que alguien te ha dicho recientemente?" },
      { id: "relaciones-ausente", text: "¿Qué le dirías a alguien que conociste hace años pero con quien ya no hablas?" },
      { id: "relaciones-amor", text: "¿Cómo muestras amor y aprecio por las personas que te importan?" },
      { id: "relaciones-inspira", text: "¿Qué te inspira de las personas cercanas a ti?" },
    ],
  },
  {
    id: "trabajo", title: "Trabajo y propósito", questions: [
      { id: "trabajo-motiva", text: "¿Qué es lo que más te motiva de tu trabajo o estudios?" },
      { id: "trabajo-cualquier", text: "Si pudieras dedicarte a cualquier cosa, ¿qué harías?" },
      { id: "trabajo-proyecto", text: "¿Qué proyecto o meta personal te entusiasma más ahora?" },
      { id: "trabajo-dificil", text: "¿Qué es lo más difícil que has enfrentado en el ámbito profesional este año?" },
      { id: "trabajo-alineado", text: "¿Qué tan alineado sientes que estás con tus pasiones?" },
    ],
  },
  {
    id: "crecimiento", title: "Reflexión y crecimiento personal", questions: [
      { id: "crecimiento-cambiar", text: "¿Qué te gustaría cambiar de ti mismo este año?" },
      { id: "crecimiento-habito", text: "¿Qué hábito reciente has adoptado que sientes que te beneficia mucho?" },
      { id: "crecimiento-agradecido", text: "¿Qué te hace sentir agradecido cada día?" },
      { id: "crecimiento-estres", text: "¿Cómo manejas el estrés o los momentos de ansiedad?" },
      { id: "crecimiento-error", text: "¿Algún error que hayas cometido este año?" },
    ],
  },
  {
    id: "contexto", title: "Contexto actual", questions: [
      { id: "contexto-ano", text: "¿Cómo sientes que el último año ha sido diferente de años anteriores para ti?" },
      { id: "contexto-mundo", text: "¿Qué crees que está cambiando en el mundo y cómo te afecta eso?" },
      { id: "contexto-tema", text: "¿Qué tendencia o tema social te interesa o preocupa más ahora?" },
    ],
  },
  {
    id: "futuro", title: "Imaginación y futuro", questions: [
      { id: "futuro-cinco", text: "¿Dónde te gustaría estar en cinco años?" },
      { id: "futuro-consejo", text: "¿Qué consejo le darías a tu yo de sexto curso?" },
      { id: "futuro-amigos", text: "¿Qué crees que tus amigos pensarán de ti dentro de 20 años?" },
      { id: "futuro-mundo", text: "Si pudieras cambiar algo en el mundo, ¿qué sería?" },
      { id: "futuro-legado", text: "¿Qué legado te gustaría dejar?" },
    ],
  },
  {
    id: "sentido", title: "Espiritualidad y sentido", questions: [
      { id: "sentido-paz", text: "¿Qué te da más paz en los momentos difíciles?" },
      { id: "sentido-espiritualidad", text: "¿Qué lugar ocupa la espiritualidad o filosofía en tu vida ahora?" },
      { id: "sentido-proposito", text: "¿Cómo encuentras propósito en tu día a día?" },
      { id: "sentido-naturaleza", text: "¿Qué rol juega la naturaleza en tu bienestar?" },
      { id: "sentido-feliz", text: "¿Qué crees que es lo más importante para ser feliz?" },
    ],
  },
  {
    id: "preferencias", title: "Preferencias", questions: [
      { id: "preferencias-vicio", text: "¿Cuál es tu vicio actual?" },
      { id: "preferencias-miedo", text: "¿Cuál es tu mayor miedo?" },
      { id: "preferencias-lloraste", text: "¿Cuál fue la última vez que lloraste y por qué?" },
    ],
  },
  {
    id: "amigos", title: "Amigos", questions: [
      { id: "amigos-mejores", text: "¿Quién es tu mejor amigo o tus mejores amigos hoy? Escoge 3." },
      { id: "amigos-parejas", text: "Comenta sobre tu relación con las parejas de tus amigos." },
      { id: "amigos-casarse", text: "¿Quién crees que será el primer pana en casarse?" },
      { id: "amigos-cinco", text: "¿Cómo crees que se verá el grupo de amigos en 5 años?" },
      { id: "amigos-dinamicas", text: "Describe las dinámicas más presentes en el grupo." },
      { id: "amigos-percepcion", text: "Comparte tu percepción sobre tus amigos más cercanos." },
      { id: "amigos-historias", text: "Describe alguna de tus historias favoritas." },
    ],
  },
];

export const QUESTIONS = SECTIONS.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.id })));
export const questionById = new Map(QUESTIONS.map((q) => [q.id, q]));
export const sectionById = new Map(SECTIONS.map((s) => [s.id, s]));
/** The questions still asked, for the interviewer and the extractor. */
export const ACTIVE = SECTIONS.map((s) => ({ ...s, questions: s.questions.filter((q) => !q.retired) }));

const words = (text: string) =>
  new Set(
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2),
  );

/**
 * The template question a free-written one means, if any: the spreadsheets
 * carry typos ("secto curso") and old phrasings ("el 2024"), so this compares
 * words rather than strings. Null when nothing is close enough.
 */
export function matchQuestion(text: string): string | null {
  const a = words(text);
  if (!a.size) return null;
  let best: string | null = null, score = 0;
  for (const q of QUESTIONS) {
    const b = words(q.text);
    const shared = [...a].filter((w) => b.has(w)).length;
    const s = shared / (a.size + b.size - shared);
    if (s > score) { score = s; best = q.id; }
  }
  return score >= 0.55 ? best : null;
}

/** A section title written in a spreadsheet, matched the same way. */
export function matchSection(text: string): string | null {
  const a = words(text);
  for (const s of SECTIONS) {
    const b = words(s.title);
    if ([...a].length && [...a].every((w) => b.has(w)) && [...b].every((w) => a.has(w))) return s.id;
  }
  return null;
}
