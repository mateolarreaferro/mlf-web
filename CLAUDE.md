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
- AI SDK v7 + `@ai-sdk/anthropic` for the agent (model: `claude-opus-5-5`).
  **One key, `ANTHROPIC_API_KEY`, pays for the agent, Theo and HeadWave**
  (`.env.local`, never commit it). `OPENAI_API_KEY` is still read by the
  /agents class site's scene agent and notes agent, nothing else.

## Design

**The look (Mateo, 2026-10-04).** Colour from attractor.world, motion that
is quiet, and a graph that reads as an instrument. It replaced a softer,
hand-drawn, weather-tinted design he had grown tired of. He pointed at
rayzlz.com for motion and then asked for it toned down ("too copied"), so
the motion here is deliberately smaller than that site's: no decoding
glyphs, no strong blur. One sans family (Inter, which attractor.world also
uses), whitespace instead of border rules, rounded surfaces, small lowercase
gray labels, medium-weight tightly tracked titles.

**Two moods, light and dark, chosen by the time of day.** The page
follows the day where the visitor is, not the operating system: there is
deliberately no `prefers-color-scheme` block. `src/lib/mood.ts` is the whole
rule and is pure at the top. Auto mode uses the local clock until the forecast
lands (dark from 19:00 to 07:00), then Open-Meteo's real `isDay` for that spot
takes over via `setDaylight()` in `WeatherAtmosphere.tsx`. The header's
sun/moon button (`MoodToggle.tsx`) is the only control: press it and you get
the other mood, held for twelve hours in localStorage and then back to auto;
choosing what auto would have chosen anyway clears the override on the spot.
The mood is `data-mood` on `<html>`, set before first paint by `BOOT_SCRIPT`
(inlined in `layout.tsx`, a minified copy of the same rule; keep them in
step). **Two speeds of change.** A press fades over 700ms on `html` and `body`
(`--mood-fade`); while it runs, `html[data-mood-fade="fast"]` switches off the
per-element colour transitions on links and buttons, otherwise they restart
every frame and trail the page by seconds. The day itself moves slowly: when
sunset reaches a page that is already open (the weather re-ask flips `isDay`),
the clock crosses 07:00/19:00 with no forecast, or a twelve-hour override runs
out, `apply()` takes `DAWN_MS` (60s): `html[data-mood-fade="slow"]` stretches
`--mood-fade` to a minute, links keep their own 0.3s transitions because the
lag is invisible at that pace, `--night` (0 by day, 1 at night: a token, not
transitionable) is walked by hand as an inline value at 10 Hz so the blobs
change with the paper, and the graph blends its cached palette over the same
time (`startBlend` in `KnowledgeGraph.tsx`, which is also what makes the
700ms press fade reach the canvas instead of snapping). The first forecast
after load always takes the fast path: a page that opens grey and stays grey
for a minute reads as broken. `followTheDay()` in `mood.ts` is the
once-a-minute check, started by `WeatherAtmosphere`. Mood listeners receive
`(mood, fadeMs)`.

**Night tempo.** After dark everything that moves takes a quarter longer:
`--tempo` (1 / 1.25 in `globals.css`) scales the CSS animations, `useTempo()`
in `motion.tsx` scales every motion duration, delay and stagger, and
`hoverSpring(tempo)` is the one hover/press spring (stiffness 400 divided by
the tempo). Components that own a transition read the hook rather than
hard-coding seconds.

