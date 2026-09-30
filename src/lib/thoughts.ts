import fs from "fs";
import path from "path";
import matter from "gray-matter";

export type Thought = {
  slug: string;
  number: number;
  title: string;
  date: string; // YYYY-MM-DD
  lang: "en" | "es";
  summary: string;
  password?: string; // sha-256 hex; set → the post asks for it first
  content: string;
};

const THOUGHTS_DIR = path.join(process.cwd(), "content", "thoughts");

export function getThoughts(): Thought[] {
  const files = fs
    .readdirSync(THOUGHTS_DIR)
    .filter((f) => f.endsWith(".mdx"));

  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(THOUGHTS_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return {
        slug: file.replace(/\.mdx$/, ""),
        number: data.number as number,
        title: data.title as string,
        date: data.date as string,
        lang: (data.lang ?? "en") as "en" | "es",
        summary: (data.summary ?? "") as string,
        password: data.password as string | undefined,
        content,
      };
    })
    .sort((a, b) => b.number - a.number);
}

export function getThought(slug: string): Thought | undefined {
  return getThoughts().find((t) => t.slug === slug);
}

/* Holds the password hash once a visitor has entered it (see thoughts/[slug]/actions.ts). */
export function unlockCookie(slug: string): string {
  return `mlf-thought-${slug}`;
}

/* Numeric and language-neutral, so an EN and an ES post read the same. */
export function formatDate(date: string): string {
  return date;
}
