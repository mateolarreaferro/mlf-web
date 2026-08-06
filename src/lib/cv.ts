import fs from "fs";
import path from "path";

/*
  CV data lives as markdown-ish files in content/:
  publications.md, talks.md — entries start with "## Title" followed
  by "key: value" lines. classes.md — "## area" followed by "- course"
  lines. Edit the files; the site and the agent pick changes up.
*/

export type Publication = {
  title: string;
  authors: string;
  venue: string;
  year: string;
  category: string;
  note?: string;
  link?: string;
};

export type Talk = {
  title: string;
  venue: string;
  place: string;
  year: string;
  link?: string;
};

export type ClassGroup = {
  area: string;
  courses: string[];
};

function entries(file: string): { title: string; fields: Record<string, string> }[] {
  const p = path.join(process.cwd(), "content", file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [first, ...rest] = block.trim().split("\n");
      const fields: Record<string, string> = {};
      rest.forEach((line) => {
        const m = line.match(/^([a-z]+):\s*(.*)$/);
        if (m && m[2].trim()) fields[m[1]] = m[2].trim();
      });
      return { title: first.trim(), fields };
    });
}

export function getPublications(): Publication[] {
  return entries("publications.md").map(({ title, fields }) => ({
    title,
    authors: fields.authors ?? "",
    venue: fields.venue ?? "",
    year: fields.year ?? "",
    category: fields.category ?? "other",
    note: fields.note,
    link: fields.link,
  }));
}

export function getPublicationCategories(pubs: Publication[]): string[] {
  return [...new Set(pubs.map((p) => p.category))];
}

export function getTalks(): Talk[] {
  return entries("talks.md").map(({ title, fields }) => ({
    title,
    venue: fields.venue ?? "",
    place: fields.place ?? "",
    year: fields.year ?? "",
    link: fields.link,
  }));
}

export function getClasses(): ClassGroup[] {
  const p = path.join(process.cwd(), "content", "classes.md");
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [first, ...rest] = block.trim().split("\n");
      return {
        area: first.trim(),
        courses: rest
          .filter((l) => l.trim().startsWith("- "))
          .map((l) => l.trim().slice(2)),
      };
    });
}
