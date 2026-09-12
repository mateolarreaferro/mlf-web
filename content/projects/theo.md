---
name: "Theo"
category: "domain-specific language"
group: "experiments / tools"
order: 10
repo: "https://github.com/mateolarreaferro/Theo"
image: "/projects/theo-graph.png"
---
Theo is a thinking tool for writers. You describe what you want to say in a plain-text notation for the structure of an essay: its sections, claims, arguments, and references. The whole argument is laid out before a single sentence exists, and you decide what stays, what moves, and what gets cut. Only then does Theo render each section into prose. A set of cognitive agents, the Critic, the Oblique Strategist, and the Facilitator, reads the result and returns structured feedback. They never rewrite anything. The point is to keep the loop of action and reflection that writing is made of.

---

## notes

Repo: github.com/mateolarreaferro/Theo. The core is a Python library that parses
`.theo` files and renders each section with Claude; Theo Studio is the desktop
app around it, an Electron/React/Vite front end over a FastAPI backend.

The `.theo` format spells out a title, references, and then sections tagged with
a rhetoric mode and tone, holding claims, thesis/evidence/counter/synthesis
argument blocks, figures, and cross-references. Studio can go the other way too:
paste rough notes and it proposes structures as `.theo` skeletons, asking
clarifying questions first.

The three cognitive agents (Critic, Oblique Strategist, Facilitator) analyze and
provoke but never edit. Theo is the writing counterpart to the same argument
Satie makes about audio: keep a structural, editable layer between intention and
output. See also the thought "The Oracle and the Author".
