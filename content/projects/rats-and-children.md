---
name: "Rats & Children"
category: "audiovisual ecosystem"
group: "art"
tags: [music, instruments]
order: 23
year: "2024"
media:
  - { sketch: "rats-and-children" }  # the piece itself, playable (RatsAndChildren.tsx)
---

A small world that composes itself. Press and hold to bring beings into a breathing circle, red or yellow, each singing its own loop. When a red and a yellow meet they make a smaller child; whatever drifts outside the circle fades away, and every so often a black circle falls and takes what it covers. As the population grows, the city, the crowd and a beat come in. Play it here, full screen if you like.

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

NEEDS MATEO'S WORDS. The card description is mine, written from the code.
The old site listed it as "Rats & Children: Game of Life Sequencer", but the
ChucK piece is this ecosystem, not a Game of Life sequencer; worth
confirming the title and what the name means.
