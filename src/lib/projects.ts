import fs from "fs";
import path from "path";
import matter from "gray-matter";

/*
  Projects live as markdown files in content/projects/ — one file per
  project, frontmatter for structure, body for the description.
  Drop a new .md file there and it appears in the graph, the node card,
  and the agent's knowledge automatically.

  The body has two halves, separated by a line containing only "---":

      short card description — what a visitor reads
      ---
      longer notes — only the agent reads these

  Everything before the divider renders on the card; everything after is
  private context for the agent (origin story, collaborators, technical
  approach, what it led to). A file with no divider is all description.
*/

/*
  One panel slide. `media` in frontmatter is a list of these — several
  images, a video, a p5 sketch, whatever the project needs.
*/
export type MediaItem = {
  type: "image" | "vimeo" | "youtube" | "embed" | "sketch";
  src: string;
  caption?: string;
  /** images only; defaults to cover */
  fit?: "cover" | "contain";
};

export type Project = {
  slug: string;
  name: string;
  category: string;
  group: string;
  description: string;
  /** Agent-only context; never rendered on the card. */
  notes?: string;
  order: number;
  tags: string[];
  /** Still in development / actively worked on. */
  isActive: boolean;
  /** Drawn as a bigger node with a bigger label in the graph. */
  featured: boolean;
  year?: string;
  role?: string;
  image?: string;
  media: MediaItem[];
  video?: string;
  repo?: string;
  link?: string;
  paper?: string;
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/* Infer a media type from a bare string, so `media: ["/projects/a.png"]` works. */
function fromString(src: string): MediaItem | null {
  const s = src.trim();
  if (!s) return null;
  const vimeo = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: "vimeo", src: vimeo[1] };
  const yt = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (yt) return { type: "youtube", src: yt[1] };
  if (s.startsWith("/") || IMAGE_EXT.test(s)) return { type: "image", src: s, fit: "cover" };
  if (/^https?:\/\//.test(s)) return { type: "embed", src: s };
  return { type: "sketch", src: s };
}

function toMediaItem(raw: unknown): MediaItem | null {
  if (typeof raw === "string") return fromString(raw);
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  // explicit: { type: image, src: ..., caption: ..., fit: ... }
  if (typeof o.type === "string" && typeof o.src === "string") {
    return {
      type: o.type as MediaItem["type"],
      src: o.src,
      caption: typeof o.caption === "string" ? o.caption : undefined,
      fit: o.fit === "contain" ? "contain" : o.fit === "cover" ? "cover" : undefined,
    };
  }

  // shorthand: { image: "...", caption: "..." } / { vimeo: "..." } / { sketch: "lorenz" }
  for (const key of ["image", "vimeo", "youtube", "embed", "sketch"] as const) {
    const v = o[key];
    if (typeof v === "string") {
      const base = key === "image" ? fromString(v) : { type: key, src: v };
      if (!base) return null;
      const item = key === "image" ? (base as MediaItem) : ({ ...base } as MediaItem);
      if (key === "vimeo") item.src = fromString(v)?.src ?? v;
      if (typeof o.caption === "string") item.caption = o.caption;
      if (o.fit === "contain" || o.fit === "cover") item.fit = o.fit;
      return item;
    }
  }
  return null;
}

/* `media` wins; otherwise fall back to the single `image` field. */
function normalizeMedia(data: Record<string, unknown>): MediaItem[] {
  const raw = data.media;
  if (Array.isArray(raw)) {
    const items = raw.map(toMediaItem).filter((m): m is MediaItem => m !== null);
    if (items.length) return items;
  }
  if (typeof data.image === "string" && data.image) {
    return [{ type: "image", src: data.image, fit: "cover" }];
  }
  return [];
}

const PROJECTS_DIR = path.join(process.cwd(), "content", "projects");

/** Split the markdown body on a standalone "---" line. */
function splitBody(content: string): { description: string; notes?: string } {
  const [description, ...rest] = content.split(/^\s*---\s*$/m);
  const notes = rest.join("\n---\n").trim();
  return { description: description.trim(), notes: notes || undefined };
}

export function getProjects(): Project[] {
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), "utf8");
      const { data, content } = matter(raw);
      const { description, notes } = splitBody(content);
      return {
        slug: file.replace(/\.mdx?$/, ""),
        name: data.name as string,
        category: (data.category ?? "") as string,
        group: (data.group ?? "") as string,
        description,
        notes,
        order: (data.order ?? 99) as number,
        tags: (data.tags ?? []) as string[],
        isActive: data.isActive === true,
        featured: data.featured === true,
        year: data.year as string | undefined,
        role: data.role as string | undefined,
        image: data.image as string | undefined,
        media: normalizeMedia(data as Record<string, unknown>),
        video: data.video as string | undefined,
        repo: data.repo as string | undefined,
        link: data.link as string | undefined,
        paper: data.paper as string | undefined,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
