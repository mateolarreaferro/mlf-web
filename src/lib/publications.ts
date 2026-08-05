import fs from "fs";
import path from "path";

/*
  Publications live in content/publications.md — one citation per
  paragraph (blank line between entries), newest first.
*/
export function getPublications(): string[] {
  const file = path.join(process.cwd(), "content", "publications.md");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
