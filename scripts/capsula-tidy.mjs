#!/usr/bin/env node
/*
  Spelling and typos in what the capsule already holds, nothing else (the
  rules are tidy() in src/lib/capsula/ingest.ts). Two steps, so nothing is
  written unread:

    node scripts/capsula-tidy.mjs [--base http://localhost:3000] [--only isabel.ponce]
      proposes the changes and writes them, before and after, to
      ~/Desktop/Capsula del Tiempo/ortografia-<host>.md (to read) and .json (to apply).
      Delete a change from the .json to skip it.

    node scripts/capsula-tidy.mjs --base ... --apply "<that .json>"
      writes the changes left in the file. A text that changed since the
      proposal is left alone.

  Uses the admin endpoints, so it needs CAPSULA_ADMIN_PASSWORD in the
  environment or .env.local, and --base must be the server whose capsule you
  mean (production is https://mateolarreaferro.com).
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = flag("base", "http://localhost:3000").replace(/\/$/, "");
const only = flag("only");
const applyFrom = flag("apply");

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

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
  if (!response.ok) throw new Error(`${op}: ${data.error ?? response.status}`);
  return data;
}

await api("admin", { password: process.env.CAPSULA_ADMIN_PASSWORD });

if (applyFrom) {
  const report = JSON.parse(readFileSync(applyFrom, "utf8"));
  if (report.base !== base) throw new Error(`That file is for ${report.base}, not ${base}.`);
  for (const [username, changes] of Object.entries(report.people)) {
    if (!changes.length) continue;
    const { applied } = await api("tidy", { username, changes });
    console.log(`${username}: ${applied} of ${changes.length} written`);
  }
} else {
  const { usernames } = await api("roster", {});
  const people = {};
  const lines = [`# Ortografía: ${base}`, "", `Propuesto ${new Date().toLocaleString("sv")}. Solo erratas y ortografía; nada se ha escrito todavía.`, ""];
  for (const username of usernames.filter((u) => !only || u === only)) {
    let result;
    for (let attempt = 1; attempt <= 3 && !result; attempt++) {
      try { result = await api("tidy", { username }); } catch (error) { console.log(`${username}: attempt ${attempt} failed (${error.message})`); }
    }
    if (!result) { lines.push(`## ${username}`, "", "(no se pudo revisar; vuelve a correr con --only)", ""); continue; }
    const { name, changes } = result;
    people[username] = changes;
    console.log(`${username}: ${changes.length} changes`);
    if (!changes.length) continue;
    lines.push(`## ${name} (${username})`, "");
    for (const c of changes) lines.push(`**${c.question}**`, "", `- antes: ${c.before.replace(/\n/g, " ")}`, `- después: ${c.after.replace(/\n/g, " ")}`, "");
  }
  const dir = path.join(os.homedir(), "Desktop", "Capsula del Tiempo");
  mkdirSync(dir, { recursive: true });
  const stem = path.join(dir, `ortografia-${new URL(base).hostname}`);
  writeFileSync(`${stem}.json`, JSON.stringify({ base, people }, null, 2));
  writeFileSync(`${stem}.md`, lines.join("\n"));
  console.log(`\nRead ${stem}.md, then: node scripts/capsula-tidy.mjs --base ${base} --apply "${stem}.json"`);
}
