import protocol from "../../../../public/agents/js/agent-protocol.json";

// This route supplies one inference, not an agent framework or an autonomous job.
// The handwritten browser loop acts and returns its actual observation each turn.
export const maxDuration = 60;
const MODEL = "gpt-5.1"; // Reuse the existing site model; credentials remain server-side.
const apiKey = () => process.env.SCENE_AGENT_API_KEY || process.env.OPENAI_API_KEY;
const buckets = new Map<string, { count: number; until: number }>();
const headers = { "Cache-Control": "no-store" };
let health = { ready: false, until: 0 };

export async function GET() {
  if (!apiKey()) return Response.json({ ready: false }, { headers });
  if (health.until <= Date.now()) {
    try {
      // Verify key/model access without spending an inference. Hide the form if
      // the service is unavailable; keep the sliders usable in every case.
      const response = await fetch(`https://api.openai.com/v1/models/${MODEL}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
        signal: AbortSignal.timeout(3500), cache: "no-store",
      });
      health = { ready: response.ok, until: Date.now() + 30_000 };
    } catch { health = { ready: false, until: Date.now() + 5000 }; }
  }
  return Response.json({ ready: health.ready, model: MODEL }, { headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const url = new URL(origin ?? "");
    sameOrigin = url.host === request.headers.get("host") &&
      (url.protocol === "https:" || process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch { /* Missing or opaque origins are rejected. */ }
  if (!sameOrigin) {
    return Response.json({ error: "Use the agent from this website." }, { status: 403, headers });
  }
  if (!apiKey()) {
    return Response.json({ error: "The scene agent is unavailable right now." }, { status: 503, headers });
  }
  // Lightweight per-instance protection, not a durable account-wide spend cap.
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const bucket = buckets.get(ip) ?? { count: 0, until: now + 60_000 };
  if (bucket.count >= 50 || buckets.size > 2000) {
    return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers });
  }
  let kind: keyof typeof protocol;
  let messages: { role: "user" | "assistant"; content: string }[];
  try {
    if (Number(request.headers.get("content-length")) > 100_000) throw Error();
    const text = await request.text();
    if (text.length > 100_000) throw Error();
    const body = JSON.parse(text);
    if (!Object.hasOwn(protocol, body.kind) || !Array.isArray(body.messages) ||
        body.messages.length < 1 || body.messages.length > 25 ||
        body.messages.some((m: { role?: unknown; content?: unknown }) => !m ||
          !["user", "assistant"].includes(String(m.role)) || typeof m.content !== "string" || m.content.length > 16_000)) throw Error();
    kind = body.kind;
    messages = body.messages;
  } catch {
    return Response.json({ error: "Invalid scene-agent request." }, { status: 400, headers });
  }
  bucket.count++; buckets.set(ip, bucket);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, store: false, instructions: protocol[kind].system,
        input: messages, reasoning: { effort: "none" }, max_output_tokens: 700,
        text: { format: { type: "json_schema", name: `scene_${kind}`, strict: true, schema: protocol[kind].schema } },
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    if (!response.ok) {
      console.error("Scene inference failed", response.status); // Never log keys or user prompts.
      return Response.json({ error: "The model is unavailable. Your applied changes are still here; try again shortly." }, { status: 502, headers });
    }
    const result = await response.json();
    const text = result.output?.filter((item: { type: string }) => item.type === "message")
      .flatMap((item: { content: { type: string; text?: string }[] }) => item.content)
      .filter((item: { type: string }) => item.type === "output_text")
      .map((item: { text: string }) => item.text).join("");
    if (result.status !== "completed" || !text) throw Error("No completed output");
    return Response.json({ reply: JSON.parse(text), model: MODEL }, { headers });
  } catch {
    return Response.json({ error: "The model did not finish. Try again; applied changes can be undone." }, { status: 502, headers });
  }
}
