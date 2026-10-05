---
name: "Rats & Children"
category: "game of life sequencer"
group: "art"
tags: [music, instruments]
order: 23
year: "2024"
media:
  - { sketch: "rats-and-children" }  # the piece itself, playable (RatsAndChildren.tsx)
---

A sequencer driven by a game of life: the beings you bring into a breathing circle are born, meet, have children and die by a few simple rules, and each one sings while it lives, so the population is the score. As it grows, the crowd, the city and a beat arrive. Play it here, full screen if you like.

---

## notes

Made in fall 2024 for Artful Design (Stanford, Music 256A) in ChucK and
ChuGL (RatsAndChildren.ck). In October 2026 it was ported to run on this
site in the browser: WebGL2 for the picture and Web Audio for the sound,
with the same rules and the original samples (see CLAUDE.md, "Rats &
Children").

How it plays: a grey circle breathes inside a black one over about a
minute while the sky turns from white to black and back. Each press places
a being, red or yellow, with its own looping sample (normal, small or tiny
by its size). Beings that touch throw sparks and a collision sound; a red
and a yellow of the normal size make a small red one, and a small red
meeting a normal yellow makes a tiny one. Leaving the grey circle kills a
being, and a "natural disaster" (a black circle) falls every 10 to 20
seconds and kills what it covers. Beds come in with the population: people
at 5, meditation at 7, a beat at 10, the city at 15.

Mateo frames it as a Game of Life sequencer (the old site's title was
"Rats & Children: Game of Life Sequencer"): keep that framing. The rules
are its own rather than Conway's grid, but the idea is the same, a
population living and dying by simple rules is the score. The card
description is mine, written from the code; Mateo may still reword it.
