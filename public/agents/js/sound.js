/*
  Sound, by Satie. This file is both halves: the scene contract Satie composes
  from, and the runtime that plays what it composed.

  Satie (satie.live/developers) authors a spatial sound scene over MCP and a
  small runtime plays the approved assets in the page. For that it needs to
  know what is in the world: stable ids, real positions in metres, which
  things make sound and which are silent decoration, what the listener walks
  on, and which moments are events. soundManifest() is that inventory, built
  from the same layout the world is built from, so it cannot drift.

  To hand it to Satie, open the site and run in the console:

      copy(JSON.stringify(agentsWorld.soundManifest(), null, 2))

  and give the result to satie_inspect_scene, then satie_brief.

  createSound(), at the bottom, is the runtime: it loads what Satie authored
  and plays it through Satie's maintained three.js adapter. start() is only
  ever called from a press, as browsers and Satie both require; update()
  publishes the listener and the depth signal every frame; event() fires the
  positional ones. To re-author: change BRIEF or the scene, export it, and run
  it back through satie_inspect_scene, satie_brief and satie_integrate.
*/

/* Satie host ids are letters, digits, _ and -. Ours are derived, so: one place. */
export const hostId = (stoneId) => {
  const bell = stoneId.match(/^attractor\.final\.(\d)$/);
  return bell ? `bell_voice_${bell[1]}` : stoneId.replace(/\./g, "_");
};

