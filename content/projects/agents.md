---
name: "Agents"
category: "class notebook, as a building"
group: "experiments / tools"
tags: [agents, education, tools for creativity]
order: 25
year: "2026"
role: "student"
isActive: true
media:
  - { embed: "/agents/index.html?embed=1" }
link: "/agents"
---
Repository for my MIT Media Lab class on agents.
---

## notes

The class site is served at mateolarreaferro.com/agents. Its source is a separate
private repository that belongs to the course (mitmedialab/agents2026-mateo), in
the `website/` folder: plain static files, three.js with no build step, copied
into `public/agents` here with `npm run sync:agents`. The same folder is also
what the course's GitHub Pages workflow deploys.

Structure: a manifest of rooms (`js/rooms.js`) drives everything. The world is a
seeded cloud of triangles (no solid geometry, no lights), dark and under water:
pods on a helix around a column, climbing 1.25 m per week, the bell on top.
Each open week is a warm breathing membrane holding a strange attractor (Lorenz
first); weeks not yet assigned are cool buds. One flow field carries
streamlines and waves of letting go; the whole world wobbles on one slow noise
and responds to the visitor (forms nearby, a wake, pods that swell, colour by
depth). The controls are the same as Satie's. Pressing a pod's words goes there
and opens that week's write-up in a side panel.
`#week01` in the URL arrives standing in that room.

Week 1 (September 2026) is Shape the world: an agent changes the scene through
its visible controls. On the website, a handwritten browser loop uses GPT-5.1
through a server-side API to interpret requests, apply changes and verify the
result. The original Python/Qwen version runs locally without an agent
framework. Both use bounded action/observation loops and preserve controls outside
the chosen edit scope. The weekly page includes real transcripts, a local video,
failures and implementation notes.

Sound is composed and played locally through the vendored Satie runtime. The
world keeps the scene contract Satie needs (stable room ids, metres, a listener,
signals, and events on entering a room) in `js/sound.js`; playback starts from a
user gesture and ducks while a page is open.