**Palette (attractor.world's, measured from its page).** Light: paper
#f4f3ee, ink #1b1d1b, `--faint` #5d625e, `--soft` #e8e7e1, `--accent`
#1a3a2a (attractor's dark green, every link hover). Dark is near black:
#0a0b0a, #eceae4, #969b97, #171917, accent #a6d1b8. Within a mood these never
move, so text contrast is a fixed quantity. **The blobs** are attractor.world's
three: deep green, periwinkle and sand at about a fifth strength, very large
and soft, on `body::before` / `body::after` (two fixed layers at
`z-index: -1`, so `html` carries the paper) drifting against each other over
34 and 42 seconds. No blur filter: the gradient falloff is the softness, and a
filter on layers that large is expensive. Each blob has a `-day` and `-night`
colour (deep green is lifted at night or it vanishes on black) mixed by
`--night`, see above. The graph's three groups take the same three colours,
`--g1` projects (green), `--g2` experiments / tools (periwinkle), `--g3` art
(sand), so the legend is the background.

**The weather no longer colours anything.** It still decides when the page
goes dark (`isDay`) and how fast the blobs drift (wind, `--w-drift-a/b` from
`weather-theme.ts`); the colours and alpha that module still computes are
unused by the page. `/api/weather` takes the visitor's location from Vercel's own
`x-vercel-ip-latitude` / `-longitude` request headers (never the browser
Geolocation API unasked, so there is no permission prompt), rounds them to one
decimal (~11 km) and asks Open-Meteo (no key, no account). The upstream fetch is
cached 15 minutes per rounded coordinate, so everyone in an area shares one
call. Nothing is stored. Off Vercel (local dev included) the headers are absent
and it falls back to Palo Alto; the response says `located: false`. **The IP
guess is regional, not local**: from Cambridge it names Boston or Waltham as
often as not, so the header line says "near boston" for it, and pressing the
line is the one way to do better. That press asks the browser for the real
position (the prompt is only ever raised by the press), rounds it to two
decimals (~1 km) in the browser, keeps it in localStorage (`mlf:place`, 30
days), and sends it as `?lat=&lon=`; the route then names the town through
OpenStreetMap's Nominatim (zoom 10, cached a day per point) and answers
`precise: true`, which drops the "near". The response carries
`cache-control: max-age=600`, so after changing its shape you must
hard-refresh. The header line ("near palo alto · 24°c") hides below `sm`, has
no swatches any more, and a page left open asks again every fifteen minutes
while its tab is visible.

**Motion: quiet.** Names and the headline type themselves out behind a thin
blinking caret (`typewrite` / `<Typewriter>` in `motion.tsx`: the splash
name, the header wordmark, the hero headline, a project's name when it
opens). The untyped rest is laid out but transparent, so nothing reflows,
and text that will type waits transparent (`.tw-wait`, with a `<noscript>`
rule in the layout) so it never flashes whole first; screen readers get a
hidden copy. Reveals arrive barely out of focus (3px blur, 6px of travel).
List rows (`.sharpen`: research, thoughts, the phone project list) settle into
focus as they scroll in, with a CSS scroll timeline and no script. Keep it
this small. Always respect `prefers-reduced-motion`.

**Type scale** is deliberately compressed: the headline tops out at 2.4rem,
bio copy is 13-15px, and the smallest label is 0.875rem. Don't reopen that
gap. Do NOT reintroduce decorative grids, hairline borders on the page, or
mono/uppercase "technical" labels: that direction was explicitly rejected
(the graph's instrument lines are the exception, they live in the canvas).

**UI sound.** The same super-subtle synthesized tones as attractor.world:
880 Hz sine on mouse hover, 587 Hz on press/Enter, eased attack, exponential
out — no audio assets. `src/lib/sfx.ts` is the voice (keep the gains at
0.02/0.035 — barely audible is the point — and they halve in the dark mood,
`NIGHT_GAIN`, because the same tone at 1 a.m. is not the same tone); `SoundEffects.tsx` (mounted in the
layout) delegates to every link/button, and `KnowledgeGraph.tsx` calls the
same tones from its canvas hit-testing. Hover stays silent until the first
click has unlocked the AudioContext — that's the browser, not a bug.

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
   opens the agent chat). Every project orbits him, colored by its `group`
   with the background blobs' three colours (see Palette). Color legend below.
   Every node is drawn at the same radius (`NODE_R`); `featured` only
   enlarges the label. Each group owns a third of the ring (`sectorAngle`):
   projects on the left, experiments top right, art bottom right. Nodes
   start inside their sector and a weak tangential pull in `tick()` drifts
   them back, so the three neighbourhoods survive dragging and resizing
   without being pinned.

   **It is an instrument, not a drawing** (it used to be hand-drawn, wobbly
   blobs and double-stroked threads; Mateo asked for it to feel futuristic).
   The orbits are **perfect circles, one radius** (`orbit`), never an oval
   stretched to the box: dashed rings at 0.84 and 1.12 of it, and an outer
   ring of ticks turning very slowly with each group's arc marked in its
   colour. **The outer ring never touches a label**: `fit()` settles a
   scratch copy of the layout with the live `tick()`, measures how far the
   farthest dot or label text reaches (`reachOf`, dot and label as two
   boxes), puts the ring 18px beyond it, and shrinks the orbit until that
   fits the canvas; each frame the ring also eases outward if a live label
   reaches further. Threads are hairlines brightening toward their node, with
   a small pulse travelling out along each (speed and phase seeded from the
   slug via `seeded()`). Nodes are exact dots in a thin ring that opens into a
   crosshair on hover. The portrait is a perfect circle in black and white
   until hovered, inside a fine ring with a sweeping arc. On a phone-width
   canvas (under 560px) there is no outer ring, and below 480px only featured
   projects are labelled (the rest name themselves when touched;
   `ProjectIndex` lists them all).

   **It rests when unseen.** The loop breathes every frame by design, but
   stops itself while a project card or the chat covers the canvas
   (`coveredRef`) or it is scrolled off screen (an `IntersectionObserver`),
   and `wake()` restarts it when either ends. Anything that changes what the
   graph should show while paused (a mood or weather change) goes through
   `wake()` too, so a resumed graph never shows stale colour.

   Nodes never overlap. Inverse-square repulsion alone cannot promise that, so
   `separate()` runs a few relaxation passes each tick treating every node as
   the **box its label occupies** (measured with `measureText` at resize, since
   the label is far wider than the dot) and pushing overlapping pairs apart
   along whichever axis they overlap least. "me" and whatever is being dragged
   are pinned, so the other node yields the whole distance. After that a hard
   clamp in `tick()` keeps every label box fully inside the canvas: the
   `bounds()` spring can be overshot and a drag can go anywhere, and a name
   cut off at the edge is never acceptable.

   The first-viewport grid is `items-end`, not `items-center`: the hero's
   social row and the graph's legend then share a bottom line at every viewport
   height. Both rows carry `min-h-10` so their centres line up too whenever the
   legend doesn't wrap. Don't "fix" this with a margin — the two columns size
   independently, so a nudge only aligns them at one window height.

   Selecting a project splits the first viewport: the hero copy on the left
   fades out and `ProjectPanel.tsx` takes its place (category, name,
   year · role, "in development" dot, description, link pills), while the
   card on the right becomes pure media — `ProjectMedia.tsx` renders the
   first item of the project's `media` (an image, a Vimeo/YouTube video, an
   arbitrary iframe embed, or a local p5-style sketch), or a live Lorenz
   attractor when the project has none. **One item per project**: the
   snap-scrolling multi-slide stack was tried and cut, so a video a project
   only wants linked belongs in `video:`, not in `media`.

   **The card is shaped to its picture.** `measure()` in `projects.ts` reads
   the intrinsic size out of a local image's file header (PNG/JPEG/GIF/WebP,
   no dependency) at build time, and the card takes that aspect ratio: height
   capped at 70% of the graph box, width at 90% of the column, centred either
   way. A fixed square cropped every wide screenshot in half, and full bleed
   read as a billboard. Videos and embeds fall back to 16:9, anything
   unmeasurable to a square.

   The two columns are bottom-aligned, so the left one takes a fixed
   `--graph-h + 6.5rem` (twice the legend strip under the card) while a
   project is open — that puts its centre, and the panel centred inside it,
   exactly on the centre of the image whatever height the copy is.
   `--graph-h` is the graph box's height, declared once in `globals.css`
   because both columns need it. `HeroGraph.tsx` owns the selected
   state for both columns; `KnowledgeGraph` is controlled via `selected` /
   `onSelect`. Esc closes. Deep link: `/?project=<slug>`.
   **Phones are their own layout.** The split above only exists from `lg`
   (1024px, `useWide()` in `src/lib/viewport.ts`). Below it the page is one
   column, and stacking the two halves failed (Mateo found it clunky and hard to use,
   2026-10-04): a tapped project put its words a screen and a half above
   its picture, and twenty-odd nodes on a canvas a thumb wide overlapped and
   could not be hit. So on a phone: a project opens as `ProjectSheet.tsx`, a
   full-screen page sliding up (back, picture, then the copy from
   `ProjectPanel`, one scroll) that leaves the page underneath where it was;
   `ProjectIndex.tsx` lists every project under the graph as tappable rows,
   grouped and coloured like the graph, and replaces the legend; the chat
   takes the whole screen. The sheet and the phone chat are portalled to
   `<body>` because the route template's transform and Reveal's filter turn
   `position: fixed` into absolute. The graph itself counts a press on a
   label as a press on its node, gives touch a wider reach, and widens its
   ring on narrow canvases. The section must stay `grid-cols-1` below `lg`: an
   implicit column grows to its widest content and the phone page went
   560px wide. Inputs are 16px on phones (`text-base lg:text-sm`) or iOS
   zooms on focus.
