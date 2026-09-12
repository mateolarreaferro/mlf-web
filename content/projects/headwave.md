---
name: "HeadWave"
category: "human-in-the-loop interface for biofeedback art"
group: "experiments / tools"
tags: [neuro, tools for creativity, agents]
order: 18
repo: "https://github.com/mateolarreaferro/HeadWave"
image: "/projects/headwave-a.png"
---
HeadWave is a human-in-the-loop system for creating generative visuals driven by biosignals. Artists generate visual sketches with AI and then shape them through EEG, face tracking, hand tracking, and other real-time signals. A node-based interface exposes the parameters of the generated code as explicit controls that can be connected to biosignals, LFOs, and other transformations. Rather than treating the body as an input to a fixed system, HeadWave makes physiological activity part of the generative process itself, a continuous feedback loop between intention, computation, and embodied experience.

---

## notes

The previous version of this file described HeadWave as "head-tracked
interaction for expressive audio control", which was wrong. The description
above was rewritten by Mateo in Aug 2026, replacing the old site's copy.

Interface affordances called out on the old site: branching in different
directions; iterating by using the previous generation as a starting point;
using EEG signal / CV / LFO to modulate the parameters of the sketch in real
time.

Checked Aug 2026: /projects/headwave.png does match this description: it shows
the node interface with an EEG source, prompt→gen nodes and the generated
sketch's parameters exposed as sliders. The old site has two further screenshots
if a second panel slide is ever wanted.
