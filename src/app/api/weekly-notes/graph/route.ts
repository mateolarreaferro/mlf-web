import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { get, put, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { authenticated, isPrivate, NoteError, readBoard, ready, sameOrigin } from "@/lib/weekly-notes";
import { emptyKnowledge, projectKnowledge, type KnowledgeSnapshot } from "@/lib/knowledge-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const GRAPH_PATH = "weekly-notes/knowledge-v1.json";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
let active = false;
let lastRun = 0;

async function readGraph(): Promise<{ snapshot: KnowledgeSnapshot; etag?: string }> {
  try {
    const blob = await get(GRAPH_PATH, { access: "private", useCache: false, headers: { "Accept-Encoding": "identity" } });
    if (!blob?.stream) return { snapshot: emptyKnowledge() };
    const snapshot = await new Response(blob.stream).json();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.notes) || !Array.isArray(snapshot.graph?.nodes)) throw new Error("Invalid graph document");
    return { snapshot, etag: blob.blob.etag };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return { snapshot: emptyKnowledge() };
    throw error;
  }
}

export async function GET(request: Request) {
  const canEdit = authenticated(request);
  if (!ready() || isPrivate() && !canEdit) return json({ ready: ready(), private: isPrivate(), canEdit, notes: [], pending: 0, graph: emptyKnowledge().graph });
  try {
    const [board, saved] = await Promise.all([readBoard(), readGraph()]);
    return json({ ready: true, private: isPrivate(), canEdit, notes: board.notes, ...projectKnowledge(saved.snapshot, board.notes) });
  } catch { return json({ error: "Your graph couldn’t load. Please retry." }, 503); }
}

type WorkerResult = {
  snapshot: KnowledgeSnapshot;
  answer: string;
  matches: string[];
  run: { status: string; error?: string; [key: string]: unknown };
};

async function runPython(payload: string): Promise<WorkerResult> {
  if (process.env.VERCEL) {
    // The mixed Next/Python deployment shares this server-only signing secret.
    const secret = process.env.WEEKLY_NOTES_EDIT_KEY;
    const host = process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      : process.env.VERCEL_URL;
    if (!secret || !host) throw new Error("Missing worker configuration");
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const response = await fetch(`https://${host}/api/notes-agent`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Notes-Time": timestamp, "X-Notes-Signature": signature,
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}) },
      body: payload, cache: "no-store", signal: AbortSignal.timeout(270_000),
    });
    if (!response.ok) throw new Error("Python worker unavailable");
    return response.json();
  }
  // next dev uses the exact same Python entrypoint; no separate frontend/server.
  const executable = process.env.NOTES_PYTHON || path.join(process.cwd(), "agents2026-mateo/weekly_builds/week02/.venv/bin/python");
  return new Promise((resolve, reject) => {
    // This branch runs on the local host only; do not bundle its interpreter or
    // trace arbitrary NOTES_PYTHON paths into the production Node function.
    const child = spawn(/* turbopackIgnore: true */ executable, [path.join(process.cwd(), "python/notes_agent/bridge.py")], {
      cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], env: { ...process.env,
        OPENAI_API_KEY: process.env.SCENE_AGENT_API_KEY || process.env.OPENAI_API_KEY },
    });
    let output = "", settled = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error("The agent timed out")); }, 270_000);
    child.stdout.on("data", chunk => { output += chunk; if (output.length > 12_000_000) { child.kill(); reject(new Error("Agent response too large")); } });
    child.stderr.on("data", () => {}); // Never send provider transport diagnostics to the browser.
    child.on("error", error => { settled = true; clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer); if (settled) return;
      if (code !== 0) return reject(new Error("Python agent failed"));
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Invalid agent response")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(payload);
  });
}

export async function POST(request: Request) {
  let ownsRun = false;
  try {
    sameOrigin(request);
    const canEdit = authenticated(request);
    if (!ready() || isPrivate() && !canEdit) throw new NoteError("These notes are private.", 403);
    if (!process.env.SCENE_AGENT_API_KEY && !process.env.OPENAI_API_KEY) throw new NoteError("The notes agent is not connected yet.", 503);
    const raw = await request.text();
    if (raw.length > 20000) throw new NoteError("Try a shorter question.");
    const body = JSON.parse(raw);
    if (!["index", "ask"].includes(body.action) || typeof body.question !== "string" || body.question.length > 2000 || body.action === "ask" && !body.question.trim()) throw new NoteError("Enter a question to ask your notes.");
    if (body.action === "index" && !canEdit) throw new NoteError("Only the editor can change the graph.", 403);
    const history = body.history ?? [];
    if (!Array.isArray(history) || history.length > 6 || history.some(m => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 1500)) throw new NoteError("Invalid conversation.");
    if (active || Date.now() - lastRun < 5000) throw new NoteError("The agent is working. Try again shortly.", 429);
    active = true; ownsRun = true; lastRun = Date.now();
    const [board, saved] = await Promise.all([readBoard(), readGraph()]);
    if (!board.notes.some(note => note.text.trim())) throw new NoteError("Save a class note first, then come back to the graph.");
    const focusNotes = body.focusNotes ?? [];
    if (!Array.isArray(focusNotes) || focusNotes.length > 2 || focusNotes.some(id => typeof id !== "string" || !board.notes.some(note => note.id === id))) throw new NoteError("Invalid selected notes.");
    const result = await runPython(JSON.stringify({ focusNotes, action: body.action, question: body.question, notes: board.notes, snapshot: saved.snapshot, history, read_only: !canEdit }));
    if (!result.snapshot || result.run.status !== "completed") throw new NoteError(result.run?.error || "The agent did not finish. Please retry.", 502);
    // A run must not publish claims against notes that changed while it was thinking.
    const current = await readBoard();
    const version = (notes: typeof board.notes) => JSON.stringify(notes.map(n => [n.id, n.text]).sort((a, b) => a[0].localeCompare(b[0])));
    if (version(current.notes) !== version(board.notes)) throw new NoteError("A note changed during this run. Please ask again using the current notes.", 409);
    if (!canEdit) return json({ notes: current.notes, canEdit: false, ...projectKnowledge(saved.snapshot, current.notes), answer: result.answer, matches: result.matches, run: result.run });
    const serialized = JSON.stringify(result.snapshot);
    if (serialized.length > 4_000_000) throw new NoteError("The graph is too large to save in this version.", 413);
    await put(GRAPH_PATH, serialized, { access: "private", contentType: "application/json", addRandomSuffix: false,
      allowOverwrite: Boolean(saved.etag), ...(saved.etag ? { ifMatch: saved.etag } : {}) });
    return json({ notes: current.notes, canEdit: true, ...projectKnowledge(result.snapshot, current.notes),
      answer: result.answer, matches: result.matches, run: result.run });
  } catch (error) {
    if (error instanceof NoteError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: "Invalid question." }, 400);
    if (error instanceof BlobPreconditionFailedError) return json({ error: "The graph changed during this run. Please retry." }, 409);
    return json({ error: "The notes agent couldn’t complete this request. Your source notes are unchanged." }, 502);
  } finally { if (ownsRun) active = false; }
}