export const BRIEF = [
  "We are under water, inside one vast, slow creature: a jellyfish. Its bell, high up, is the destination; its tentacles hang down a column of rising current; soft pods spiral up around that column, one per week of a class. Everything is made of drifting shards of light, everything wobbles together, and the world forms around the listener as they approach and dissolves behind them. The sound should feel the same: submerged, weightless, organic, a little psychedelic, never mechanical. It should be a rich place: many distinct sounds, each quiet, each with its own spot, so that swimming anywhere is rewarded with something new to hear.",
  "The listener is first person and is swimming, fully submerged the whole time. There is no sky, no wind, no time of day, no air, no land, no people, no crowd, no birds, no insects, no footsteps and no room tone. Everything is heard through water: muffled highs, long dark tails, pressure in the low end. Nothing with a hard edge or a steady pulse.",
  "Beds. Deep water pressure and slow currents, enormous and distant, following the signal `ascent` (0 at the seabed, 1 at the bell): near the seabed dark, heavy and low; rising toward the bell it lightens, opens and gains a faint shimmer. A second bed of the seabed itself, sand grains sifting and settling over the dunes, only audible low down (`ascent` under about 0.2). A third, high bed near the bell: a faint glassy shimmer of light in water (`ascent` over about 0.7). A fourth for the far water: the signal `far` is 0 at the column and 1 at the edge of the world 33 m out, where the water is emptier, lower and lonelier, a hollow distant drone. All beds breathe together with the signal `swell` (0 to 1, one very slow irregular wave, the same one that wobbles everything you see): let it lean on volume or filter a little, so sound and picture undulate as one.",
  "Three more beds, asked for by name. A rain sound played at `pitch 0.5`: steady rain on the water's surface far above, heard from beneath and slowed to half speed, so it becomes a soft low granular hiss; it grows a little as `ascent` rises toward the bell. It is the one weather there is. An underwater ambience under everything: the library recording `community/deep-open-ocean-water-movement`. And a low drone: a deep sustained dark tone under the whole world, leaning gently on `swell`.",
  "Life, unplaced and occasional, each rare and never two at once: a far-off whale-like call; a second, higher and thinner call, like a question; a very low groan of the great creature's body flexing, felt more than heard; a school of something small passing overhead as a soft rushing swarm; a slow gust of current moving through; a cluster of tiny glassy chimes as shards of light let go and drift off, scattered loosely around the listener, soft as ice in water, never bright.",
  "`column` is a vertical column of bubbles rising continuously from the seabed to the bell, 21 m tall: an extended source, not a point. The creature's tentacles hang down it: give the column a second, slower layer, long strands dragging and brushing in the current.",
  "`attractor_week01` is the voice of the first pod: a strange attractor (a Lorenz orbit, two lobes the light keeps crossing between) hanging inside a breathing membrane. It should be a tonal, singing, slowly modulating source that beats gently between two close pitches, locatable by ear from anywhere in the water, with small bubbles climbing away from it. It is dulled and distant from outside its pod (beyond about 3 m) and full and close inside. `tendrils_week01` hangs just under that pod: fine tendrils trailing, a soft fibrous swish, close range only. `pod_week01` is the membrane itself: a slow, irregular breathing of skin, very quiet, heard only as you pass through it.",
  "`bell_voice_1`, `bell_voice_2` and `bell_voice_3` are three attractors inside the bell, 21 m up: three sung voices that belong together as one slow chord, audible faintly from the seabed as the place you are climbing toward, and enveloping once you are inside the bell. `bell_rim` is the frilled rim of the bell, a ring 11 m across: a slow rippling flutter travelling round it. `pod_final` is the bell's dome: the biggest, slowest breath in the world, a huge soft membrane filling and emptying, irregular, never a pulse.",
  "The hosts named `bud_week02` to `bud_week13` are the weeks that have not opened yet: small cool buds that cannot hold their shape, climbing the spiral one after another. Each is a faint sleeping murmur, breathy and unstable, a pitch that keeps slipping. Each bud sits a step higher in pitch than the one below it, so that climbing the spiral climbs a slow scale. They are heard only within about 6 m. Use few takes and the pitch property rather than a take per bud.",
  "`kelp_1` to `kelp_4` are the tallest kelp on the seabed, leaning in the current: long leaves rubbing and creaking softly, slow, wet, each a little different. `sign` is lettering hanging in the water near where you arrive: the faintest high glassy hum, only within a few metres.",
  "Moving is swimming: a soft rush of water that follows the listener's built-in speed, and settles a moment after they stop. The signal `vertical` runs from -1 (diving fast) to 1 (rising fast): rising adds a light stream of bubbles past the ears, diving a darker pressure closing in. The signal `warmth` is 0 far from any attractor and 1 right beside one: near the work the water itself warms, a soft harmonic glow under everything.",
  "Events. `pod_enter` (passing through a membrane into a pod: a soft swell), `pod_leave` (the same, falling), `bell_enter` (arriving inside the bell: a wide, slow bloom, the biggest moment in the piece, still gentle) and `bell_leave`. `bud_stir` (coming close to a sleeping bud: it stirs, a small breathy flutter, fired at the bud). `attractor_pass` (brushing right past an attractor: a brief bright-warm harmonic sweep, fired at it). `glide_start` (the listener is carried off along a curve: a drawn-in whoosh of water) and `glide_end` (set down again: the water settling). `sprint` (a burst of speed: a short push of water). `seabed_touch` (reaching the sand: a soft puff of sand lifting), `ceiling_touch` (reaching the top of the water: a soft pressure bump, like pressing on skin) and `edge_touch` (the far edge of the world: a low, hollow refusal). `page_open` (a bell struck under water, with a long tail), `page_close` (a small release of bubbles), `menu_open` and `menu_close` (a small pair: a droplet rising, a droplet falling), `sound_on` (the very first sound the visitor hears: the water arriving, a slow wash in). `ui_hover` and `ui_press` (tiny bubble blips, barely audible, non-spatial).",
  "One state: `reading`, while a page is open over the world. In it the whole scene ducks and dulls, as if heard from further under; leaving it, the scene opens back up. To get that, gate every continuous and occasional voice, the attractor voices included, with the non-strict zone `water` (a name no state ever takes), so that entering `reading` muffles them all. Do not put `zone reading` on a voice that should duck: a voice gated `zone reading` plays untouched while reading. Only `page_open` belongs to `reading`.",
  "What must stay audible and is protected: the attractor voices, always, above the beds. There are many sources but they are spread over a 66 m wide, 25 m tall world and most are short range, so keep what is audible at any one place to about ten voices and let distance do the rest. Nothing harsh, nothing bright, nothing rhythmic.",
  "Integration notes from the browser review: normalized listener height is `ascent`; do not use `depth`, which Satie overwrites with its own water-depth measurement. Positional one-shot events are already proximity-gated by the page. Do not put `within` on those global event voices: Satie applies that gate before moving a voice to the event, which silences events far from its initial position. Keep the three bell pitches fixed at 1, 1.2 and 1.5 rather than randomizing a pitch range, so they remain one chord. Keep the seven beds below the singing voices; the pressure layer should be around 42 to 44 dB per voice. Use constant filter cutoffs and `occlusion follow distance` for vocal muffling. Runtime 0.4.2 does not support `cutoff follow` and silently turns it into a 20 Hz low-pass, removing the vocals.",
].join(" ");

/* The four tallest kelp: the ones you would notice, so the ones with a voice. */
const tallKelp = (world) => [...world.kelp].sort((a, b) => b.tall - a.tall).slice(0, 4);

