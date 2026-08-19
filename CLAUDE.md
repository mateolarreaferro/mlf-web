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

Super minimalistic, soft, no hard edges. One sans family (Inter, matching satie.live), whitespace
instead of border rules, rounded corners everywhere, small lowercase gray
labels. **Light only** — `src/app/globals.css` sets `color-scheme: light`
and has no `prefers-color-scheme: dark` block; that is deliberate, don't
"restore" dark mode. **Palette:** everything is drawn from one spectral ramp,
warm to cool (F94144 F3722C F8961E F9844A F9C74F 90BE6D 43AA8B 4D908E 577590
277DA1). The five graph hues take every other step — `--flame` #f94144 agents,
`--sun` #f9c74f tools for creativity, `--leaf` #90be6d perception, `--teal`
#4d908e education, `--accent` #23718f music/art (also every link hover;
darkened from the ramp's 277DA1 so links clear 4.5:1). Paper #f8f7f4, ink
#23282c, `--faint` #656f77 — these three never move, so text contrast is a
fixed quantity regardless of the weather.

**Weather-reactive background.** The ambient washes sample the same ramp based
on current conditions where the visitor is. `src/lib/weather-theme.ts` is the
whole mapping and is pure — read it first. It is a *thermostat, not a
thermometer*: cold outside → the warm end of the ramp, hot outside → the cool
end. Cloud cover sets how much colour there is (overcast reads muted), daylight
wind speed sets the drift period (calm 80s → gale 26s). Night is a real move,
not a tint: it pulls a third of the way toward the deep end of the ramp, drops
the alpha to ~0.68, and slows the drift by 25%, so a hot night still reads cool
and the page feels like the room it is being read in. The header shows a sun or
moon accordingly — `atmosphere.isDay` is carried through the API for exactly
that.

`/api/weather` takes the visitor's location from Vercel's own
`x-vercel-ip-latitude` / `-longitude` request headers — never the browser
Geolocation API, so there is no permission prompt — rounds them to one decimal
(~11 km) and asks Open-Meteo (no key, no account). The upstream fetch is cached
15 minutes per rounded coordinate, so everyone in an area shares one call.
Nothing is stored. Off Vercel (local dev included) the headers are absent and
it falls back to Palo Alto; the response says `located: false`. The response
carries `cache-control: max-age=600`, so after changing its shape you must
hard-refresh — a stale cached body is indistinguishable from a broken
component, and cost an hour once.

`WeatherAtmosphere.tsx` writes the result to `--w1/--w2/--w3/--w-alpha` and the
drift durations, and renders the header line that says where the colours came
from ("palo alto · 24°c" plus three swatches). The swatches are ordered w1, w2,
w3 — which is genuinely how much of the page each one paints, so if you
re-weight the gradients in `globals.css`, keep that ranking or the line starts
lying. It hides below `sm` and stays hidden entirely when no city is known. **Do not try to transition those custom properties.** A
registered `@property` transition on the root element runs exactly once in
Chrome and then freezes the value — this was tried and reverted. The swap hides
behind a 700ms opacity fade on the wash layers (`html[data-wash="hold"]`)
instead, which is why the page appears to take one slow breath when the
forecast lands.

**Ambient washes.** `body::before` / `body::after` are two fixed layers of very
diffuse radial gradients drifting slowly against each other. They sit at
`z-index: -1`, so `html` carries the paper colour and `body` is transparent.
The look is modelled on Attractor Labs' "brain" UI: paper that happens to have
light in it, with the type left completely plain. Keep `--w-alpha` inside the
0.13–0.24 band the mapping produces — higher and it stops being paper and
starts being a gradient background. No blur filter on purpose; the gradient
falloff is the softness and a filter on an element that large is expensive.

**Type scale** is deliberately compressed — the headline tops out at 2.4rem,
bio copy is 13–15px, and the smallest label is 0.875rem. An earlier scale ran 0.8125rem→3.4rem
and read as too extreme; don't reopen that gap.

Generous motion everywhere (staggered
reveals, route fades, hover nudges, spring buttons) — always respecting
`prefers-reduced-motion`. Do NOT reintroduce decorative grids, hairline
borders, or mono/uppercase "technical" labels — that direction was
explicitly rejected.

## Page anatomy

One page (`src/app/page.tsx`):

1. **Hero** (`src/components/Hero.tsx`) — headline, bio with inline links,
   social icon row (react-icons). External links use `BioLink` (new tab);
   projects that only exist on this site use `ProjectLink`, which deep-links
   to `/?project=<slug>` in the same tab. The same bio lives in prose form in
   `agent-context.ts` — change one, change both or the agent contradicts the
   page.