3. **Thoughts** — reverse-numbered list; posts at `/thoughts/[slug]`.

**The way in.** On a fresh tab that lands on "/", `Splash.tsx` shows the name
alone, then fades it out in place with the paper (a diagonal glide into the
header wordmark was tried and rejected: no travel). Whether it plays is decided before paint by
`INTRO_SCRIPT` (`src/lib/intro.ts`, inlined in `layout.tsx`); entering on any
other page counts as seen. After it, first-time visitors get `Tour.tsx`: a
spotlight (a rounded hole in a paper-coloured box-shadow, document
coordinates so it rides the scroll) over each `data-tour` target: `graph`,
`graph-box` (the photo), `research`, `thoughts`, `room` (the header). Copy
lives in `STEPS`. The nav's "tour" replays it.

## Content model (the important part)

**Projects** — one file per project in `content/projects/<slug>.md`:

```md
---
name: "SATIE"
category: "audio world model"  # card label
group: "projects"    # node color and sector: projects | experiments / tools | art
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
media:                             # optional; the right-hand panel. ONE item —
                                   # multi-slide cards were tried and cut, and
                                   # anything past the first is ignored
  - { image: "/projects/b.png", fit: contain, caption: "what this shows" }
  # other shapes: a bare "/projects/a.png" string (type inferred),
  # { clip: "/projects/theo-demo.mp4" } (a local recording, muted and looping;
  # record it at 16:9, see "Demo clips" below),
  # { vimeo: "..." } or { youtube: "..." }, { embed: "<any iframe-able URL>" },
  # { sketch: "lorenz" } (local component, see ProjectMedia)
video: "https://vimeo.com/..."     # optional → "watch video" pill
repo: "https://github.com/..."     # optional → "repository" pill
paper: "https://..."               # optional → "read paper" pill
link: "https://attractor.live"     # optional → "visit" pill
demo: "/theo"                      # optional → "interactive demo" pill, first in the
                                   # row; a path on this site (see Hosted projects)
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
`<HarmonicsDemo>`). Ordering is by `number`, descending. An optional `password:` holds the sha-256 of a password: the post
then renders per request and shows `ThoughtLock` until the password is
entered (checked in a server action, remembered in an httpOnly cookie for 30
days). The repo is public, so this hides a post from the site, not from git. Dates on the five
migrated posts are approximate — Mateo may still correct them.

## /agents (the class site)

`mateolarreaferro.com/agents` is Mateo's documentation site for an agents class
at the MIT Media Lab (fall 2026): a three.js world you swim through, one room
per week plus the final project. **Read this history before restyling it**;
Mateo rejected four versions and each rejection is a rule. (1) Solid white
architecture with glass and shadows: "not the aesthetics at all", wanted zen,
point cloud, abstract. (2) Rainbow particles on random loops: "looks like
shit": wanted a **restricted palette** (cool teal/blue/pale ink for water and
creature; warm amber-to-red only for the work; departing shards deepen to blue)
and **motion with a cause** (one flow field, ordered streamlines, letting go in
waves, not per-point dice). (3) Momentum and lagged look: "hate the
controllers": **controls copy Satie's** (`~/attractor-labs/apps/satie`,
`src/ui/components/viewport/controls.tsx`): immediate drag-look, WASD and
arrows both move, Q/E dive/rise, shift sprint, scroll dolly, double-click
teleport, key legend at the bottom centre. (4) A rectilinear two-storey
building in points: "don't like the vibe at all, everything feels too straight,
the environment doesn't change as I move". So now there is **no building and
no straight line**: the world is one jellyfish (`js/world.js` header explains
it): pods spiralling up a column of current, the bell on top as the final
project, dunes, kelp, tendrils; **everything wobbles together** on one slow
noise; and **it reacts to the visitor** (forms within ~7 m of you and dissolves
beyond ~19 m, pods swell as you near, a fading wake of trail marks, water
colour by depth). Also kept from his asks: dark only; shards are **triangles
with heavy-tailed sizes**; curl of quintic gradient noise for the flow; type is
**Instrument Serif + Instrument Sans** (not the main site's Inter); each week's
object is a **strange attractor** drawn fine and faint (additive light burns
out fast: eleven thousand shards share a cubic metre). Audio must come from
Satie's MCP, never synthesis; the brief lives in `js/sound.js`. **Its source is not in this
repo.** It lives in `agents2026-mateo/website/` (the course's private repo,
`mitmedialab/agents2026-mateo`, checked out in the project root and
git-ignored here) as plain static files with vendored three.js and no build
step, because the course's Pages workflow deploys that folder as is.
`npm run sync:agents` (`scripts/sync-agents.mjs`) mirrors it into
`public/agents/`, which is committed; never edit `public/agents/` by hand, the
next sync replaces it. `next.config.ts` rewrites `/agents` to
`/agents/index.html`, and the page sets its own `<base>` so its relative URLs
work with or without a trailing slash (it is also served from GitHub Pages
under a different path, so nothing in it may be root-absolute). ESLint ignores
both folders. The graph node is `content/projects/agents.md`; its card media is
the site itself in `?embed=1` mode (no interface, drifting camera). The class
repo's README covers the rest: `js/rooms.js` is the manifest everything derives
from, and `js/sound.js` is the live Satie playback integration and authoring brief
(24 hosts, five signals, 19 events). The audio files are local in
`website/satie/`; sound and the membranes share `world.swell`, and opening
a page ducks the scene. Its underwater appearance is always dark. Course policy requires
disclosing AI use, so keep the disclosure lines in the README and the weekly
pages truthful when you change things.

## Hosted projects (/theo, /headwave, /sticky-notes)

Some projects run on the site itself: the card's "interactive demo" pill
(`demo:` in the frontmatter) opens the real app in a new tab. Same shape as
/agents: **the source is not in this repo.** Each project keeps its own
repository, cloned into `hosted/` (git-ignored), and `npm run sync:demos`
(`scripts/sync-demos.mjs`) builds it and mirrors the result into
`public/<slug>/` (front end) and `python/<slug>/src/` (backend), which are
committed. Never edit those copies by hand; change the project's repo and sync.

Theo is the first. Its Studio is a Vite app built with `--base=/theo/` and
`VITE_THEO_API=/api/theo`; `next.config.ts` rewrites `/theo` to the built
index. Its backend is the FastAPI module the desktop app spawns, but no server
runs here: `python/theo/bridge.py` (site-owned, not synced) calls the endpoint
functions directly. The path of a request is browser →
`src/app/api/theo/[...op]/route.ts` (same-origin check, size caps, budgets) →
`api/demo-worker.py` on Vercel over a signed request, or a spawned interpreter
under `next dev`. Parsing is free and runs on every edit; the other six
operations are Claude calls, budgeted at 40 an hour per visitor and 400 per
instance. Without the key the demo still opens, parses and draws the graph, and
says the model is not connected. Theo runs on `claude-sonnet-4-6` (`THEO_MODEL`)
because its temperature slider is rejected by the newer models.

HeadWave is the second, and almost all of it runs in the visitor's browser.
Its front end is plain files with no build step, written against a Python
server that owns the EEG headset, the camera, MIDI and OSC. On the web,
HeadWave's own `static/web.js` (in its repo, loaded first by the synced page)
answers what that server would: it patches `fetch` and `WebSocket` for the
page's `/api/...` and `/ws/...` calls and serves them from a port of the EEG
simulator and from MediaPipe face/gaze/hand tracking on the visitor's webcam
(no frame leaves the browser; the models load from jsdelivr and Google storage
only when the camera is started). It opens with the simulator running and a
stored starter patch (`static/web-starter.json`), so a visit costs no model
call. MIDI, OSC, recording and a real headset answer "desktop only". Only
`/api/ai/*` reaches the site: `src/app/api/headwave/[...op]/route.ts` →
worker → HeadWave's assistant service, on `claude-opus-5-5`
(`HEADWAVE_MODEL`), budgeted at 60 an hour per visitor (one generation is two
calls). The sync rewrites the page's `/static/` paths to `/headwave/static/`.

Ansantuario is the third, as an **open wall called "sticky notes"** at
`/sticky-notes` (its graph node and card are `content/projects/sticky-notes.md`,
"Sticky Notes", written for any visiting friend; the private app is its origin
story in the notes): anyone leaves a text note, signed or anonymous. The page
never names Ansantuario or its song (Mateo asked for that): the title is
"sticky notes", the music is an untitled `audio/music.mp3` behind a single
music-note button, and the private app's password screen is stubbed out. It
opens on a splash with four instruction notes and an English/Español choice
(remembered in the browser, defaulting to the browser's language); the
corner card has the same switch and a "how it works" link back to the
splash. The words live in the repo's `src/renderer/src/lib/i18n.ts`, and the
server answers refusals in the page's language (`x-wall-lang`, the
`MESSAGES` table in `open-wall.ts`). It is not Mateo and Marielisa's private
wall, which lives in Firebase and must never be reachable from the site. Its
repo's `npm run build:web` (`vite.web.config.ts`) builds the renderer with
every Firebase module swapped for `src/web/*` (the build fails if anything
imports `firebase/*`) and reads no `.env`; after a sync, grep the bundle for
`firebase`, `ansantuario` and `bicho` and expect zero. Notes go to
`src/app/api/sticky-notes/[...op]`, whose rules are all in
`src/lib/open-wall.ts`: Redis hash `wall:<VERCEL_ENV|dev>:notes` (production,
preview and dev never share a wall), a version counter the page polls every
4s, text only, 1000 characters, 10 new notes an hour per IP, 1000 notes in
all. A visitor is a random token in their browser, stored only as a keyed
hash; they edit, move and delete their own notes only.
`/sticky-notes?moderate` (or `?moderar`) raises the password box
(`x-mlf-locked-copy: moderate`), and the password cookie lets you delete any
note. No model is called, so the wall spends none of the free uses. The sync
turns the 57 MB wav into a 3 MB mp3 and keeps it across syncs.

**Sketches (the Sketches card, 2026-10-05).** The card is a grid of Mateo's
p5.js sketches (`SketchGallery.tsx`, frontmatter `media: - { sketch:
"gallery" }`): fifteen in a 5x3 grid of square tiles (the card's "visit"
pill is the Instagram link). The corner button takes the grid full screen;
a playing sketch then reopens at the screen's shape, and since the pointer
can't leave a full-screen grid, a click on the sketch closes it. Each tile is a still; resting the mouse on one for 0.3s (or tapping
it) grows it until it fills the whole grid, running the real sketch, and
leaving the card (or tapping again) shrinks it back. The card's close
button sits above it (`z-20`). Until the sketch has drawn, `run.html` posts
a message after its first frames, its still shows dimmed under a turning
arc. The sketches are his code,
unmodified, in `public/sketches/<name>.js`; `public/sketches/run.html?s=<name>`
runs one in global mode with p5 1.11.10 from cdnjs, inside a sandboxed
iframe (eleven global-mode sketches on one page would trample each other),
in a frame 1000 wide and shaped like the grid, which the gallery scales down, so a sketch written for a full
window keeps its composition. Only the open one runs, and the iframe takes no
pointer events (hover is tracked by the page, where leaving is reliable), so
sketches that read the mouse don't see it. The stills
(`public/sketches/<name>.jpg`, 480px) are frames of the same sketches rendered
headless with Playwright at 1000x1000: most after 6s, the slow builders
longer (rossler 16s, triangles 32s, flow-field 45s, the two currents
12-14s). To add one: drop
`<name>.js` in `public/sketches/`, render its still the same way, add it to
`SKETCHES` in the component. ESLint ignores the folder.

**Rats & Children (2026-10-05)** plays in its own card: Mateo's ChucK/ChuGL
piece (Artful Design, fall 2024; source `RatsAndChildren.ck` in his
`Artful-Design-Fall-24-main/Sequencer` folder, not a repo here) ported to
the browser, with no ChucK. `src/lib/rats-and-children/` is the whole
piece: `world.ts` the rules, ported with the original's numbers (anything
the original did once per frame is scaled by `dt * 60`, so it runs the same
at any refresh rate), `gl.ts` the picture in plain WebGL2 (every circle is
an instanced quad drawn as an exact disc by the shader, then a bloom at
ChuGL's threshold, screened on rather than added so a white sky doesn't
swallow the grey circle), and `sound.ts` the mix in Web Audio (per-being
loops at 1/N, one-shots, beds by population, short fades and a limiter
added). `RatsAndChildren.tsx` is the card (`media: - { sketch:
"rats-and-children" }`): it opens on a card of instructions whose "begin"
is the press that starts the sound, then press and hold to bring beings in;
a corner button goes full screen where the browser allows it (hidden on
iPhone Safari; `FullscreenButton.tsx`, shared with the sketches). The
sparks are drawn as short streaks that narrow and fade toward the tail, with
a little drag and some size variety, and a thin ring opens at each birth:
polish Mateo asked for without changing the look. While the card is open,
the left column (under the description on a phone) shows `RatsPanel`: who
is alive by colour and size, a minute of population, births, deaths,
touches, disasters, the time of day and what is sounding, and the controls
(hear all, red or yellow; tone, a low-pass from 180 Hz to open; volume;
speed; how often disasters fall). The piece and the panel only talk
through `live.ts` (two small stores), and the piece publishes five times a
second, not every frame. The samples are the original WAVs as MP3 in
`public/rats-and-children/` (89 MB to 7 MB, `ffmpeg -nostdin -i x.wav -c:a
libmp3lame -q:a 4`), loaded only when first needed; `manifest.json` keeps
each file's true length so `trim()` can cut MP3 padding off a decoded loop
(Chrome already honours LAME's gapless header, so there it is a no-op;
Safari is not verified). Never call `loseContext()` on teardown: the canvas
would get its dead context back on a remount and draw nothing.

**Periphery and SacredVis (2026-10-05)** play in their cards the same way,
ported from Mateo's Artful Design folder (`Periphery/Periphery.ck`,
`Visualizer/SoundAndVision.ck`): instructions first (the press that starts
sound), full screen, and a panel in the left column (`PeripheryPanel`,
`SacredVisPanel`; `ProjectPanel`'s `PANELS` map picks it by the media's
sketch name, and a press on a panel control before "begin" starts the
piece). They share `src/lib/pieces/gl.ts` (discs, rings and rectangles as
instanced quads, thick coloured polylines, the screened bloom, and the tiny
`store` the piece and panel share); Rats & Children still has its own
renderer. **Periphery** (`src/lib/periphery`, samples in `public/periphery`)
is the breathing pacer: the edge moves at 0.25 units a second, so depth
(scroll over it, or the slider) sets the length of a breath; turns are read
from the cycle (sin of its angle), never from the radius, or a change of
depth counts false breaths. The four ambience volumes are the original's
second set (0.6, 0.2, 0.3, 1.0) every time. "Keep it in a corner" opens a
Document Picture-in-Picture window (Chrome and Edge on a computer) that
floats over every app and keeps the clock while it is open, drawn in plain
2D. **The browser extension** is `extensions/periphery` (Manifest V3, a
shadow-root corner on every page that takes no clicks, the breath from the
clock so tabs breathe together, settings in `chrome.storage.sync`, no sound,
only the `storage` permission); the site serves it zipped at
`public/periphery/periphery-extension.zip` (rebuild with the command in its
README) and the panel says how to load it unpacked. The Chrome Web Store
needs Mateo's developer account. **SacredVis** (`src/lib/sacredvis`) reads
the browser's analyser at the original's 317 bands (31.5 Hz each, 20 Hz to
10 kHz) and scales it to ChucK's unnormalised FFT (`TO_CHUCK`, 15 x 350):
too small a scale leaves every band under the colour threshold and the
spiral draws white. Its source is the microphone (played back only with
"listen back" on, since speakers feed it back) or `meditation.mp3` from Rats
& Children.

**Demo clips.** The three hosted projects' cards play a recording of the
project in use (`public/projects/theo-demo.mp4`, `headwave-demo.mp4`,
`sticky-notes-demo.mp4`), the way the Agents card plays its own site. They
were recorded on 2026-10-04 with Playwright against `next dev` at 1280x720,
waits for the model sped up, then encoded with ffmpeg (H.264, CRF 24, no
audio, faststart): about 20 to 30 seconds and under 1.2 MB each. Record
sticky notes against the local wall (`wall:dev`), never production, and
delete the sample notes afterwards. Visitors who prefer reduced motion get
the clip paused, with controls.

What the routes share is `src/lib/hosted.ts`: `sameOrigin`, `budget`,
`readBody`, and `runWorker(slug, op, body)`. One Python function serves every
project (`api/demo-worker.py` loads `python/<slug>/bridge.py`, which is
site-owned and not synced). Under `next dev` the same bridge is spawned with
`hosted/.venv/bin/python` (`DEMO_PYTHON` overrides); create it once with
`uv venv hosted/.venv && uv pip install --python hosted/.venv/bin/python -r
python/theo/requirements.lock.txt -r python/headwave/requirements.lock.txt`.
The budgets live in memory, so they are a brake, not a spend cap: the cap
belongs on the key itself. The chat agent draws on the same kind of budget.
The worker signature uses `DEMO_WORKER_KEY`, falling back to
`WEEKLY_NOTES_EDIT_KEY`. To add a project: clone it into `hosted/`, add a
function to `sync-demos.mjs`, a bridge, a route, a rewrite in `next.config.ts`,
its slug in the worker's `SLUGS`, and `demo:` in its project file.

**Three free calls, then a password.** Every visitor gets three model calls
in total, shared by the agent chat, Theo and HeadWave (`spendUse` in
`src/lib/hosted.ts`; a HeadWave generation counts once, its parameters call
rides along; Theo's "render all" is one per section; parsing is free). Past
that a route answers 401 with `x-mlf-locked`, and `public/unlock.js` (loaded
by the layout and injected into both demo pages by the sync) shows a password
box, posts to `/api/unlock`, and repeats the held call. The password is
`MODEL_PASSWORD`; a correct one sets an httpOnly cookie keyed on it, so
changing the password signs everyone out. Uses are counted per IP in Upstash
Redis (Vercel Marketplace, `KV_REST_API_URL` / `KV_REST_API_TOKEN`, keys are a
keyed hash of the address, thirty-day expiry) and in a signed cookie; the
higher wins, so neither clearing cookies nor a new instance resets it. Without
the Redis variables (local dev) the IP count falls back to memory. Failed calls
are refunded. `DEMO_WORKER_KEY` signs both the worker calls and the cookie. Locally, an `ANTHROPIC_API_KEY`
exported in the shell wins over `.env.local` (Next does not override existing
environment variables).

Vercel installs one root `requirements.txt` for every Python function, so each
runtime keeps its pins in `python/<name>/requirements.lock.txt` and
`scripts/requirements.mjs` writes their union; both sync scripts call it. Add
a runtime's pins there, never to the root file.

## /capsula (Cápsula del Tiempo)

A private yearly interview among Mateo's friends (2026-10-05): the same
questions every round, so each person can read how they changed. Unlike the
hosted projects, **the code lives in this repo** (`src/lib/capsula/`,
`src/app/capsula/`, `src/app/api/capsula/`, `src/components/capsula/`) and
**the data never does**: people and entries are in Redis under
`capsula:<VERCEL_ENV|dev>:*`, every value sealed with AES-GCM under
`CAPSULA_KEY`; recordings and original files are in the private Blob store
under `capsula/<env>/<username>/`. Losing or changing `CAPSULA_KEY` makes the
whole capsule unreadable, so it never rotates. `CAPSULA_ADMIN_PASSWORD` opens
`/capsula/admin`. The UI is Spanish, always the light mood (a `:has([data-capsula])`
block in `globals.css`), and `SiteChrome` hides the portfolio header/footer.

Privacy rules, all in `auth.ts`: a friend signs in with the username and
password Mateo hands out (the admin can reveal or reset them). Every capsule
is closed to everyone but its owner and the admin; there is no "public"
(Mateo removed it on 2026-10-05). `/capsula/circulo` lists everyone by name,
and reading someone else's capsule works like following a private Instagram
account (Mateo, 2026-10-05; it replaced typing their password): "pedir
acceso" files a request in `asks:<owner>` (store.ts), the owner sees it on
their own capsule page and accepts or declines, and can take access back
later from "N personas pueden leerla". Accepted is read only. Requests are
server-side, so they follow a friend to any browser and are untouched by a
password change; rename and delete re-file or drop them in everyone's hash.
The ops are `request` / `withdraw` / `answer` (not `ask`: the chat route
`/api/capsula/ask` would win). A new password bumps `version`, closing every
session made with the old one.

**The interview speaks** (2026-10-05). Each new interviewer message is read
aloud by ElevenLabs (`api/capsula/voice`, `ELEVENLABS_API_KEY`, voice
`ELEVENLABS_VOICE_ID`, model `eleven_multilingual_v2` unless
`ELEVENLABS_MODEL`); without the key the page has no voice and no toggle.
Answers can be spoken: with the field empty the main button is the
microphone, MediaRecorder records at 32 kbps (stops at ten minutes, under
Vercel's 4.5 MB body cap), `api/capsula/listen` sends it to Whisper and the
text lands in the field to fix before sending; no audio is kept. This
replaced the browser's speech recognition (`Dictate.tsx`, gone). Both halves
live in `components/capsula/voice.ts`. A first visit opens "cómo funciona"
in the room; the header's ? reopens it, and the voice waits for it to close,
so the first question plays after a press and autoplay is never blocked.

Answers are stored against question ids in `questions.ts` (the old
`Template.xlsx`), which is what lines years up: never reuse or rename an id,
retire it instead. Spreadsheets map straight onto ids with no model call;
text, .docx, recordings (Whisper, `OPENAI_API_KEY`) and finished interviews go
through `extract()` (Claude). The interviewer (`interviewer.ts`) has two modes,
guided and conversation, prefixes every message with `[[n]]` (section) or
`[[fin]]`, and keeps the conversation as a server-side draft so friends can
stop and resume. Members do not spend the site's three free calls; they have
their own daily caps (`within()` in `store.ts`). A capsule page has four tabs (`?ver=`), all from `insight.ts`, which makes
two readings in two separate calls so the voices never mix: **mapa**, the
default, is plain facts only (people, places, what happened, what they like,
e.g. "te mudaste a brasil"; Mateo asked for objective points, no
interpretation), with an overview and their quotes per point; **lo que veo**
is a letter from an agent instructed to read them as a psychologist who loves
them, and the page always says that first (no diagnoses, nothing invented).
Both are cached sealed per set of entries (and per `INSIGHT_VERSION`) and
re-read in `after()` when an entry is added or removed, or when their first
name changes. **respuestas** is one year or "todos" with a section index;
**conversar** is a chat (`api/capsula/ask`) that answers only from that one
capsule, so it can never reveal more than the asker may read. The interview has browser dictation (`Dictate.tsx`). The source folder is
`~/Desktop/Capsula del Tiempo/Entrevistas`, one folder per round;
`scripts/capsula-import.mjs` imports it through the admin endpoints and writes
new passwords next to it, outside the repo.

## The agent

`src/app/api/chat/route.ts` streams via AI SDK (Claude, with the system
prompt cached and effort low); the system prompt is built
at request time by `src/lib/agent-context.ts` from the same project/thought
files that render the site, plus Mateo's bio (CEO of Attractor; previously
Stanford CCRMA, Shape Lab / Neuromusic Lab; Prisms VR; MIT teaching;
Berklee) and his music. It speaks EN/ES, presents as Mateo's agent (not
Mateo), and declines off-topic requests. **It talks like a chat: two short
sentences at most** (Mateo asked for that on 2026-10-04 after long
paragraph answers), usually ending with a question back; `maxOutputTokens`
in the route only catches a runaway. Client: `MateoChat.tsx`
(`useChat` from `@ai-sdk/react`).

## Gotchas

- `src/lib/projects.ts` / `thoughts.ts` use `fs` — server only. Client
  components receive data as props (type-only imports are fine).
- The graph reads CSS custom properties into a cache (`readColors()`, every
  90 frames, and through `startBlend()` on a mood change via `subscribe` from
  `mood.ts` or on `ATMOSPHERE_EVENT`, which walks the drawn palette to the
  new one over the fade), so it follows the mood;
  new colors must be added to the `Palette` type, `readColors()` and the
  legend in `KnowledgeGraph.tsx`.
- Old-site assets were scraped from the Squarespace CDN into
  `public/projects/`; the old `/well-being` page is gone (404).
- Screenshot scripts run from the repo root write relative paths into the
  repo; give them absolute paths (a stray `m/` folder of screenshots once
  looked like a stale-cache bug).
- Headless screenshots of the running site race the entry animations —
  request the page once to warm it, then screenshot.
