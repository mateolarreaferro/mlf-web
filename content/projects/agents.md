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
This fall I am taking a class on agents at the MIT Media Lab, and this is where the work lives. Instead of a page of posts it is a small world under water, made of drifting shards of light: one vast jellyfish. The weeks are soft pods spiralling up a column of current, each holding a strange attractor, a different one every week, and the bell high above them is the final project. It forms around you as you swim and dissolves behind you. It starts with building an agent loop from scratch around a model that runs on my own laptop, and it will fill in as the term goes.
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

Week 1 (September 2026): start the documentation site, propose three final
project ideas (who each is for, what problem, how an agent augments cognition:
learning, reasoning, creativity, memory, socialization), and implement a minimal
agent loop from scratch with a locally run, downloaded LLM, no hosted APIs and
no agent frameworks. As of this writing the rooms hold placeholders; the content
is still to come. If asked about the final project, say the ideas are not
published yet rather than guessing.

Sound is composed and played locally through the vendored Satie runtime. The
world keeps the scene contract Satie needs (stable room ids, metres, a listener,
signals, and events on entering a room) in `js/sound.js`; playback starts from a
user gesture and ducks while a page is open.
