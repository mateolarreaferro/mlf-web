import { get } from "@vercel/blob";
import { after } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { noStore, readBody, sameOrigin, visitor } from "@/lib/hosted";
import {
  access, addViewKey, adminPasswordMatches, canWrite, endSession, isAdmin, me, startAdmin, startSession,
} from "@/lib/capsula/auth";
import {
  addEntry, blobPrefix, checkPassword, createPerson, dropDraft, getDraft, getPerson, listEntries, removeEntry,
  removePerson, renamePerson, resetPassword, revealPassword, saveDraft, within, USERNAME, usernameFor,
  type Answer, type Mode, type Person, type Source,
} from "@/lib/capsula/store";
import { AUDIO_LIMIT, Said, extract, fromCsv, fromDocx, fromXlsx, transcribe } from "@/lib/capsula/ingest";
import { opening, marker } from "@/lib/capsula/interviewer";
import { currentInsight, readCapsule, refreshInsight } from "@/lib/capsula/insight";

/*
  The capsule's HTTP face: /api/capsula/<op>. The rules about who may do
  what live in lib/capsula/auth.ts; the data in lib/capsula/store.ts. The
  interview itself streams from ./interview (a sibling route).
*/

export const maxDuration = 300;

/** Paths under /capsula that are pages, not people. */
const RESERVED = ["admin", "entrevista", "circulo"];

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });
const no = (error: string, status = 400) => json({ error }, status);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const today = () => new Date().toISOString().slice(0, 10);
const validDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : today());
const validRound = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : new Date().getFullYear();
};

/** A person the caller may write to, or a refusal. */
async function writable(username: unknown): Promise<Person | Response> {
  const person = await getPerson(str(username, 40));
  if (!person) return no("No existe esa persona.", 404);
  if (!canWrite(await access(person))) return no("No tienes acceso.", 403);
  return person;
}

