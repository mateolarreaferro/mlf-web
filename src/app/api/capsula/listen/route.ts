import { noStore, sameOrigin } from "@/lib/hosted";
import { access, canWrite } from "@/lib/capsula/auth";
import { getPerson, within } from "@/lib/capsula/store";
import { Said, transcribe } from "@/lib/capsula/ingest";

/*
  A spoken answer turned into text. The browser records with MediaRecorder
  and posts the raw audio here (?u=<username>); Whisper writes it out and the
  text goes back into the answer field to be fixed before sending. The audio
  is not kept anywhere. Vercel caps a request at 4.5 MB, which the page's
  32 kbps recording reaches after about eighteen minutes; it stops at ten.
*/

export const maxDuration = 120;

const LIMIT = 4_400_000;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };

const no = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return no("Hazlo desde el sitio.", 403);
  const person = await getPerson(new URL(request.url).searchParams.get("u") ?? "");
  if (!person) return no("Petición no válida.", 400);
  if (!canWrite(await access(person))) return no("No tienes acceso.", 403);
  if (Number(request.headers.get("content-length")) > LIMIT) return no("La grabación es muy larga. Divide la respuesta en dos.", 413);
  if (!(await within(`listen:${person.username}`, 200, 86_400))) return no("Por hoy ya hablamos bastante. Sigue escribiendo.", 429);
  const audio = Buffer.from(await request.arrayBuffer());
  if (!audio.length || audio.length > LIMIT) return no("No llegó la grabación. Intenta otra vez.", 400);
  const type = (request.headers.get("content-type") ?? "audio/webm").split(";")[0].trim();
  try {
    return Response.json({ text: await transcribe(audio, `respuesta.${EXT[type] ?? "webm"}`, type) }, { headers: noStore });
  } catch (error) {
    console.error("capsula listen", error);
    return no(error instanceof Said ? error.message : "No pude entender la grabación. Intenta otra vez.", 502);
  }
}
