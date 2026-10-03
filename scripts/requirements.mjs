/*
  Vercel installs Python dependencies from the one requirements.txt in the
  project root, shared by every function in api/. Each Python runtime keeps its
  own pins in python/<name>/requirements.lock.txt; this writes their union.
  Both sync scripts call it, so neither can drop the other's pins.
*/

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function writeRequirements(root) {
  const pins = new Map();
  const dir = path.join(root, "python");
  for (const name of readdirSync(dir).sort()) {
    const lock = path.join(dir, name, "requirements.lock.txt");
    if (!existsSync(lock)) continue;
    for (const raw of readFileSync(lock, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const pkg = line.split("==")[0].toLowerCase();
      const seen = pins.get(pkg);
      if (seen && seen !== line) {
        console.error(`requirements: ${name} wants ${line} but another runtime pinned ${seen}`);
        process.exit(1);
      }
      pins.set(pkg, line);
    }
  }
  const lines = [...pins.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  writeFileSync(path.join(root, "requirements.txt"), lines.join("\n") + "\n");
  console.log(`requirements: ${lines.length} pins written to requirements.txt`);
}
