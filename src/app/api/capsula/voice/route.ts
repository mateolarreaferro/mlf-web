import { noStore, readBody, sameOrigin } from "@/lib/hosted";
import { access, canWrite } from "@/lib/capsula/auth";
import { getPerson, within } from "@/lib/capsula/store";
import { marker } from "@/lib/capsula/interviewer";

/*
  The interviewer's voice: one message read aloud by ElevenLabs, streamed
  back as mp3. Only for someone doing an interview (the owner or the admin).
  Without ELEVENLABS_API_KEY the page shows no voice at all. The voice is
  ELEVENLABS_VOICE_ID (a premade one until Mateo picks his own) and the
  model is multilingual, so Spanish and English both sound native.
*/

export const maxDuration = 60;

const VOICE = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

const no = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return no("Hazlo desde el sitio.", 403);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return no("La voz no está conectada.", 503);
  const body = await readBody(request, 8_000);
  const person = body ? await getPerson(String(body.username ?? "")) : null;
  if (!body || !person) return no("Petición no válida.", 400);
  if (!canWrite(await access(person))) return no("No tienes acceso.", 403);
  const text = marker(String(body.text ?? "")).text.trim().slice(0, 1500);
  if (!text) return no("No hay nada que leer.", 400);
  if (!(await within(`voice:${person.username}`, 400, 86_400))) return no("Por hoy la voz descansa. Sigue leyendo.", 429);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15 } }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok || !response.body) {
    console.error("capsula voice", response.status, await response.text().catch(() => ""));
    return no("La voz falló. Puedes seguir leyendo.", 502);
  }
  return new Response(response.body, { headers: { ...noStore, "Content-Type": "audio/mpeg" } });
}
