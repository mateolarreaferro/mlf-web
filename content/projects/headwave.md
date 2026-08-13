---
name: "HeadWave"
category: "human-in-the-loop interface for biofeedback art"
group: "tools for creativity"
tags: [neuro, tools for creativity, agents]
order: 14
repo: "https://github.com/mateolarreaferro/HeadWave"
image: "/projects/headwave.png"
---

HeadWave is a human-in-the-loop system for creating generative visuals driven by biosignals. It is a creativity-support tool that allows artists to prompt, patch, and modulate p5.js sketches using a node-based interface where EEG brain activity, face tracking, and hand tracking flow alongside AI-powered code generation.

A generative pipeline produces an initial visual sketch from a natural-language prompt, after which HeadWave exposes the sketch's parameters as patchable ports that can be wired to real-time biosignal streams, LFOs, and scaling nodes for continuous modulation.

By surfacing every generated parameter as an explicit, connectable control point, HeadWave keeps creators in direct command of what the AI produces and how the body shapes its output. This enables rapid iteration on complex brain-responsive scenes, fine-grained mapping between physiological state and visual behavior, and a tighter feedback loop between artistic intention and generative result.

---

## notes

The previous version of this file described HeadWave as "head-tracked
interaction for expressive audio control" — that was wrong. This is the copy
from the old site.

Interface affordances called out on the old site: branching in different
directions; iterating by using the previous generation as a starting point;
using EEG signal / CV / LFO to modulate the parameters of the sketch in real
time.

The existing image (/projects/headwave.png) predates this description — it may
show the wrong thing. The old site has three current screenshots.
