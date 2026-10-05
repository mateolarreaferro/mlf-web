---
name: "SacredVis"
category: "audio visualizer"
group: "art"
tags: [music, visualization]
order: 27
year: "2024"
media:
  - { sketch: "sacredvis" }  # the piece itself, playable (SacredVis.tsx)
---

Sound drawn as a spiral: every frequency band from 20 Hz to 10 kHz is a point a little further out than the last, and as the sound gets louder the spiral folds into star shapes, blue at the low end to red at the top, while sparks orbit out from the loudest band. Play it with your microphone or a recording, full screen if you like.

---

## notes

Mateo's final project for Music 256A / CS 476 at Stanford, fall 2024, in
ChucK and ChuGL (SoundAndVision.ck, headed "SacredVis"; milestone.ck is the
earlier milestone version). Listed on the old site under Instrument
Prototyping as "SacredVis: Visualizer and Feedback". In October 2026 it was
ported to play in its card (see CLAUDE.md, "SacredVis").

The original listened to the computer's input and played it straight back
through a half-second echo and a reverb, which on speakers with a
microphone feeds back; on the site the microphone is only played back when
the visitor turns "listen back" on, and a recording from Rats & Children is
offered as the other source.

The card description is mine, written from the code; Mateo may reword it.