const ops: Record<string, (request: Request, body: Record<string, unknown>) => Promise<Response>> = {
  async login(request, body) {
    const username = str(body.username, 40).toLowerCase();
    const password = str(body.password, 200);
    if (!(await within(`login:ip:${visitor(request)}`, 30, 900)) || !(await within(`login:u:${username}`, 10, 900))) {
      return no("Demasiados intentos. Espera unos minutos.", 429);
    }
    const person = await getPerson(username);
    if (!person || !checkPassword(password, person.passwordHash)) return no("Usuario o contraseña incorrectos.", 401);
    await startSession(person);
    return json({ username: person.username });
  },

  async admin(request, body) {
    if (!(await within(`admin:${visitor(request)}`, 10, 900))) return no("Demasiados intentos. Espera unos minutos.", 429);
    if (!adminPasswordMatches(str(body.password, 200))) return no("No es esa.", 401);
    await startAdmin();
    return json({ ok: true });
  },

  async logout() {
    await endSession();
    return json({ ok: true });
  },

  /** Opens someone else's capsule for reading with their password. */
  async view(request, body) {
    if (!(await me()) && !(await isAdmin())) return no("Entra primero con tu usuario.", 401);
    const username = str(body.username, 40);
    if (!(await within(`view:${visitor(request)}:${username}`, 10, 900))) return no("Demasiados intentos. Espera unos minutos.", 429);
    const person = await getPerson(username);
    if (!person || !checkPassword(str(body.password, 200), person.passwordHash)) return no("No es esa.", 401);
    await addViewKey(person);
    return json({ ok: true });
  },

  /* ---------- admin ---------- */

  async people(_request, body) {
    if (!(await isAdmin())) return no("Solo el admin.", 403);
    const name = str(body.name, 60);
    const username = (str(body.username, 32) || usernameFor(name)).toLowerCase();
    if (!name) return no("Escribe un nombre.");
    if (!USERNAME.test(username) || RESERVED.includes(username)) return no("Ese usuario no sirve: letras, números y puntos.");
    const made = await createPerson(name, username);
    if (!made) return no("Ese usuario ya existe.", 409);
    return json({ username, password: made.password });
  },

  async password(_request, body) {
    if (!(await isAdmin())) return no("Solo el admin.", 403);
    const person = await getPerson(str(body.username, 40));
    if (!person) return no("No existe esa persona.", 404);
    const password = body.reset === true ? await resetPassword(person) : revealPassword(person);
    return json({ password });
  },

  async remove(_request, body) {
    if (!(await isAdmin())) return no("Solo el admin.", 403);
    const username = str(body.username, 40);
    if (body.id) {
      await removeEntry(username, str(body.id, 40));
      const person = await getPerson(username);
      if (person) after(() => refreshInsight(person));
    }
    else if (body.confirm === username) await removePerson(username);
    else return no("Confirma escribiendo el usuario.");
    return json({ ok: true });
  },

  /** Hands the browser a token to put one file straight into the private Blob store. */
  async upload(request) {
    const body = (await request.json()) as HandleUploadBody;
    if (body.type === "blob.generate-client-token" && !(await isAdmin())) return no("Solo el admin.", 403);
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("capsula/") || pathname.includes("..")) throw new Error("bad path");
        return { maximumSizeInBytes: 200 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return json(result);
  },

  /**
   * Logs a dropped file or pasted text as an entry: a spreadsheet maps
   * straight onto the questions, anything else is read by Claude.
   */
  async ingest(_request, body) {
    if (!(await isAdmin())) return no("Solo el admin.", 403);
    const person = await getPerson(str(body.username, 40));
    if (!person) return no("No existe esa persona.", 404);
    const round = validRound(body.round), date = validDate(body.date);

    const texts: string[] = [];
    const files: { pathname: string; name: string; type: string }[] = [];
    let answers: Answer[] = [];
    let source: Source = "texto";

    const pasted = str(body.text, 400_000);
    if (pasted) texts.push(pasted);

    const uploads = Array.isArray(body.files) ? body.files.slice(0, 6) : [];
    for (const raw of uploads as Record<string, unknown>[]) {
      const pathname = str(raw.pathname, 300), name = str(raw.name, 200) || "archivo";
      if (!pathname.startsWith(blobPrefix(person.username))) return no("Ese archivo no es de esta persona.");
      // Kept with the entry but not read, e.g. the recording behind a transcript that is already here.
      if (raw.attach === true) {
        files.push({ pathname, name, type: str(raw.type, 100) || "application/octet-stream" });
        continue;
      }
      const blob = await get(pathname, { access: "private", useCache: false });
      if (!blob?.stream) return no("No encuentro el archivo subido.", 404);
      const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
      const type = blob.blob.contentType ?? "";
      const lower = name.toLowerCase();
      files.push({ pathname, name, type });
      if (lower.endsWith(".xlsx")) { answers = answers.concat(await fromXlsx(buffer)); source = "hoja"; }
      else if (lower.endsWith(".csv")) { answers = answers.concat(fromCsv(buffer.toString("utf8"))); source = "hoja"; }
      else if (lower.endsWith(".docx")) texts.push(await fromDocx(buffer));
      else if (type.startsWith("audio/") || type.startsWith("video/") || /\.(m4a|mp3|wav|ogg|webm|aac|mp4|flac)$/.test(lower)) {
        if (buffer.length > AUDIO_LIMIT) return no("El audio pesa más de 25 MB. Expórtalo más liviano (m4a a 64 kbps, por ejemplo) y vuelve a subirlo.");
        texts.push(await transcribe(buffer, name, type));
        source = "audio";
      } else if (/\.(txt|md)$/.test(lower) || type.startsWith("text/")) texts.push(buffer.toString("utf8"));
      else return no(`No sé leer ${name}. Sube audio, .xlsx, .csv, .docx o .txt.`);
    }

    let summary: string | undefined;
    const transcript = texts.filter(Boolean).join("\n\n---\n\n");
    if (transcript) {
      const context = source === "audio" ? "the transcript of a recorded interview" : "an interview transcript or notes";
      const read = await extract({ name: person.name, text: transcript, context });
      summary = read.summary;
      // A spreadsheet's own answers win over a reading of the same question.
      const have = new Set(answers.map((a) => a.questionId).filter(Boolean));
      answers = answers.concat(read.answers.filter((a) => !a.questionId || !have.has(a.questionId)));
    }
    if (!answers.length) return no("No encontré respuestas en eso.");
    // A recording is what the entry is, even when its words arrived as a transcript.
    if (files.some((f) => f.type.startsWith("audio/"))) source = "audio";
    const entry = await addEntry(person.username, { round, date, source, answers, summary, transcript: transcript || undefined, files });
    after(() => refreshInsight(person));
    return json({ id: entry.id, answers: answers.length });
  },

  /** A new name, and optionally a new username, for someone already in the capsule. */
  async rename(_request, body) {
    if (!(await isAdmin())) return no("Solo el admin.", 403);
    const person = await getPerson(str(body.username, 40));
    if (!person) return no("No existe esa persona.", 404);
    const name = str(body.name, 60) || person.name;
    const username = (str(body.newUsername, 32) || person.username).toLowerCase();
    if (!USERNAME.test(username) || RESERVED.includes(username)) return no("Ese usuario no sirve: letras, números y puntos.");
    if (!(await renamePerson(person, name, username))) return no("Ese usuario ya existe.", 409);
    return json({ username, name });
  },

  /** The themes map and letter: the cached one when current, otherwise read now (a minute or two). */
  async insight(_request, body) {
    const person = await getPerson(str(body.username, 40));
    if (!person) return no("No existe esa persona.", 404);
    if (!(await access(person))) return no("No tienes acceso.", 403);
    const entries = await listEntries(person.username);
    if (!entries.length) return no("Esta cápsula todavía está vacía.", 404);
    const cached = await currentInsight(person, entries);
    if (cached) return json(cached);
    if (!(await within(`insight:${person.username}`, 8, 86_400))) return no("Hoy ya se leyó varias veces. Vuelve mañana.", 429);
    return json(await readCapsule(person, entries));
  },

  /* ---------- the interview ---------- */

  async start(_request, body) {
    const person = await writable(body.username);
    if (person instanceof Response) return person;
    const mode: Mode = body.mode === "guiada" ? "guiada" : "conversacion";
    const round = new Date().getFullYear();
    const returning = (await listEntries(person.username)).length > 0;
    const first = person.name.split(" ")[0];
    const now = Date.now();
    await saveDraft(person.username, {
      mode, round, startedAt: now, updatedAt: now,
      messages: [{ id: `a-${now}`, role: "assistant", parts: [{ type: "text", text: opening(first, mode, round, returning) }] }],
    });
    return json({ ok: true });
  },

  async discard(_request, body) {
    const person = await writable(body.username);
    if (person instanceof Response) return person;
    await dropDraft(person.username);
    return json({ ok: true });
  },

  /** Seals the interview: Claude files the conversation as this year's entry. */
  async finish(request, body) {
    const person = await writable(body.username);
    if (person instanceof Response) return person;
    const draft = await getDraft(person.username);
    if (!draft) return no("No hay entrevista en curso.", 404);
    if (!(await within(`finish:${person.username}`, 12, 86_400))) return no("Demasiados intentos hoy. Vuelve mañana.", 429);
    const speaker = (role: string) => (role === "user" ? person.name.split(" ")[0] : "Entrevistadora");
    const transcript = draft.messages
      .map((m) => `${speaker(m.role)}: ${marker(m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")).text}`)
      .join("\n\n");
    if (!draft.messages.some((m) => m.role === "user")) return no("Todavía no has respondido nada.");
    const read = await extract({ name: person.name, text: transcript, context: "a written interview" });
    if (!read.answers.length) return no("Todavía no hay respuestas que guardar.");
    await addEntry(person.username, {
      round: draft.round, date: today(), source: "entrevista", answers: read.answers, summary: read.summary, transcript,
    });
    await dropDraft(person.username);
    after(() => refreshInsight(person));
    return json({ ok: true, answers: read.answers.length });
  },
};