2. **Knowledge graph** (`src/components/KnowledgeGraph.tsx`) — canvas
   force-layout. Mateo's photo is the pinned center node ("press to talk" →
   opens the agent chat). Every project orbits him, colored by its `group`:
   agents=red, tools for creativity=yellow, perception=green,
   education=teal, music/art=blue. Color legend below. Every node is
   drawn at the same radius (`NODE_R`); `featured` only enlarges the label.

   **It is drawn, not plotted.** Nothing is a true circle or a clean curve:
   nodes are closed wobbly blobs (`inkBlob`) filled once and then outlined a
   second time at a slight rotation, so the pen visibly goes round twice; every
   thread is stroked twice (`inkThread`) with different bow and a small
   overshoot past the node. All the wobble is seeded from the project slug via
   `seeded()`, so each project keeps the same hand forever — **never make the
   jitter frame-dependent**, or the whole graph shimmers.

   Nodes never overlap. Inverse-square repulsion alone cannot promise that, so
   `separate()` runs a few relaxation passes each tick treating every node as
   the **box its label occupies** (measured with `measureText` at resize, since
   the label is far wider than the dot) and pushing overlapping pairs apart
   along whichever axis they overlap least. "me" and whatever is being dragged
   are pinned, so the other node yields the whole distance.

   The first-viewport grid is `items-end`, not `items-center`: the hero's
   social row and the graph's legend then share a bottom line at every viewport
   height. Both rows carry `min-h-10` so their centres line up too whenever the
   legend doesn't wrap. Don't "fix" this with a margin — the two columns size
   independently, so a nudge only aligns them at one window height.

   Selecting a project splits the first viewport: the hero copy on the left
   fades out and `ProjectPanel.tsx` takes its place (category, name,
   year · role, "in development" dot, description, link pills), while the
   card on the right becomes pure media — `ProjectMedia.tsx` renders the
   project's `media` list as a vertical snap-scrolling stack (images, Vimeo/
   YouTube, arbitrary iframe embeds, local p5-style sketches), with dot
   navigation when there's more than one. `HeroGraph.tsx` owns the selected
   state for both columns; `KnowledgeGraph` is controlled via `selected` /
   `onSelect`. Esc closes. Deep link: `/?project=<slug>`.
3. **Thoughts** — reverse-numbered list; posts at `/thoughts/[slug]`.

## Content model (the important part)

**Projects** — one file per project in `content/projects/<slug>.md`:

```md
---
name: "Attractor"
category: "generative agent-based modeling"  # card label
group: "agents"      # node color: agents | tools for creativity | perception | education | music/art
order: 1             # sort for agent prompt; lower first — keep unique
tags: [agents]       # free-form, agent-only; used for cross-project retrieval
year: "2025–"        # optional → shown under the name
role: "founder & CEO"  # optional → shown under the name
isActive: true       # optional, default false → "in development" dot on the card
hidden: true         # optional, default false → file stays, project leaves the
                     # site entirely (graph, card, and agent). Used to park
                     # projects during content review — see content/PROJECT-REVIEW.md
featured: true       # optional, default false → bigger label in the graph
                     # (all nodes share one radius, NODE_R)
image: "/projects/attractor.png"   # optional; shorthand for a one-item media list
media:                             # optional; the right-hand panel, in order
  - "/projects/a.png"                        # bare string — type is inferred
  - { image: "/projects/b.png", fit: contain, caption: "what this shows" }
  - { vimeo: "https://vimeo.com/123456" }    # or { youtube: "..." }
  - { embed: "https://editor.p5js.org/.../embed" }   # any iframe-able URL
  - { sketch: "lorenz" }                     # local component, see ProjectMedia
video: "https://vimeo.com/..."     # optional → "watch video" pill
repo: "https://github.com/..."     # optional → "repository" pill
paper: "https://..."               # optional → "read paper" pill
link: "https://attractor.live"     # optional → "visit" pill
---

Brief description — the card body (plain text, no markdown rendering).

---

## notes

Everything below the standalone `---` divider is **agent-only**: origin story,
collaborators, technical approach, what it led to. Never rendered on the card,
always fed into the system prompt. Write freely here — this is the second-brain
half of the file.
```

Drop a file → node appears in the graph, gets a card, and enters the agent's
knowledge. No code changes. Projects without an image render a live Lorenz
attractor (`LorenzThumb`). Parsing lives in `src/lib/projects.ts` (`splitBody`);
the agent side is `src/lib/agent-context.ts`.

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
  light/dark automatically; new colors must be added to `readColors()` and to the legend in `KnowledgeGraph.tsx`.
- Old-site assets were scraped from the Squarespace CDN into
  `public/projects/`; the old `/well-being` page is gone (404).
- Headless screenshots of the running site race the entry animations —
  request the page once to warm it, then screenshot.
