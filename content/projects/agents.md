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

Week 1 (September 2026) is Shape the world: a local Qwen 2.5 3B agent uses the
same visible controls as the person to edit color, fog, brightness, motion,
breathing and four sound levels. A Python loop calls the downloaded model
through local Ollama without an agent framework, and reads back runtime state
after each action. The write-up covers observation, parsing, memory, completion
checks, iteration bounds and failures from the course tutorial. Codex implemented
the agent from Mateo's direction; the page discloses that assistance. Manual
controls work on the published static site; the agent runs through the local
server in `weekly_builds/week01/server.py`. Final project ideas are not published
yet; do not invent them.

Sound is composed and played locally through the vendored Satie runtime. The
world keeps the scene contract Satie needs (stable room ids, metres, a listener,
signals, and events on entering a room) in `js/sound.js`; playback starts from a
user gesture and ducks while a page is open.
