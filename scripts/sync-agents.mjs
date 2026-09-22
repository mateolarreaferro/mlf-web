/*
  The class site lives in its own repository, agents2026-mateo (MIT's, private,
  checked out inside this one and ignored by it). Its website/ folder is plain
  static files, so serving it from mateolarreaferro.com/agents is a copy:

      npm run sync:agents

  mirrors agents2026-mateo/website into public/agents, which IS committed here.
  Edit the class repo, never public/agents: the next sync replaces it whole.
  next.config.ts rewrites /agents to the copied index.html.
*/

import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, "agents2026-mateo", "website");
const to = path.join(root, "public", "agents");

if (!existsSync(path.join(from, "index.html"))) {
  console.error(`sync-agents: nothing at ${from}. Clone the class repo into the project root first.`);
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, {
  recursive: true,
  filter: (src) => !/(^|\/)(\.DS_Store|\.gitkeep)$/.test(src),
});
console.log("sync-agents: public/agents now matches agents2026-mateo/website");