export async function POST(request: Request, { params }: RouteContext<"/api/capsula/[...op]">) {
  const op = (await params).op.join("/");
  const handler = ops[op];
  if (!handler) return no("No encontrado.", 404);
  // Blob's completion callback comes from Vercel, not a browser; the token request is still admin-only.
  if (op !== "upload" && !sameOrigin(request)) return no("Hazlo desde el sitio.", 403);
  if (op === "upload") return handler(request, {});
  const body = await readBody(request, 500_000);
  if (!body) return no("Petición no válida.");
  try {
    return await handler(request, body);
  } catch (error) {
    console.error("capsula", op, error);
    return no(error instanceof Said ? error.message : "Algo falló. Intenta otra vez.", 500);
  }
}

/** A recording or original file, streamed only to someone who may read the capsule it belongs to. */
export async function GET(request: Request, { params }: RouteContext<"/api/capsula/[...op]">) {
  if ((await params).op.join("/") !== "file") return no("No encontrado.", 404);
  const url = new URL(request.url);
  const person = await getPerson(url.searchParams.get("u") ?? "");
  const pathname = url.searchParams.get("p") ?? "";
  if (!person || !(await access(person))) return no("No tienes acceso.", 403);
  const entries = await listEntries(person.username);
  const file = entries.flatMap((e) => e.files ?? []).find((f) => f.pathname === pathname);
  if (!file) return no("No encontrado.", 404);
  const range = request.headers.get("range");
  const blob = await get(pathname, { access: "private", headers: range ? { range } : undefined });
  if (!blob?.stream) return no("No encontrado.", 404);
  const headers = new Headers({ "Cache-Control": "private, no-store", "Content-Type": file.type || "application/octet-stream" });
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = blob.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(blob.stream, { status: blob.headers.get("content-range") ? 206 : 200, headers });
}
