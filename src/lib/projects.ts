import fs from "fs";
import path from "path";
import matter from "gray-matter";

/*
  Projects live as markdown files in content/projects/ — one file per
  project, frontmatter for structure, body for the description.
  Drop a new .md file there and it appears in the graph, the node card,
  and the agent's knowledge automatically.
*/

export type Project = {
  slug: string;
  name: string;
  category: string;
  group: string;
  description: string;
  order: number;
  image?: string;
  video?: string;
  repo?: string;
  link?: string;
};

const PROJECTS_DIR = path.join(process.cwd(), "content", "projects");

export function getProjects(): Project[] {
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return {
        slug: file.replace(/\.mdx?$/, ""),
        name: data.name as string,
        category: (data.category ?? "") as string,
        group: (data.group ?? "") as string,
        description: content.trim(),
        order: (data.order ?? 99) as number,
        image: data.image as string | undefined,
        video: data.video as string | undefined,
        repo: data.repo as string | undefined,
        link: data.link as string | undefined,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

