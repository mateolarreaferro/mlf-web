#!/usr/bin/env node
/*
  Imports a Cápsula del Tiempo folder into the capsule, through the same
  admin endpoints the /capsula/admin page uses (so it tests them too):

    node scripts/capsula-import.mjs "<folder>/Entrevistas" [--base http://localhost:3000] [--env dev] \
      [--date "Isabel Ponce=2026-01-26"] [--force]

  The folder holds one directory per round (2025, 2026, ...). In each:
    - <Name>.xlsx           an interview in the template's shape;
    - <Name Surname>/       everything from one interview: .docx transcripts
                            are read, recordings are kept alongside them;
    - <First>.xlsx next to a <First Surname>/ folder joins that folder's entry.
  The entry's date is the earliest file date unless --date says otherwise.

  Files go to the private Blob store under capsula/<env>/<username>/, so
  --env must be the environment the server at --base runs as (dev locally,
  production for the live site). Needs CAPSULA_ADMIN_PASSWORD and
  BLOB_READ_WRITE_TOKEN in the environment or .env.local. A person who
  already exists is skipped unless --force. New passwords are written to
  <folder>/../contraseñas-<env>.txt, outside the repo.
*/
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const root = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!root) throw new Error("Usage: node scripts/capsula-import.mjs <Entrevistas folder> [--base URL] [--env dev]");
const base = flag("base", "http://localhost:3000").replace(/\/$/, "");
const env = flag("env", "dev");
const force = args.includes("--force");
const dates = Object.fromEntries(args.flatMap((a, i) => (args[i - 1] === "--date" ? [a.split("=")] : [])));

// .env.local, without overriding what the shell already set (as Next does).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const usernameFor = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".");
// The file's own local day, not UTC's: a late-evening interview stays on its date.
const day = (file) => statSync(file).mtime.toLocaleDateString("sv");
const TYPES = { ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".txt": "text/plain", ".csv": "text/csv" };

let cookie = "";
async function api(op, body) {
  const response = await fetch(`${base}/api/capsula/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ...data };
}

/* Gather: one interview per person per round. */
const interviews = [];
for (const round of readdirSync(root).filter((d) => /^\d{4}$/.test(d)).sort()) {
  const dir = path.join(root, round);
  const items = readdirSync(dir).filter((f) => !f.startsWith("."));
  const folders = items.filter((f) => statSync(path.join(dir, f)).isDirectory());
  for (const folder of folders) {
    const files = readdirSync(path.join(dir, folder)).filter((f) => !f.startsWith(".")).map((f) => path.join(dir, folder, f));
    interviews.push({ name: folder, round: Number(round), files });
  }
  for (const sheet of items.filter((f) => f.endsWith(".xlsx"))) {
    const name = sheet.replace(/\.xlsx$/, "");
    const file = path.join(dir, sheet);
    const joins = interviews.find((i) => i.round === Number(round) && i.name.split(" ")[0] === name);
    if (joins) joins.files.push(file);
    else interviews.push({ name, round: Number(round), files: [file] });
  }
}

const login = await api("admin", { password: process.env.CAPSULA_ADMIN_PASSWORD });
if (login.status !== 200) throw new Error(`Admin login failed at ${base}: ${login.error}`);

const credentials = [];
const createdNow = new Set();
for (const { name, round, files } of interviews) {
  const username = usernameFor(name);
  const made = await api("people", { name, username });
  if (made.status === 200) {
    createdNow.add(username);
    credentials.push(`${name}\n  usuario: ${username}\n  contraseña: ${made.password}`);
  } else if (made.status !== 409) throw new Error(`${name}: ${made.error}`);
  // Someone who was already in the capsule before this run is left alone.
  else if (!force && !createdNow.has(username)) {
    console.log(`skip  ${name} ${round} (already exists; --force to add anyway)`);
    continue;
  }

  const uploaded = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const safe = path.basename(file).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\-]+/g, "-");
    const blob = await put(`capsula/${env}/${username}/${safe}`, readFileSync(file), {
      access: "private", addRandomSuffix: true, contentType: TYPES[ext], multipart: statSync(file).size > 8 * 1024 * 1024,
    });
    // A recording next to its transcript is kept, not transcribed again.
    const attach = ext in { ".m4a": 1, ".mp3": 1, ".wav": 1 } && files.some((f) => f.endsWith(".docx"));
    uploaded.push({ pathname: blob.pathname, name: path.basename(file), type: TYPES[ext], ...(attach ? { attach: true } : {}) });
  }
  const date = dates[name] ?? files.map(day).sort()[0];
  const started = Date.now();
  const result = await api("ingest", { username, round, date, files: uploaded });
  if (result.status !== 200) throw new Error(`${name} ${round}: ${result.error}`);
  console.log(`added ${name} ${round} ${date}: ${result.answers} answers (${Math.round((Date.now() - started) / 1000)}s)`);
}

if (credentials.length) {
  const out = path.join(path.dirname(path.resolve(root)), `contraseñas-${env}.txt`);
  writeFileSync(out, `Cápsula del tiempo (${env}), ${new Date().toISOString().slice(0, 10)}\n${base}/capsula\n\n${credentials.join("\n\n")}\n`, { flag: "a" });
  console.log(`\n${credentials.length} new passwords written to ${out}`);
}
