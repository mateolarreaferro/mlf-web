@AGENTS.md

# mateolarreaferro.com

Personal site of Mateo Larrea Ferro — a "personal brain portfolio": a single
page where all of the work hangs off a living knowledge graph with Mateo at
the center, plus a bilingual blog ("thoughts") and an AI agent that answers
questions about the work.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4, fully static except
  `/api/chat`
- Content as markdown files (gray-matter frontmatter) — no CMS
- `motion` (framer-motion successor) for all animation
- AI SDK v6 + `@ai-sdk/openai` for the agent (model: `gpt-5.1`,
  `OPENAI_API_KEY` in `.env.local` — never commit it)

## Design

Super minimalistic, soft, no hard edges. One sans family (Geist), whitespace
instead of border rules, rounded corners everywhere, small lowercase gray
labels. Palette (in `src/app/globals.css`, light + dark): white paper / black
ink (inverted in dark mode), coral `--accent` #d9645e, yellow `--sun`
#e5dc5a, ochre `--ochre` #d89b44. Generous motion everywhere (staggered
reveals, route fades, hover nudges, spring buttons) — always respecting
`prefers-reduced-motion`. Do NOT reintroduce decorative grids, hairline
borders, or mono/uppercase "technical" labels — that direction was
explicitly rejected.

## Page anatomy

One page (`src/app/page.tsx`):

1. **Hero** (`src/components/Hero.tsx`) — headline, bio with inline links
   (Attractor, digital twins, Satie, Prisms), social icon row (react-icons).
2. **Knowledge graph** (`src/components/KnowledgeGraph.tsx`) — canvas
   force-layout. Mateo's photo is the pinned center node ("press to talk" →
   opens the agent chat). Every project orbits him, colored by its `group`:
   agents=coral, tools for creativity=yellow, perception=ochre,
   education=gray, music/art=ink. Color legend below. Pressing a project
   swaps the graph for a full-space card (image on top, category/name left,
   description + video/repo/visit pills right, ✕ top-right).
   Deep link: `/?project=<slug>`.
3. **Thoughts** — reverse-numbered list; posts at `/thoughts/[slug]`.

## Content model (the important part)

**Projects** — one file per project in `content/projects/<slug>.md`:

```md
---
name: "Attractor"
category: "generative agent-based modeling"  # card label
group: "agents"      # node color: agents | tools for creativity | perception | education | music/art
order: 1             # sort for agent prompt; lower first
image: "/projects/attractor.png"   # optional; file in public/projects/
video: "https://vimeo.com/..."     # optional → "watch video" pill
repo: "https://github.com/..."     # optional → "repository" pill
link: "https://attractor.live"     # optional → "visit" pill
---

Brief description — the card body (plain text, no markdown rendering).
```

Drop a file → node appears in the graph, gets a card, and enters the agent's
knowledge. No code changes. Projects without an image render a live Lorenz
attractor (`LorenzThumb`).

**Thoughts** — `content/thoughts/<slug>.mdx` with
`number / title / date / lang ("en"|"es") / summary` frontmatter. Body is
real MDX: markdown plus React components registered in
`src/components/mdx.tsx` (`<SoundCloud url>`, `<Vimeo id>`,
`<HarmonicsDemo>`). Ordering is by `number`, descending. Dates on the five
migrated posts are approximate — Mateo may still correct them.

## The agent

`src/app/api/chat/route.ts` streams via AI SDK; the system prompt is built
at request time by `src/lib/agent-context.ts` from the same project/thought
files that render the site, plus Mateo's bio (CEO of Attractor; previously
Stanford CCRMA, Shape Lab / Neuromusic Lab; Prisms VR; MIT teaching;
Berklee) and his music. It speaks EN/ES, presents as Mateo's agent (not
Mateo), and declines off-topic requests. Client: `MateoChat.tsx`
(`useChat` from `@ai-sdk/react`).

## Gotchas

- `src/lib/projects.ts` / `thoughts.ts` use `fs` — server only. Client
  components receive data as props (type-only imports are fine).
- The graph reads CSS custom properties at draw time, so it follows
  light/dark automatically; new colors must be added to `readColors()`.
- Old-site assets were scraped from the Squarespace CDN into
  `public/projects/`; the old `/well-being` page is gone (404).
- Headless screenshots of the running site race the entry animations —
  request the page once to warm it, then screenshot.