/* The scene, in the shape Satie's tools take (satie.scene/v1 input). */
export function soundManifest(world) {
  const top = world.plan.bell.y;
  const open = world.rooms.filter((r) => r.open);
  const buds = world.rooms.filter((r) => !r.open);
  const bell = world.rooms.find((r) => r.final);
  const scene = {
    engine: "threejs",
    unitsPerMeter: 1,
    listener: "first_person",
    environment: {
      setting: "deep under water, inside one vast slow jellyfish made of drifting light",
      ground: "water",
      enclosure: "open water, 33 m out from a central column, sand dunes below, a bell at 21 m. No walls, surface or air.",
      notes: "Threejs frame, +Y up, camera looks down -Z, metres. The listener swims freely in three dimensions. Pods are permeable membranes, not walls: nothing occludes.",
    },
    objects: [
      {
        id: "column", label: "rising bubble column", material: "water", motion: "static", occludes: false,
        position: [0, top / 2, 0], sizeM: [5, top, 5],
        notes: "an extended vertical source from the seabed (y 0) to the bell (y 21). Bound as a line.",
      },
      ...open.map((r) => ({
        id: `pod_${r.id}`, label: r.final ? "the bell of the jellyfish" : "pod membrane", material: "water", motion: "static", occludes: false,
        position: [r.center.x, r.center.y, r.center.z], sizeM: [r.r * 2, r.r * (r.final ? 1.3 : 2), r.r * 2],
        notes: `${r.label}: ${r.title}. A breathing, permeable membrane the listener swims through. Silent in itself; its voice is the attractor inside it.`,
      })),
      ...world.stones.map((st) => ({
        id: hostId(st.id), label: `strange attractor (${st.shape})`, material: "water", motion: "static", occludes: false,
        position: [st.x, st.y, st.z], sizeM: [st.radius * 2, st.radius * 2, st.radius * 2],
        notes: "a sounding object: an orbit of light turning slowly in place, shedding colour into the current, small bubbles climbing away from it",
      })),
      ...open.filter((r) => !r.final).map((r) => ({
        id: `tendrils_${r.id}`, label: "tendrils under a pod", material: "water", motion: "static", occludes: false,
        position: [r.center.x, Math.max(world.ground(r.center.x, r.center.z) + 0.5, r.center.y - r.r - 0.6), r.center.z], sizeM: [r.r * 1.4, 2.6, r.r * 1.4],
        notes: "eleven fine strands trailing beneath the pod, swaying from their roots",
      })),
      ...buds.map((r, i) => ({
        id: `bud_${r.id}`, label: "sleeping bud", material: "water", motion: "static", occludes: false,
        position: [r.center.x, r.center.y, r.center.z], sizeM: [r.r * 2, r.r * 2, r.r * 2],
        notes: `${r.label}, not open yet: a small cool bud that cannot hold its shape. Bud ${i + 1} of ${buds.length} going up the spiral, so step ${i + 1} of the scale.`,
      })),
      {
        id: "bell_rim", label: "frilled rim of the bell", material: "water", motion: "static", occludes: false,
        position: [bell.center.x, bell.center.y - bell.r * 0.27, bell.center.z], sizeM: [bell.r * 2, 0.6, bell.r * 2],
        notes: "a ring, not a point: nine frills round an 11 m circle, rippling",
      },
      ...tallKelp(world).map((k, i) => ({
        id: `kelp_${i + 1}`, label: "tall kelp", material: "kelp", motion: "static", occludes: false,
        position: [k.x, k.y + k.tall / 2, k.z], sizeM: [1, k.tall, 1],
        notes: `a strand ${k.tall.toFixed(1)} m tall rooted in the sand, leaning in the current`,
      })),
      {
        id: "sign", label: "lettering hanging in the water", material: "water", motion: "static", occludes: false,
        position: [world.sign.position.x, world.sign.position.y, world.sign.position.z], sizeM: [4.4, 1.5, 0.1],
        notes: "the title, near where you arrive; it surfaces as you come near and sinks as you leave",
      },
    ],
    signals: [
      { name: "ascent", unit: "0 at the seabed, 1 at the bell", min: 0, max: 1, description: "how high the listener has swum" },
      { name: "far", unit: "0 at the column, 1 at the edge of the world", min: 0, max: 1, description: "how far out the listener is, of 33 m" },
      { name: "vertical", unit: "-1 diving fast, 1 rising fast", min: -1, max: 1, description: "the listener's vertical speed, smoothed" },
      { name: "warmth", unit: "0 far from any attractor, 1 beside one", min: 0, max: 1, description: "nearness to the work" },
      { name: "swell", unit: "0 to 1", min: 0, max: 1, description: "one very slow irregular wave, the one the whole world wobbles on" },
    ],
    states: [{ name: "reading", description: "a page is open over the world: everything ducks and dulls" }],
    events: [
      { name: "pod_enter", description: "the listener passes through a membrane into a pod; fired at the pod's centre" },
      { name: "pod_leave", description: "the listener passes out of a pod; fired at the pod's centre" },
      { name: "bell_enter", description: "the listener arrives inside the bell; fired at the bell's centre" },
      { name: "bell_leave", description: "the listener leaves the bell; fired at the bell's centre" },
      { name: "bud_stir", description: "the listener comes close to a sleeping bud; fired at the bud" },
      { name: "attractor_pass", description: "the listener brushes right past an attractor; fired at it" },
      { name: "glide_start", description: "the listener is carried off along a curve (a teleport or a trip to a room); at the listener" },
      { name: "glide_end", description: "the glide sets the listener down; at the listener" },
      { name: "sprint", description: "a burst of speed begins; at the listener" },
      { name: "seabed_touch", description: "the listener reaches the sand; fired on the sand beneath them" },
      { name: "ceiling_touch", description: "the listener reaches the top of the water; fired just above them" },
      { name: "edge_touch", description: "the listener reaches the edge of the world, 33 m out; fired just beyond them" },
      { name: "page_open", description: "a page opens to be read; fired at the listener" },
      { name: "page_close", description: "the page closes; fired at the listener" },
      { name: "menu_open", description: "the rooms menu opens; non-spatial, at the listener" },
      { name: "menu_close", description: "the rooms menu closes; non-spatial, at the listener" },
      { name: "sound_on", description: "sound starts, on the visitor's first press; non-spatial, at the listener" },
      { name: "ui_hover", description: "pointer over an interface control; non-spatial, at the listener" },
      { name: "ui_press", description: "an interface control is pressed; non-spatial, at the listener" },
    ],
  };
  // to the centimetre: the contract is read by people too
  const cm = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(cm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cm(x)])) : v);
  return { brief: BRIEF, scene: cm(scene) };
}

