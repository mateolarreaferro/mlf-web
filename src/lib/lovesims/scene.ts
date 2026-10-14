/**
 * L5, Scene.
 *
 * A scene is not a prompt string. It carries affordances, sensory load, a time
 * budget, and a pool of budgeted interruptions. Events are the dramaturgy: the
 * check arriving, a drink spilling, the room getting loud enough that you have to
 * lean in. They are where diagnostic behaviour comes from, because an agreeable
 * model will not generate friction on its own.
 *
 * Places are real and carry a city, because that is what makes a bridge-to-real
 * suggestion groundable rather than generic.
 */

import type { Scene } from './types';

export const SCENES: Scene[] = [
  {
    id: 'coffee-rainy',
    name: 'Rainy afternoon coffee',
    place: 'Coupa Café, Ramona Street',
    city: 'Palo Alto, CA',
    affordances: ['order at the counter', 'share a pastry', 'move to a window seat', 'step outside', 'pay', 'leave'],
    sensory: { noise: 0.35, lighting: 'grey daylight, warm lamps', crowding: 0.5 },
    timeBudget: 60,
    description:
      'Mid-afternoon on a rainy Tuesday. Half the tables are taken by people working alone. Rain on the window; the espresso machine punctuates everything.',
    eventPool: [
      { id: 'spill', text: 'A barista knocks over a tray of cups behind the counter. The whole room turns.', arousal: 0.35, valence: 0 },
      { id: 'rain', text: 'The rain suddenly comes down hard enough to be loud against the glass.', arousal: 0.2, valence: 0.1 },
      { id: 'seat', text: 'The window seat opens up.', arousal: 0.1, valence: 0.15 },
      { id: 'close', text: 'A barista starts stacking chairs at the far end of the room.', arousal: 0.15, valence: -0.15 },
    ],
  },
  {
    id: 'jazz-bar',
    name: 'Jazz bar, late set',
    place: 'The Black Cat, Broadway',
    city: 'San Francisco, CA',
    affordances: ['order a drink', 'lean in to be heard', 'watch the set', 'step out for air', 'pay the tab', 'leave'],
    sensory: { noise: 0.8, lighting: 'low, red', crowding: 0.75 },
    timeBudget: 100,
    description:
      'A basement room, second set of the night. The trio is loud enough that you have to lean in and talk into the side of someone’s head. Two-drink minimum.',
    eventPool: [
      { id: 'solo', text: 'The pianist takes a long solo. Conversation is impossible for a minute; you both just listen.', arousal: 0.3, valence: 0.25 },
      { id: 'crowd', text: 'A group crowds in beside you, pushing you closer together.', arousal: 0.3, valence: 0.05 },
      { id: 'tab', text: 'The server sets the tab on the table without being asked.', arousal: 0.2, valence: -0.1 },
      { id: 'request', text: 'Someone at the bar shouts a request and the band ignores it. A few people laugh.', arousal: 0.15, valence: 0.15 },
    ],
  },
  {
    id: 'art-walk',
    name: 'Saturday gallery, then the street',
    place: 'Minnesota Street Project, Dogpatch',
    city: 'San Francisco, CA',
    affordances: ['read a wall label', 'walk to the next room', 'sit on the bench', 'step outside', 'get a coffee', 'leave'],
    sensory: { noise: 0.2, lighting: 'flat white gallery light', crowding: 0.4 },
    timeBudget: 75,
    description:
      'A Saturday opening in a converted warehouse. Quiet enough that you can hear your own footsteps, which makes silences load-bearing.',
    eventPool: [
      { id: 'piece', text: 'You both stop in front of the same piece without discussing it.', arousal: 0.15, valence: 0.3 },
      { id: 'artist', text: 'The artist is standing three feet away, clearly listening to what people say.', arousal: 0.3, valence: -0.05 },
      { id: 'known', text: 'Someone across the room waves at one of you.', arousal: 0.3, valence: -0.1 },
      { id: 'rain2', text: 'It has started raining outside; neither of you brought anything.', arousal: 0.2, valence: 0.1 },
    ],
  },
  {
    id: 'treehouse',
    name: 'Campus dinner, last day of the quarter',
    place: 'The Treehouse, Tresidder Union',
    city: 'Stanford, CA',
    affordances: ['order at the counter', 'find a table outside', 'share fries', 'walk toward the quad', 'pay', 'leave'],
    sensory: { noise: 0.55, lighting: 'evening, string lights', crowding: 0.65 },
    timeBudget: 80,
    description:
      'Last day of the fall quarter. Everyone is either leaving tomorrow or has already left. The patio is full of people saying goodbye to each other.',
    eventPool: [
      { id: 'friend', text: 'Someone one of you knows stops by the table for a minute, then leaves.', arousal: 0.3, valence: -0.05 },
      { id: 'cold', text: 'It gets cold enough that staying outside is a decision.', arousal: 0.2, valence: -0.1 },
      { id: 'quiet', text: 'The patio empties out. It is suddenly much quieter.', arousal: -0.1, valence: 0.2 },
      { id: 'close2', text: 'The counter closes. No more ordering.', arousal: 0.15, valence: -0.1 },
    ],
  },
];

export function getScene(id: string): Scene {
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) throw new Error(`unknown scene: ${id}`);
  return scene;
}

/**
 * mulberry32. Simulation randomness must be seeded and reproducible, a date you
 * cannot replay is a date you cannot rewind, and rewind is the product.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick the minutes at which scene events fire. Budgeted (2–3 per date) and
 * seeded, so the same date replays identically and the same event can be reused
 * as a controlled stimulus across pairs.
 */
export function scheduleEvents(scene: Scene, rng: () => number): { minute: number; spec: Scene['eventPool'][number] }[] {
  const count = 2 + (rng() < 0.5 ? 0 : 1);
  const pool = [...scene.eventPool];
  const scheduled: { minute: number; spec: Scene['eventPool'][number] }[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const [spec] = pool.splice(idx, 1);
    // Spread across the middle of the date; nothing in the first 8 minutes.
    const lo = 0.15 + (i / count) * 0.6;
    const minute = Math.round(scene.timeBudget * (lo + rng() * 0.15));
    scheduled.push({ minute, spec });
  }
  return scheduled.sort((a, b) => a.minute - b.minute);
}
