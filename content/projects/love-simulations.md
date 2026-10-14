---
name: "LoveSims"
category: "generative agent simulation framework for relationship development"
group: "projects"
tags: [agents, games]
order: 4
year: "2024–"
role: "created with Xuyang Zhu, Xingyi Zhang, and Andrew Park"
image: "/projects/love-simulations.png"
video: "https://vimeo.com/1035385847"
paper: "https://dl.acm.org/doi/full/10.1145/3706599.3720011"
demo: "/lovesims"
---

A simulation tool for exploring how people think, feel, and adapt within everyday relationship scenarios. Rather than optimizing for perfect matches, LoveSims uses simulated interactions and structured self-reflection to help users examine their responses and perspectives. By modeling the complexity of real-life dynamics, we aim to support a deeper understanding of ourselves and our patterns of connection. The demo runs the 2026 engine: two invented people on a first date, and you guess how each line landed.

---

## notes

Created with Xuyang Zhu, Xingyi Zhang, and Andrew Park. Published at CHI;
the paper link above is the ACM DL full text (10.1145/3706599.3720011).
Inspired by Black Mirror's "Hang the DJ": agents with personalities and
relational preferences meet in test-date scenarios.

The 2024 build generated transcripts with GPT-based agents grounded in
interviews with 36 students. In 2026 Mateo rebuilt it as a typed date engine
(v2), which is what runs on this site at mateolarreaferro.com/lovesims:
affect as appraisal to PAD to mood gates, with attachment style biasing the
appraisal rather than the wording; a self-disclosure ladder (D0 to D4) whose
ceiling is set by perceived responsiveness, kept separate from actual
responsiveness so the gap between them is measurable; turn-taking by floor
bidding, so double turns, dead air and early exits can happen; scenes in
real Bay Area venues with budgeted interruptions; and computed process
metrics (language style matching, reciprocity, uptake, initiative, repair).
The one rule that shapes everything: it never emits a compatibility score,
because the best evidence (Joel, Eastwick and Finkel, 2017) says that kind
of relationship variance is not predictable from pre-meeting data.

Two surfaces on the site. "Play" is a game: you read each line and guess
whether the listener warmed, cooled or held steady, then their procedural
portrait changes and you find out; what is scored is your empathic accuracy,
never the couple. "Analyst view" shows the two-channel affect timeline,
the metrics, the moments with evidence, and shared ground with turn
citations. A date is around fifty model calls (Claude Opus 5 as the voice,
Haiku as the appraisal coder) and counts as one of a visitor's three free
uses. The twelve people in the demo are fictional, written for the site: the
interview corpus the research used is identifiable and was never consented
for product use, so it stays in the private repository.

Sits alongside [[icebreaker]] as social simulation with generative agents, and
feeds the thinking behind [[attractor-v1]].