/*
  The runtime. Satie authored the scene (satie/scene.satie and its samples,
  through the MCP tools, from the brief above); this plays it, with Satie's own
  maintained three.js adapter, vendored unmodified as vendor/satie-three.js.
  Playback needs no account and makes no calls to Satie.

  The site must never depend on it: if anything here fails to load, the world
  is silent and everything else works.
*/
const MUTE_KEY = "agents-sound-off";

export function createSound() {
  let audio = null; // the SatieScene, once loaded
  let world = null;
  let walker = null;
  let playing = false;
  let starting = false;
  let failed = false;
  let reading = false;
  let wanted = false; // a press has asked for sound, before or after loading
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
  const listeners = new Set();
  const levels = { 'audio.ambience': 1, 'audio.voices': 1, 'audio.drone': 1, 'audio.rain': 1 };
  const trims = new Map();
  const category = statement => {
    const id = statement.sourceId ?? '';
    if (id === 'deep_body_drone') return 'audio.drone';
    if (id === 'submerged_surface_rain') return 'audio.rain';
    if (id === 'week01_singing' || id.startsWith('bell_singer_')) return 'audio.voices';
    return 'audio.ambience';
  };
  // A separate gain stage preserves Satie's existing distance, swell, SPL,
  // fades and reverb routing. The vendored runtime itself stays untouched.
  function updateTrims() {
    if (!audio) return;
    const engine = audio.engine, now = engine.audioContext.currentTime;
    for (const [track, trim] of trims) {
      if (engine.tracks.get(track.key) !== track) { trim.node.disconnect(); trims.delete(track); }
    }
    for (const track of engine.tracks.values()) {
      let trim = trims.get(track);
      if (!trim) {
        const node = engine.audioContext.createGain();
        const group = category(track.statement);
        node.gain.value = levels[group];
        track.gainNode.disconnect(track.scaleGain);
        track.gainNode.connect(node); node.connect(track.scaleGain);
        trim = { node, group, target: levels[group] }; trims.set(track, trim);
      }
      if (trim.target !== levels[trim.group]) {
        trim.target = levels[trim.group];
        trim.node.gain.setTargetAtTime(trim.target, now, 0.04);
      }
    }
  }
  function setControl(id, value) {
    if (!(id in levels)) throw new Error(`Unknown audio control: ${id}`);
    levels[id] = value; updateTrims();
  }
  const here = { x: 0, y: 0, z: 0 };
  const tell = () => listeners.forEach((fn) => fn(state()));
  const state = () => (failed ? "unavailable" : muted ? "off" : starting ? "starting" : playing && audio?.engine.audioContext.state === "running" ? "on" : audio ? "ready" : "loading");

  // What the installed contract declares. The inventory above can run ahead
  // of the last composition (a week opens, a host is added); anything Satie
  // has not been told about yet is skipped, never an error.
  const declared = { events: new Set(), signals: new Set() };

  async function attach(w, by) {
    world = w;
    walker = by;
    try {
      const THREE = await import("../vendor/three.module.min.js");
      const { SatieScene } = await import("../vendor/satie-three.js");
      const response = await fetch("satie/scene.contract.json");
      if (!response.ok) throw new Error(`Scene contract: ${response.status}`);
      const contract = await response.json();
      const mixResponse = await fetch("satie/mix.json");
      if (!mixResponse.ok) throw new Error(`Scene mix: ${mixResponse.status}`);
      const mix = await mixResponse.json();
      const scene = new SatieScene({ contract, seed: 7, levelAnchorDb: mix.levelAnchorDb });
      await scene.load(
        new URL("satie/scene.satie", document.baseURI).href,
        new URL("satie/samples.json", document.baseURI).href,
      );
      for (const e of contract.scene.events ?? []) declared.events.add(e.name);
      for (const g of contract.scene.signals ?? []) declared.signals.add(g.name);

      // Bind every host in the contract to something that is where it says it
      // is. The attractors are the real turning Points and the sign is the
      // real lettering; the column is a line from the seabed to the bell;
      // everything else is a marker at the place the inventory gave.
      const mark = ([x, y, z]) => {
        const o = new THREE.Object3D();
        o.position.set(x, y, z);
        world.scene.add(o);
        return o;
      };
      const real = new Map(world.stones.map((st) => [hostId(st.id), st.points]));
      real.set("sign", world.sign);
      const top = world.plan.bell.y;
      for (const host of contract.scene.objects ?? []) {
        if (host.id === "column") scene.bindLine("column", mark([0, 0, 0]), [[0, 0, 0], [0, top, 0]], 5);
        else scene.bind(host.id, real.get(host.id) ?? mark(host.position));
      }

      audio = scene;
      // The browser can suspend or interrupt a live scene (for example when
      // changing audio devices). Reflect that in the button, and let the next
      // gesture resume the same scene without resetting its voices.
      audio.engine.audioContext.addEventListener("statechange", () => {
        tell();
        // Satie's field-study wrapper retries transport when a context returns
        // to running but the scene itself is no longer playing.
        if (audio.engine.audioContext.state === "running" && wanted && !muted && !audio.engine.isPlaying) start();
      });
      audio.state(reading ? "reading" : null);
      tell();
      if (wanted && !muted) start(); // works if the press is recent enough; if not, the next press does it
    } catch (err) {
      failed = true;
      tell();
      console.warn("sound: the world stays silent.", err);
    }
  }

  /* A gesture requests playback; attach can finish that request after loading. */
  let greeted = false;
  function start() {
    wanted = true;
    if (muted || !audio || starting || audio.engine.audioContext.state === "running" && audio.engine.isPlaying) return;
    // Satie's browser integration resumes synchronously on the gesture, then
    // starts the already-loaded scene. Calling start before load completes is
    // unreliable in Brave and Safari and can produce a brief one-shot then silence.
    void audio.engine.audioContext.resume().catch(() => {});
    starting = true;
    tell();
    audio.start().then(() => {
      starting = false;
      if (muted) { audio.stop(); tell(); return; }
      playing = audio.engine.isPlaying;
      audio.state(reading ? "reading" : null);
      tell();
      if (!greeted) fire("sound_on", here);
      greeted = true;
    }, (err) => {
      playing = false;
      starting = false;
      console.warn("sound: could not start.", err);
      tell();
    });
  }

  function toggle() {
    muted = !muted;
    try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch {}
    if (muted && playing) {
      audio.stop();
      playing = false;
    } else if (!muted) {
      start();
    }
    tell();
  }

  const fire = (name, at) => {
    if (!audio || !playing || !declared.events.has(name)) return;
    try { audio.event(name, at); } catch (err) { console.warn("sound:", err); }
  };
  const signal = (name, v) => declared.signals.has(name) && audio?.signal(name, v);

  // Edges: each of these fires once on the way in, and arms again on the way out.
  const latched = new Set();
  function edge(key, inside, outside, then) {
    if (latched.has(key)) { if (outside) latched.delete(key); }
    else if (inside) { latched.add(key); then(); }
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let lastY = null;
  let vertical = 0;
  let carried = false;

  function update(camera, dt = 0) {
    if (!audio) return;
    try {
      audio.update(camera); // the camera is the listener; hosts are read from what they are bound to
      updateTrims();
      const { x, y, z } = camera.position;
      here.x = x; here.y = y; here.z = z;
      const top = world.plan.bell.y;
      const out = Math.hypot(x, z) / 33;

      signal("ascent", clamp((y - 1) / (top - 1), 0, 1));
      signal("far", clamp(out, 0, 1));
      // vertical speed against the fastest you can swim, eased so it never steps
      if (dt > 0 && lastY !== null) vertical += (clamp((y - lastY) / dt / 9.2, -1, 1) - vertical) * (1 - Math.exp(-dt * 3));
      lastY = y;
      signal("vertical", vertical);
      let nearest = Infinity;
      for (const st of world.stones) nearest = Math.min(nearest, Math.hypot(x - st.x, y - st.y, z - st.z));
      const w = clamp((10 - nearest) / 8.5, 0, 1);
      signal("warmth", w * w * (3 - 2 * w));
      // The exact wave that expands the membranes and bends the shared current.
      signal("swell", world.swell);

      if (!playing) return;
      const floor = world.ground(x, z);
      edge("seabed", y - floor < 0.75, y - floor > 1.6, () => fire("seabed_touch", { x, y: floor, z }));
      edge("ceiling", y > world.ceiling - 0.25, y < world.ceiling - 1.5, () => fire("ceiling_touch", { x, y: y + 0.5, z }));
      edge("edge", out > 0.985, out < 0.94, () => fire("edge_touch", { x: x * 1.03, y, z: z * 1.03 }));
      for (const r of world.rooms) {
        if (r.open) continue;
        const d = Math.hypot(x - r.center.x, y - r.center.y, z - r.center.z);
        edge(`bud.${r.id}`, d < r.r * 1.8, d > r.r * 3.2, () => fire("bud_stir", r.center));
      }
      for (const st of world.stones) {
        const d = Math.hypot(x - st.x, y - st.y, z - st.z);
        edge(st.id, d < st.radius * 1.6, d > st.radius * 3, () => fire("attractor_pass", st));
      }
      if (walker) {
        if (walker.carried !== carried) fire((carried = walker.carried) ? "glide_start" : "glide_end", here);
        edge("sprint", walker.sprinting, !walker.sprinting, () => fire("sprint", here));
      }
    } catch (err) {
      console.warn("sound: stopped.", err);
      audio?.dispose();
      audio = null;
      playing = false;
      failed = true;
      tell();
    }
  }

  /* The page's events, in the names the scene was composed with. */
  function event(name, id) {
    // Reading is page state, even when muted or still loading the samples.
    if (name === "page.open" || name === "page.close") {
      reading = name === "page.open";
      audio?.state(reading ? "reading" : null);
    }
    if (!audio || !playing || !audio.engine.isPlaying) return;
    const room = world.rooms.find((r) => r.id === id);
    const through = (kind) => (room?.final && declared.events.has(`bell_${kind}`) ? `bell_${kind}` : `pod_${kind}`);
    try {
      if (name === "room.enter" && room?.open) fire(through("enter"), room.center);
      else if (name === "room.leave" && room?.open) fire(through("leave"), room.center);
      else if (name === "page.open") fire("page_open", here);
      else if (name === "page.close") fire("page_close", here);
      else fire(name.replace(".", "_"), here); // ui.hover, ui.press, menu.open, menu.close
    } catch (err) {
      console.warn("sound:", err);
    }
  }

  return {
    attach, start, toggle, update, event, setControl,
    controlValues: () => ({ ...levels }),
    hasControl: id => !!audio?.engine.scriptStatements.some(statement => category(statement) === id),
    controlTelemetry: () => [...trims].map(([track, trim]) => ({ source: track.statement.sourceId, group: trim.group, gain: trim.node.gain.value })),
    get state() { return state(); },
    onChange(fn) { listeners.add(fn); fn(state()); },
    get scene() { return audio; },
  };
}
