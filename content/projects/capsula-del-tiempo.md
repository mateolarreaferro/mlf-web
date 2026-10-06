---
name: "Cápsula del Tiempo"
category: "a yearly interview among friends"
group: "experiments / tools"
order: 26
tags: [agents, well-being]
year: "2025–"
isActive: true
demo: "/capsula"
media:
  - { clip: "/projects/capsula-demo.mp4" }
---

A time capsule for a group of close friends. Once a year each of them answers the same questions about who they are, what they love, what scares them and where they think they are going, and the capsule keeps every year side by side so they can read how they changed. They answer by talking with an interviewer agent that reads each question aloud and listens to the answer, or Mateo records the conversation and drops it in. Each capsule is private: a friend asks to read someone else's, and the owner decides. The demo is the door: only friends hold a password.

---

## notes

Cápsula del Tiempo started as a spreadsheet: fifty-eight questions in ten
sections (identity and values, passions, relationships, work and purpose,
growth, the present moment, the future, meaning, small confessions, and the
friend group itself), asked by Mateo in person and typed up, first in the
2025 round, then with recordings and transcripts in 2026.

It now lives on this site at mateolarreaferro.com/capsula. Each friend has a
username and password Mateo hands out. The interviewer agent (Claude) works
in two modes: guided, the spreadsheet's questions in order, or a
semi-structured conversation that asks follow-ups and can bring up what the
person said the previous year. Mateo can also drop a recording (transcribed
with Whisper), a transcript or a spreadsheet as an entry on a given date.
Either way Claude files the answers against the same question ids, so a
person can read one year or see each question answered across the years.

Privacy is the design constraint: every capsule is private, never visible
to the internet, and a friend can read someone else's only by asking, the
way you ask to follow a private account; the owner accepts or declines and
can take access back.
Everything is encrypted at rest. The agent never discusses anyone's answers;
it only knows the project exists.
