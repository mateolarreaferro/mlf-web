/*
  The world: one creature, under water, made of shards of light.

  There is no building and no straight line. A column of current rises from a
  seabed of low dunes. The weeks are soft pods, membranes that breathe,
  spiralling up around the column (layout() in rooms.js), so going up is how
  the term proceeds. High over everything is the bell of a vast jellyfish,
  which is the final project; its tentacles hang down the column past every
  week. Kelp leans in the current. In each pod that has opened hangs that
  week's object, a strange attractor drawn as its own orbit, warm; a week not
  yet assigned is a small cool bud that cannot hold its shape.

  An asymmetric translucent bell carries three broad, trailing folds of
  tissue. Light gathers on its lip and on the folds that face the current;
  the far skin is quiet. Small unfinished pods dissolve into the water.

  Everything wobbles, and wobbles together: the whole world is displaced by
  one slow, large noise, so forms undulate like jelly and never jitter.

  And it knows you are there.
    It forms around you. Far off, the world is loose drift and only the warm
      attractors hold, as beacons; within a few metres of you it condenses
      into membranes and dunes, and dissolves again behind you.
    Pods swell open as you come near them.
    You leave a wake. Shards are pushed aside along the path you have just
      swum, and the disturbance lingers and fades behind you.
    The water changes with your depth: near the bed it is dark and blue, and
      toward the bell it lightens and greens.

  Colour keeps one rule: the water and the creature are cool and only cool;
  warm belongs to the work (the attractors and water that has
  passed close to one). A shard that lets go deepens into the blue of the
  water; it does not go rainbow.

  Motion has causes: one flow field (a current winding up the column, a vortex
  about every attractor, and the curl of a quintic gradient noise, which is
  divergence-free and smooth, so nothing bunches and nothing kinks), seen as
  streamlines seeded in rings, like a smoke wire. Letting go comes in soft
  waves bent by the same noise.

  Shards are triangles of wildly different sizes: mostly dust, some large
  translucent slivers. All of it is one vertex shader with no state: a shard's
  place is a pure function of its home, its seed, the time, and you.
  Everything is placed by a seeded generator: the same world on every visit.
  No lights, no visible meshes. One mood: dark.
*/

import * as THREE from "../vendor/three.module.min.js";
import { COOL, DIM, WARM, ground, layout } from "./rooms.js";

export const DISPLAY = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
export const TEXT = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export const WATER = {
  ink: "#dbe6ea", faint: "#8a9ba3", // the page's lettering
  deep: "#232323", shallow: "#0a1e24", // the water, at the bed and toward the bell
  pointDeep: "#0433ff", pointShallow: "#bfe6d8", // the creature, likewise
  teal: "#43AA8B", blue: "#1f6a94", foam: "#eafcff",
};

const FOG_NEAR = 9;
const FOG_FAR = 18;
const MAX_STONES = 16;
const TRAIL = 6;

/* ---------- a repeatable random ---------- */

function seeded(name) {
  let h = 1779033703;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the one material everything is drawn with ---------- */

const VERT = /* glsl */ `
  attribute vec3 tint;
  attribute vec3 pivot;   // membranes: the centre they breathe about
  attribute float amt;    // how much of the tint, against the ink
  attribute float size;   // metres
  attribute float seed;
  attribute float alpha;
  attribute float loose;  // 0 stays home, 1 is carried all the way off
  attribute float reach;  // seconds of current it rides; strands: how far they sway
  attribute float lag;    // where along its line, orbit or strand this shard sits, 0..1
  attribute float rise;   // bubbles: metres per second, upward
  attribute float kind;   // 0 drift, 1 seabed, 2 streamline, 3 orbit, 4 strand, 5 membrane, 6 gill

  uniform float uTime, uScale, uMax, uFogNear, uFogFar, uSurface, uWobble, uSwell;
  uniform vec3 uInk, uTeal, uBlue, uFoam, uCam, uCurrent;
  uniform vec4 uStone[${MAX_STONES}];     // xyz, and the radius it stirs
  uniform vec3 uStoneTint[${MAX_STONES}];
  uniform int uStones;
  uniform vec4 uTrail[${TRAIL}];          // where you have just been, and how hard you passed
  varying vec3 vColor;
  varying float vAlpha;
  varying float vAngle;
  varying float vPx;

  // Value noise with analytic derivatives (Inigo Quilez), quintic, so its
  // gradient is smooth and the curl we take of it never kinks.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  vec4 noised(vec3 x) {
    vec3 i = floor(x);
    vec3 w = fract(x);
    vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
    vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
    float a = hash(i), b = hash(i + vec3(1, 0, 0)), c = hash(i + vec3(0, 1, 0)), d = hash(i + vec3(1, 1, 0));
    float e = hash(i + vec3(0, 0, 1)), f = hash(i + vec3(1, 0, 1)), g = hash(i + vec3(0, 1, 1)), h = hash(i + vec3(1, 1, 1));
    float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a;
    float k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + h;
    return vec4(
      k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z,
      du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y));
  }

  // the curl of a noise potential (a, b, 0): a smooth, divergence-free swirl
  vec3 swirl(vec3 q) {
    vec3 ga = noised(q).yzw;
    vec3 gb = noised(q + vec3(31.4, 17.7, 5.2)).yzw;
    return vec3(-gb.z, ga.z, gb.x - ga.y);
  }

  /*
    The water. It winds up around the column and rises; about every attractor
    a vortex turns it, leans it in and lifts it; and over both, the noise.
  */
  vec3 field(vec3 p, float t) {
    float r2 = dot(p.xz, p.xz);
    float near = exp(-r2 / 150.0);
    vec3 v = vec3(-p.z, 0.0, p.x) / (sqrt(r2) + 1.5) * (0.65 * near) + vec3(0.0, 0.2 + 0.3 * near, 0.0);
    v += uCurrent * (0.25 + 0.25 * near);
    v += swirl(p * 0.2 + vec3(0.0, t * 0.012, t * 0.02)) * 1.3;
    for (int i = 0; i < ${MAX_STONES}; i++) {
      if (i >= uStones) break;
      vec3 r = p - uStone[i].xyz;
      float d2 = dot(r.xz, r.xz);
      float g = exp(-d2 / (uStone[i].w * uStone[i].w)) * smoothstep(3.4, 1.2, abs(r.y));
      vec3 around = vec3(-r.z, 0.0, r.x) / (sqrt(d2) + 0.45);
      v = mix(v, v * 0.35, g);
      v += g * (around * 1.0 - vec3(r.x, 0.0, r.z) * 0.12 + vec3(0.0, 0.3, 0.0));
    }
    return v;
  }

  void main() {
    float t = uTime;
    vec3 home = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 p = home;
    float a = alpha;
    vec3 col = mix(uInk, tint, amt);
    float spin = 0.15;
    float isStream = step(1.5, kind) * step(kind, 2.5);
    float isOrbit = step(2.5, kind) * step(kind, 3.5);
    float isGill = step(5.5, kind);

    // how near you are: the world forms around you and lets go behind you
    float dc = distance(home, uCam);
    float form = smoothstep(19.0, 6.5, dc);

    if (isStream > 0.5) {
      // A streamline: every shard on it starts at the same seed and rides the
      // field for a different age, so together they draw the line and slide
      // along it. Midpoint steps, because the water turns.
      float u = fract(t * 0.02 + lag + seed);
      float h = u * reach / 11.0;
      for (int i = 0; i < 11; i++) {
        vec3 mid = p + field(p, t) * (h * 0.5);
        p += field(mid, t) * h;
        p.y = abs(p.y);
      }
      a *= pow(sin(3.14159 * u), 0.7);
      a *= 0.3 + 0.7 * smoothstep(0.25, 0.78, noised(p * 0.19 + vec3(0.0, -t * 0.06, 0.0)).x);
      col = mix(uTeal, uBlue, smoothstep(0.0, 0.8, u));
      float nearest = 1e4;
      vec3 warm = uInk;
      for (int i = 0; i < ${MAX_STONES}; i++) {
        if (i >= uStones) break;
        float d = distance(p, uStone[i].xyz);
        if (d < nearest) { nearest = d; warm = uStoneTint[i]; }
      }
      col = mix(col, warm, smoothstep(3.2, 0.7, nearest) * 0.9);  // water that has touched the work
      spin = 0.6;
    } else if (rise > 0.0) {
      p.y = mod(p.y + t * rise, uSurface);
      p.xz += uCurrent.xz * (0.15 + 0.025 * p.y);
      a *= smoothstep(0.0, 0.8, p.y) * (1.0 - smoothstep(uSurface - 3.0, uSurface, p.y));
    } else {
      // A membrane breathes about its centre, and swells open as you near it.
      if (kind > 4.5) {
        vec3 radial = home - pivot;
        float nearPod = smoothstep(11.0, 2.5, distance(pivot, uCam));
        float breath = 0.085 * (uSwell - 0.5);
        p += radial * (breath + 0.1 * nearPod);
        float contact = exp(-dot(home - uCam, home - uCam) / 10.0);
        p += normalize(radial + vec3(0.001)) * contact * 0.48;
        // Inside the skin, leave space for the orbit and its words.
        float inside = 1.0 - smoothstep(length(radial) * 0.75, length(radial) * 1.3, distance(pivot, uCam));
        a *= mix(1.0, 0.26, inside);
        // Irregular fronts of pressure reveal tissue as they pass. No
        // repeating light chase: neighboring folds see the same front.
        if (isGill > 0.5) {
          float pressure = noised(home * vec3(0.11, 0.19, 0.11) + vec3(0.0, t * 0.075, 3.1)).x;
          float revealed = smoothstep(0.34, 0.73, pressure);
          a *= 0.42 + revealed * 1.45 + contact * 0.5;
          col = mix(col, uFoam, revealed * 0.2);
          p.xz += uCurrent.xz * reach * lag * 0.45;
        } else {
          float grazing = 1.0 - abs(dot(normalize(radial + vec3(0.001)), normalize(uCam - home)));
          a *= 0.2 + 1.4 * grazing * grazing;
        }
      }
      // A strand (kelp, a tendril, a tentacle) sways from its root, more the
      // further along it you go, and every shard on it sways together.
      if (kind > 3.5 && kind < 4.5) {
        float l2 = lag * lag;
        vec3 drag = uCurrent + swirl(home * 0.12 + vec3(0.0, t * 0.025, 0.0)) * 0.35;
        p.xz += drag.xz * reach * l2;
      }

      // Letting go comes in soft waves, bent by the noise so they arrive like
      // weather; far from you, almost everything has already let go.
      float ph = noised(home * 0.14 + vec3(4.7, -t * 0.055, 1.9)).x;
      float L = mix(max(loose, 0.82), loose, max(max(form, isOrbit), isGill * 0.82));

      // your wake: where you have just been, the shards part and lift
      float stir = 0.0;
      for (int j = 0; j < ${TRAIL}; j++) {
        vec3 r = p - uTrail[j].xyz;
        float w = uTrail[j].w * exp(-dot(r, r) / 2.6);
        p += (normalize(r + vec3(0.0001)) * 0.7 + vec3(0.0, 0.3, 0.0)) * w;
        stir += w;
      }
      L = clamp(L + stir * 0.8, 0.0, 1.0);
      float leaves = smoothstep(0.05, 0.3, L);

      float g = smoothstep(0.42, 1.0, ph);
      float gone = g * g * (3.0 - 2.0 * g);
      float h = L * gone * reach / 4.0;
      // Attached folds travel only a tiny distance. One current sample is
      // sufficient there; loose shards still integrate the full curved path.
      if (isGill > 0.5) {
        p += field(p, t) * (h * 4.0);
        p.y = abs(p.y);
      } else {
        for (int i = 0; i < 4; i++) { p += field(p, t) * h; p.y = abs(p.y); }
      }

      float flash = exp(-pow((ph - 0.44) / 0.09, 2.0));
      a *= mix(1.0, smoothstep(0.0, 0.16, ph) * (1.0 - smoothstep(0.66, 0.99, ph)), leaves);
      a *= 1.0 + 0.7 * flash + 1.2 * min(stir, 1.0);
      col = mix(col, uBlue, gone * leaves * 0.85);
      col = mix(col, uFoam, min(0.65, flash * 0.25 + stir * 0.4));
      spin = 0.12 + 1.6 * gone * leaves + 2.0 * stir;

      if (kind > 0.5 && kind < 1.5) { // caustics: light from the surface, moving over the bed
        float c = noised(home * 0.35 + vec3(t * 0.025, 0.0, -t * 0.035)).x;
        a *= 0.22 + 0.75 * smoothstep(0.4, 0.8, c);
      }
      if (isOrbit > 0.5) {            // light runs along an attractor's orbit
        a *= 0.65 + 0.6 * noised(vec3(lag * 11.0, t * 0.13, 2.7)).x;
      }

      // And the whole world wobbles, together: one slow large noise moves
      // everything, so forms undulate like jelly and never jitter.
      vec3 wob = swirl(home * 0.11 + vec3(t * 0.05, t * 0.04, -t * 0.03));
      p += wob * uWobble * (kind > 0.5 && kind < 1.5 ? vec3(0.5, 0.35, 0.5) : vec3(1.0));
    }

    vec4 mv = viewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    gl_Position = projectionMatrix * mv;
    float s = size * uScale / max(d, 0.001);
    gl_PointSize = clamp(s, 1.5, uMax);
    vPx = 1.0 / gl_PointSize;
    vAngle = seed * 6.2832 + t * spin * (0.5 + seed);

    a *= clamp(s / 1.5, 0.3, 1.0);                     // sub-pixel shards fade, not stay
    a *= smoothstep(0.35, 1.2 + size * 9.0, d);        // nothing in your face, big ones least of all
    // The creature's cilia remain a faint silhouette through deeper water;
    // its loose skin and the surrounding snow disappear sooner.
    a *= 1.0 - smoothstep(uFogNear + isGill * 4.0, uFogFar + isGill * 9.0, d);
    vAlpha = a;
    vColor = col;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity, uBrightness;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vAngle;
  varying float vPx;

  // signed distance to an equilateral triangle (Inigo Quilez)
  float triangle(vec2 p, float r) {
    const float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }

  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vAngle), s = sin(vAngle);
    float d = triangle(vec2(c * q.x - s * q.y, s * q.x + c * q.y), 0.4);
    float a = clamp(0.5 - d / vPx, 0.0, 1.0) * vAlpha * uOpacity;  // one pixel of edge
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a * uBrightness, a);
  }
`;

const WHITE = new THREE.Color(1, 1, 1);
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const KIND = { drift: 0, bed: 1, stream: 2, orbit: 3, strand: 4, membrane: 5, gill: 6 };

/* A growing bag of shards that becomes one THREE.Points. */
function cloud() {
  const A = { position: [], tint: [], pivot: [], amt: [], size: [], seed: [], alpha: [], loose: [], reach: [], lag: [], rise: [], kind: [] };
  return {
    add(x, y, z, o, rnd) {
      A.position.push(x, y, z);
      const c = o.tint ?? WHITE;
      A.tint.push(c.r, c.g, c.b);
      const pv = o.pivot ?? [x, y, z];
      A.pivot.push(pv[0], pv[1], pv[2]);
      A.amt.push(o.tint ? (o.amt ?? 0.85) : 0);
      // Sizes are heavy-tailed: mostly dust, a few large slivers. The large
      // ones are faint, or a handful of them would wash out the rest.
      const big = o.fixed ? 1 : 0.35 + 9 * rnd() ** 5;
      A.size.push((o.size ?? 0.034) * big);
      A.alpha.push((o.alpha ?? 1) * (0.55 + rnd() * 0.45) / (o.fixed ? 1 : Math.max(1, big * 0.7) ** 1.15));
      A.seed.push(o.seed ?? rnd());
      A.loose.push(o.loose ?? 0.1);
      A.reach.push(o.reach ?? 1.4 + rnd() * 2.6);
      A.lag.push(o.lag ?? 0);
      A.rise.push(o.rise ?? 0);
      A.kind.push(o.kind ?? 0);
    },
    get count() { return A.seed.length; },
    build(material) {
      const g = new THREE.BufferGeometry();
      for (const [name, values] of Object.entries(A)) {
        g.setAttribute(name, new THREE.Float32BufferAttribute(values, ["position", "tint", "pivot"].includes(name) ? 3 : 1));
      }
      const points = new THREE.Points(g, material);
      points.frustumCulled = false; // the shader moves them; their box means nothing
      return points;
    },
  };
}

/* ---------- strange attractors: the week's objects ---------- */

const ATTRACTORS = [
  { name: "lorenz", dt: 0.006, at: [0.1, 0, 0], up: "z", f: (x, y, z) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z] },
  { name: "aizawa", dt: 0.012, at: [0.1, 0, 0], up: "z",
    f: (x, y, z) => [(z - 0.7) * x - 3.5 * y, 3.5 * x + (z - 0.7) * y, 0.6 + 0.95 * z - z ** 3 / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x ** 3] },
  { name: "thomas", dt: 0.07, at: [1.1, 1.1, -0.01], up: "y",
    f: (x, y, z) => [Math.sin(y) - 0.208186 * x, Math.sin(z) - 0.208186 * y, Math.sin(x) - 0.208186 * z] },
  { name: "halvorsen", dt: 0.005, at: [-1.48, -1.51, 2.04], up: "y",
    f: (x, y, z) => [-1.89 * x - 4 * y - 4 * z - y * y, -1.89 * y - 4 * z - 4 * x - z * z, -1.89 * z - 4 * x - 4 * y - x * x] },
  { name: "rossler", dt: 0.02, at: [1, 1, 0], up: "z", f: (x, y, z) => [-y - z, x + 0.2 * y, 0.2 + z * (x - 5.7)] },
  { name: "dadras", dt: 0.01, at: [1.1, 2.1, -2], up: "z",
    f: (x, y, z) => [y - 3 * x + 2.7 * y * z, 1.7 * y - x * z + z, 2 * x * y - 9 * z] },
];

/* n points along the orbit of attractor `which`, centred, fitted to radius 1. */
function orbit(which, n) {
  const A = ATTRACTORS[which % ATTRACTORS.length];
  let [x, y, z] = A.at;
  const rk4 = () => {
    const h = A.dt;
    const k1 = A.f(x, y, z);
    const k2 = A.f(x + (h / 2) * k1[0], y + (h / 2) * k1[1], z + (h / 2) * k1[2]);
    const k3 = A.f(x + (h / 2) * k2[0], y + (h / 2) * k2[1], z + (h / 2) * k2[2]);
    const k4 = A.f(x + h * k3[0], y + h * k3[1], z + h * k3[2]);
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  };
  for (let i = 0; i < 1500; i++) rk4(); // let it fall onto the attractor first
  const pts = [];
  for (let i = 0; i < n; i++) {
    rk4();
    rk4();
    pts.push(A.up === "z" ? [x, z, y] : [x, y, z]);
  }
  const mean = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / n);
  let far = 0;
  for (const p of pts) {
    for (let k = 0; k < 3; k++) p[k] -= mean[k];
    far = Math.max(far, Math.hypot(p[0], p[1], p[2]));
  }
  for (const p of pts) for (let k = 0; k < 3; k++) p[k] /= far;
  return pts;
}

export function buildWorld({ density = 1 } = {}) {
  const plan = layout();
  const SURFACE = plan.bell.y + 8;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WATER.deep);
  scene.fog = new THREE.Fog(WATER.deep, FOG_NEAR, FOG_FAR); // for the lettering

  const uniforms = {
    uTime: { value: 0 }, uScale: { value: 700 }, uMax: { value: 80 },
    uOpacity: { value: 0.95 }, uSurface: { value: SURFACE }, uWobble: { value: 0.5 },
    uSwell: { value: 0.5 }, uBrightness: { value: 1.8 },
    uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR },
    uInk: { value: new THREE.Color(WATER.pointDeep) }, uTeal: { value: new THREE.Color(WATER.teal) },
    uBlue: { value: new THREE.Color(WATER.blue) }, uFoam: { value: new THREE.Color(WATER.foam) },
    uCam: { value: new THREE.Vector3() },
    uCurrent: { value: new THREE.Vector3() },
    uStone: { value: Array.from({ length: MAX_STONES }, () => new THREE.Vector4(0, 0, 0, 1)) },
    uStoneTint: { value: Array.from({ length: MAX_STONES }, () => new THREE.Color(0, 0, 0)) },
    uStones: { value: 0 },
    uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4(0, -99, 0, 0)) },
  };
  const glow = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, // light adds to light
  });

  const clickable = [];
  const floors = [];
  const stones = [];
  const labels = [];
  const lettering = [];
  const birds = [];

  const N = (n) => Math.max(1, Math.round(n * density));
  const main = cloud();
  const teal = new THREE.Color(WATER.teal);
  const ciliary = new THREE.Color("#84ded0");
  const cools = COOL.map((hex) => new THREE.Color(hex));

  /* ---------- ways of laying shards down ---------- */

  /* A unit vector, uniform over the sphere. */
  function direction(rnd) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const q = Math.sqrt(1 - u * u);
    return [q * Math.cos(t), u, q * Math.sin(t)];
  }

  /* A few slow waves over a sphere: what makes a membrane a body and not a ball. */
  function lumps(rnd, n = 4) {
    const waves = Array.from({ length: n }, () => ({ d: direction(rnd), f: 1.5 + rnd() * 3, p: rnd() * 6.28, w: 0.05 + rnd() * 0.1 }));
    return (d) => waves.reduce((s, w) => s + w.w * Math.sin((d[0] * w.d[0] + d[1] * w.d[1] + d[2] * w.d[2]) * w.f + w.p), 1);
  }

  /*
    A membrane: shards on a lumpy sphere about `c`. `keep(d)` says how much of
    the skin there is in direction d (so a pod has a mouth, a bell has no
    underside). It breathes about its centre, in the shader.
  */
  function membrane(rnd, c, r, count, o, keep = () => 1) {
    const shape = lumps(rnd);
    for (let i = 0; i < N(count); i++) {
      const d = direction(rnd);
      if (rnd() > keep(d)) continue;
      const rr = r * shape(d) * (1 - rnd() * rnd() * 0.06);
      main.add(c.x + d[0] * rr, c.y + d[1] * rr, c.z + d[2] * rr, { kind: KIND.membrane, pivot: [c.x, c.y, c.z], ...o }, rnd);
    }
  }

  // Ciliary ribs follow a body's curved skin. Three close traces make each
  // rib a fine luminous fold, with gaps through which its interior can be seen.
  // The shell is ordered, but its twisting meridians never form a wire grid.
  function ribs(rnd, c, r, { dome = false, count = 18, alpha = 0.7 } = {}) {
    const steps = N(dome ? 230 : 150);
    for (let rib = 0; rib < count; rib++) {
      const azimuth = rib / count * Math.PI * 2;
      for (let trace = -1; trace <= 1; trace++) {
        for (let k = 0; k < steps; k++) {
          const u = k / (steps - 1);
          const polar = 0.12 + u * (dome ? 1.64 : 2.9);
          const a = azimuth + 0.17 * Math.sin(polar * 2.7 + azimuth * 2) + trace * 0.009;
          const rr = r * (1 + 0.045 * Math.sin(polar * 7 + azimuth * 3));
          const x = Math.cos(a) * Math.sin(polar) * rr;
          const z = Math.sin(a) * Math.sin(polar) * rr;
          main.add(c.x + x, c.y + Math.cos(polar) * rr, c.z + z, {
            kind: KIND.gill, pivot: [c.x, c.y, c.z], lag: u,
            tint: rib % 3 === 0 ? cools[2] : ciliary, amt: 0.86,
            fixed: true, size: trace === 0 ? 0.025 : 0.017,
            alpha: alpha * (trace === 0 ? 1 : 0.32) * Math.sin(polar) ** 0.4,
            loose: 0.025, reach: 0.45,
          }, rnd);
        }
      }
    }
  }

  // Three oral arms descend from the bell as broad, authored tissue folds.
  // Their different spans and turns keep the silhouette legible without a
  // clockwork ring of identical repetitions.
  function gills(rnd, c, r) {
    const steps = N(330);
    const across = 17;
    const arms = [
      { phase: 0.18, span: 1.00, width: 1.00, twist: 2.55, lean: 0.22 },
      { phase: 2.27, span: 0.82, width: 0.76, twist: 3.15, lean: -0.34 },
      { phase: 4.48, span: 1.14, width: 0.88, twist: 2.18, lean: 0.42 },
    ];
    for (const arm of arms) {
      const phase = arm.phase;
      for (let k = 0; k < steps; k++) {
        const u = k / (steps - 1);
        const drop = u * arm.span;
        const y = c.y - r * 0.2 - drop * (c.y - 2.0);
        const angle = phase + u * arm.twist + arm.lean * u * u + 0.16 * Math.sin(u * 4.7 + phase * 1.3);
        const radius = 1.05 + 1.85 * Math.sin(u * Math.PI * 0.78) + 0.22 * Math.sin(u * 5.3 + phase);
        const width = arm.width * (0.28 + 0.92 * Math.sin(u * Math.PI) ** 0.72) * (1 + 0.12 * Math.sin(u * 6.1 + phase));
        for (let j = 0; j < across; j++) {
          const v = j / (across - 1) * 2 - 1;
          const edge = j === 0 || j === across - 1;
          const fold = (0.72 * Math.sin(v * Math.PI * 1.15 + u * 5.2 + phase) + 0.28 * Math.sin(v * Math.PI * 3.1 - u * 2.7)) * width * 0.23;
          const curl = Math.sin(u * 3.8 + v * 1.7 + phase) * 0.11 * (1 - u * 0.35);
          main.add(
            c.x + Math.cos(angle) * (radius + fold) - Math.sin(angle) * v * width + curl,
            y + Math.sin(v * Math.PI + u * 4.2 + phase) * width * 0.18,
            c.z + Math.sin(angle) * (radius + fold) + Math.cos(angle) * v * width - curl * 0.7,
            { kind: KIND.gill, pivot: [c.x, c.y, c.z], lag: u,
              tint: edge ? ciliary : teal, amt: 0.9, fixed: true,
              size: edge ? 0.044 : 0.024, alpha: (edge ? 1.25 : 0.32) * (1 - u * 0.52),
              loose: 0.035, reach: 0.9 + u * 1.7 }, rnd,
          );
        }
      }
    }
  }

  /*
    A strand: kelp up from the bed, a tendril under a pod, a tentacle down the
    column. It wanders as it goes, and sways from its root in the shader;
    every shard on it shares a seed so it sways as one thing.
  */
  function strand(rnd, root, length, dir, sway, count, o) {
    const seed = rnd();
    const w1 = rnd() * 6.28, w2 = rnd() * 6.28, amp = 0.15 + rnd() * 0.35;
    const n = Math.max(8, Math.round(count * Math.min(1, density)));
    for (let k = 0; k < n; k++) {
      const l = k / (n - 1);
      const s = l * length;
      main.add(
        root.x + Math.sin(s * 0.55 + w1) * amp * s * 0.35 + (rnd() - 0.5) * 0.05,
        root.y + dir * s,
        root.z + Math.cos(s * 0.47 + w2) * amp * s * 0.35 + (rnd() - 0.5) * 0.05,
        { kind: KIND.strand, seed, lag: l, reach: sway, alpha: (o.alpha ?? 0.8) * (1 - l * 0.55), ...o, loose: 0.04 + l * l * 0.5 }, rnd,
      );
    }
  }

  /* The week's object: a strange attractor, drawn as its own orbit, turning. */
  function attractor(id, which, c, radius, color) {
    const rnd = seeded(`attractor.${id}`);
    const bag = cloud();
    const pts = orbit(which, N(11000));
    pts.forEach((p, i) => {
      const shedding = rnd() < 0.22;
      bag.add(p[0] * radius, p[1] * radius, p[2] * radius, {
        kind: KIND.orbit, fixed: true, lag: i / pts.length, tint: color, amt: 0.95,
        size: 0.012 + 0.023 * rnd() ** 3, alpha: 0.14, // preserve the orbit's lines instead of burning them white
        loose: shedding ? 0.9 : 0.03, reach: 3 + rnd() * 5,
      }, rnd);
    });
    const points = bag.build(glow);
    points.position.set(c.x, c.y, c.z);
    points.userData = { y: c.y, turn: 0.07 + rnd() * 0.05, phase: rnd() * 6.28 };
    scene.add(points);

    for (let i = 0; i < N(380); i++) { // bubbles climb away from it
      const a = rnd() * 6.28;
      const rr = Math.sqrt(rnd()) * radius * 0.8;
      main.add(c.x + Math.cos(a) * rr, rnd() * SURFACE, c.z + Math.sin(a) * rr,
        { tint: color, amt: 0.45, size: 0.02, alpha: 0.3, loose: 0, rise: 0.22 + rnd() * 0.5 }, rnd);
    }
    stones.push({ id: `attractor.${id}`, shape: ATTRACTORS[which % ATTRACTORS.length].name, points, x: c.x, y: c.y, z: c.z, radius, color: `#${color.getHexString()}` });
  }

  /*
    Lettering that hangs in the water and turns to face you. Each piece
    surfaces as you come near it (fully there inside `near` metres, gone
    beyond `far`) and sinks again as you leave.
  */
  function label(wm, hm, draw, near = 8, far = 17) {
    const px = 256;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(wm * px);
    canvas.height = Math.round(hm * px);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(wm, hm),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
    );
    mesh.renderOrder = 2; // over the glow, so words stay legible
    mesh.userData.fade = [near, far];
    lettering.push(mesh);
    scene.add(mesh);
    labels.push(() => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.shadowColor = WATER.deep;
      ctx.shadowBlur = 9;
      draw(ctx, canvas.width, canvas.height, WATER);
      texture.needsUpdate = true;
    });
    return mesh;
  }

  const type = (ctx, family, size, style = "") => {
    ctx.font = `${style} 400 ${size}px ${family}`;
    ctx.textBaseline = "alphabetic";
  };

  /* The pod's words. Centred, so they read from any side once they face you. */
  function board(room, wm, hm) {
    const mesh = label(wm, hm, (ctx, w, h, p) => {
      ctx.textAlign = "center";
      const tone = room.final ? p.ink : `#${new THREE.Color(room.color).lerp(WHITE, 0.25).getHexString()}`;
      ctx.fillStyle = room.open ? tone : p.faint;
      type(ctx, TEXT, h * 0.085);
      ctx.fillText(room.label, w / 2, h * 0.17);
      ctx.fillStyle = room.open ? p.ink : p.faint;
      type(ctx, DISPLAY, h * (room.open ? 0.2 : 0.24), room.open ? "" : "italic");
      wrap(ctx, room.open ? room.title : "not yet", w / 2, h * (room.open ? 0.45 : 0.55), w, h * 0.21);
      ctx.fillStyle = p.faint;
      type(ctx, TEXT, h * 0.075);
      if (room.open) ctx.fillText("press to read", w / 2, h * 0.95);
      ctx.textAlign = "left";
    }, ...(room.final ? [10, 18] : room.open ? [12, 22] : [5.5, 9]));
    mesh.userData.roomId = room.id;
    mesh.position.set(room.board.x, room.board.y, room.board.z);
    clickable.push(mesh);
    return mesh;
  }

  /* ---------- the seabed ---------- */
  const kelp = [];
  {
    const rnd = seeded("bed");
    // Contours, like the rings a rake leaves round a rock, except that they
    // follow the dunes and nothing about them is round.
    for (let r = 1.2; r < DIM.world + 4; r += 0.34 + r * 0.012) {
      const wob1 = rnd() * 6.28, wob2 = rnd() * 6.28;
      const n = Math.round(((2 * Math.PI * r) / 0.1) * density);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r + 0.5 * Math.sin(a * 3 + wob1) + 0.3 * Math.sin(a * 7 + wob2) + (rnd() - 0.5) * 0.05;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const lifting = rnd() < 0.1;
        main.add(x, ground(x, z), z, {
          kind: KIND.bed, size: 0.023, alpha: 0.7 * Math.max(0.15, 1 - r / (DIM.world + 4)),
          loose: lifting ? 0.9 : 0.04, reach: lifting ? 2 + rnd() * 3 : 0.5,
        }, rnd);
      }
    }
    // kelp, leaning in the current, thicker away from the column
    for (let i = 0; i < 95; i++) {
      const a = rnd() * 6.28;
      const r = 5 + Math.sqrt(rnd()) * (DIM.world - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const tall = 2.5 + rnd() * rnd() * 11;
      kelp.push({ x, y: ground(x, z), z, tall }); // sound.js gives the tallest a voice
      strand(rnd, { x, y: ground(x, z), z }, tall, 1, 0.5 + tall * 0.13, tall * 55,
        { tint: cools[i % 3], amt: 0.8, size: 0.04, alpha: 0.7 });
    }
  }

  const bed = new THREE.Mesh(new THREE.PlaneGeometry(DIM.world * 2.4, DIM.world * 2.4), HIDDEN);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.3;
  scene.add(bed);
  floors.push(bed);

  const sign = label(4.4, 1.5, (ctx, w, h, p) => {
    ctx.textAlign = "center";
    ctx.fillStyle = p.ink;
    type(ctx, DISPLAY, h * 0.36, "italic");
    ctx.fillText("agents", w / 2, h * 0.4);
    ctx.fillStyle = p.faint;
    type(ctx, TEXT, h * 0.105);
    ctx.fillText("mateo larrea ferro · mit media lab · 2026", w / 2, h * 0.68);
    ctx.fillText("every pod is a week. follow the current up.", w / 2, h * 0.88);
    ctx.textAlign = "left";
  }, 17, 25);
  sign.position.set(-3.6, 5.8, 9.5);

  // Small aquatic birds: translucent manta-like silhouettes that bank through
  // the water on independent paths, giving the scene a living counter-rhythm.
  {
    const rnd = seeded('aquatic-birds');
    const wingGeometry = new THREE.BufferGeometry();
    wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -0.95, 0.05, -0.22, -0.28, 0.02, 0.12,
      0, 0, 0, 0.95, 0.05, -0.22, 0.28, 0.02, 0.12,
    ], 3));
    for (let i = 0; i < 6; i++) {
      const bird = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 5), new THREE.MeshBasicMaterial({ color: '#bfe6d8', transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }));
      const wings = new THREE.Mesh(wingGeometry, new THREE.MeshBasicMaterial({ color: i % 2 ? '#7ab7d4' : '#dbe6ea', transparent: true, opacity: 0.42, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      bird.add(body, wings);
      bird.scale.setScalar(0.75 + rnd() * 0.65);
      bird.position.set((rnd() - 0.5) * 22, 3.5 + rnd() * 14, (rnd() - 0.5) * 22);
      bird.userData = { phase: rnd() * 6.28, speed: 0.35 + rnd() * 0.3, height: bird.position.y, bank: rnd() * 6.28 };
      scene.add(bird); birds.push(bird);
    }
  }

  /* ---------- the pods ---------- */

  const rooms = plan.rooms.map((room) => {
    const built = { ...room, open: room.status === "open" };
    const rnd = seeded(`pod.${room.id}`);
    if (room.final) buildBell(built, rnd);
    else buildPod(built, rnd, new THREE.Color(room.color));
    board(built, room.final ? 4.2 : built.open ? 3.0 : 1.9, room.final ? 2.2 : built.open ? 1.6 : 1.0);
    return built;
  });

  function buildPod(room, rnd, color) {
    const { center: c, r, out, open } = room;
    if (!open) {
      // A bud: small, cool, and it cannot hold its shape for long.
      membrane(rnd, c, r, 1300, { tint: cools[room.index % 3], amt: 0.5, alpha: 0.3, loose: 0.8, reach: 2.4, size: 0.022 });
      ribs(rnd, c, r * 0.92, { count: 7, alpha: 0.27 });
      for (let k = 0; k < 3; k++) {
        strand(rnd, { x: c.x + (rnd() - 0.5) * r, y: c.y - r * 0.8, z: c.z + (rnd() - 0.5) * r }, 1.5 + rnd() * 2, -1, 0.5, 60,
          { tint: cools[k], amt: 0.6, alpha: 0.4 });
      }
      return;
    }
    // A mouth on the column's side, so you can see in and the words out.
    const mouth = (d) => {
      const facing = -(d[0] * out.x + d[2] * out.z); // 1 looking straight at the column
      return 1 - 0.93 * THREE.MathUtils.smoothstep(facing, 0.45, 0.85);
    };
    membrane(rnd, c, r, 6500, { tint: teal, amt: 0.7, alpha: 0.24, loose: 0.08, size: 0.02 }, mouth);
    membrane(rnd, c, r * 1.12, 2400, { alpha: 0.13, loose: 0.45, size: 0.021 }, mouth);
    ribs(rnd, c, r, { count: 16, alpha: 0.82 });
    attractor(room.id, room.index, c, 0.95, color);
    // tendrils trail beneath it
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * 6.28 + rnd();
      const rr = r * (0.25 + rnd() * 0.6);
      strand(rnd, { x: c.x + Math.cos(a) * rr, y: c.y - r * 0.82, z: c.z + Math.sin(a) * rr }, 1.6 + rnd() * 2.6, -1, 0.75, 170,
        { tint: teal, amt: 0.75, alpha: 0.55, size: 0.025 });
    }
  }

  function buildBell(room, rnd) {
    const { center: c, r } = room;
    const hues = WARM.map((hex) => new THREE.Color(hex));
    // A translucent crown, traced by luminous meridians over a faint skin.
    const dome = (d) => THREE.MathUtils.smoothstep(d[1], -0.28, 0.05);
    membrane(rnd, c, r, 16000, { tint: teal, amt: 0.5, alpha: 0.28, loose: 0.1, size: 0.023 }, dome);
    membrane(rnd, c, r * 0.9, 5000, { tint: cools[2], amt: 0.8, alpha: 0.18, loose: 0.3, size: 0.023 }, dome);
    ribs(rnd, c, r, { dome: true, count: 28, alpha: 0.9 });
    gills(rnd, c, r);
    // its rim, frilled
    for (let i = 0; i < N(7000); i++) {
      const a = rnd() * 6.28;
      const rr = r * (0.97 + 0.07 * Math.sin(a * 9));
      main.add(c.x + Math.cos(a) * rr, c.y - r * 0.27 + (rnd() - 0.5) * 0.5 + 0.2 * Math.sin(a * 9), c.z + Math.sin(a) * rr,
        { kind: KIND.gill, pivot: [c.x, c.y, c.z], lag: a / 6.28, tint: teal, amt: 0.7, alpha: 0.65, loose: 0.06, size: 0.022 }, rnd);
    }
    [-1, 0, 1].forEach((k) => attractor(`${room.id}.${k + 2}`, 3 + k + 1, { x: c.x + k * 2.6, y: c.y + 0.5 - Math.abs(k) * 0.5, z: c.z - 0.3 }, 0.85, hues[k + 1]));

    // The tentacles: long ones down the column past every week, and a fringe
    // of short ones round the rim. The palette, deep to bright.
    const threads = [...COOL].reverse().map((hex) => new THREE.Color(hex));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.28 + rnd() * 0.3;
      const rr = 0.5 + rnd() * 1.9;
      strand(rnd, { x: c.x + Math.cos(a) * rr, y: c.y - r * 0.3, z: c.z + Math.sin(a) * rr }, c.y - 3 - rnd() * 4, -1, 1.5, 1100,
        { tint: threads[k % threads.length], amt: 0.85, alpha: 0.6, size: 0.026 });
    }
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * 6.28 + rnd() * 0.2;
      strand(rnd, { x: c.x + Math.cos(a) * r * 0.97, y: c.y - r * 0.3, z: c.z + Math.sin(a) * r * 0.97 }, 2 + rnd() * 4.5, -1, 0.9, 210,
        { tint: teal, amt: 0.6, alpha: 0.6 });
    }
  }

  /* ---------- the open water ---------- */

  // tell the shader where the attractors are: they are what stirs the field
  stones.slice(0, MAX_STONES).forEach((st, i) => {
    uniforms.uStone.value[i].set(st.x, st.y, st.z, 2.8);
    uniforms.uStoneTint.value[i].set(st.color);
  });
  uniforms.uStones.value = Math.min(stones.length, MAX_STONES);

  {
    /*
      Streamlines, the way a smoke wire shows the air in a wind tunnel. Seeds
      are laid out in order: rings round the foot of the column, and rings
      under each attractor. Each seed owns a line of shards that all start
      there and ride the field for different ages, so the line is drawn whole
      and slides along itself. The ones from the column wind up past the weeks
      in order: follow them and you follow the term.
    */
    const rnd = seeded("streamlines");
    function streamline(x, y, z, seconds, count, o) {
      const seed = rnd();
      const n = Math.round(count * Math.min(1, density));
      for (let k = 0; k < n; k++) {
        main.add(x, y, z, { kind: KIND.stream, fixed: true, seed, lag: k / n, reach: seconds, size: 0.018 + 0.017 * rnd() ** 3, alpha: 1.35, ...o }, rnd);
      }
    }
    for (const [r, n] of [[2.5, 12], [5, 20], [8.5, 30], [12, 34]]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        streamline(x, ground(x, z) + 0.3 + rnd() * 1.2, z, 46, 300, {});
      }
    }
    for (const st of stones) {
      for (const [r, n] of [[1.1, 8], [1.9, 11]]) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r;
          streamline(st.x + Math.cos(a) * r, st.y - 1.6 + rnd() * 0.5, st.z + Math.sin(a) * r, 16, 170, { alpha: 1.3 });
        }
      }
    }

    // marine snow through all of it, and bubbles up the column
    const snow = seeded("snow");
    for (let i = 0; i < N(9000); i++) {
      const a = snow() * 6.28, r = Math.sqrt(snow()) * DIM.world;
      main.add(Math.cos(a) * r, snow() * (plan.bell.y + 5), Math.sin(a) * r, { size: 0.023, alpha: 0.26, loose: 0.3, reach: 3 }, snow);
    }
    for (let i = 0; i < N(1600); i++) {
      const a = snow() * 6.28, r = snow() ** 2 * 3.2;
      main.add(Math.cos(a) * r, snow() * SURFACE, Math.sin(a) * r, { size: 0.03, alpha: 0.4, loose: 0, rise: 0.2 + snow() * 0.6 }, snow);
    }
  }

  scene.add(main.build(glow));

  /* ---------- each frame ---------- */

  let time = 0;
  let swell = 0.5;
  const at = new THREE.Vector3();
  const was = new THREE.Vector3();
  let moved = false;
  let sinceDrop = 0;
  let head = 0;
  const deep = new THREE.Color(WATER.deep), shallow = new THREE.Color(WATER.shallow);
  const inkDeep = new THREE.Color(WATER.pointDeep), inkShallow = new THREE.Color(WATER.pointShallow);
  const settings = { 'visual.water': '#232323', 'visual.creature': '#0433ff', 'motion.speed': 0.05, 'motion.breathing': 0.6, 'motion.current': 0.7, 'life.birds': 0.75, 'visual.sparkle': 1 };

  function setControl(id, value) {
    if (id === 'visual.brightness') uniforms.uBrightness.value = value;
    else if (id === 'visual.sparkle') settings[id] = value;
    else if (id === 'visual.fog') scene.fog.far = uniforms.uFogFar.value = value;
    else if (id === 'visual.water') {
      settings[id] = value; deep.set(value);
      if (value === WATER.deep) shallow.set(WATER.shallow);
      else shallow.copy(deep).lerp(new THREE.Color(WATER.shallow), 0.35);
    } else if (id === 'visual.creature') {
      settings[id] = value; inkDeep.set(value);
      if (value === WATER.pointDeep) inkShallow.set(WATER.pointShallow);
      else inkShallow.copy(inkDeep).lerp(WHITE, 0.25);
    } else if (id in settings) settings[id] = value;
    else throw new Error(`Unknown visual control: ${id}`);
  }
  function controlValues() {
    return { ...settings, 'visual.brightness': uniforms.uBrightness.value, 'visual.fog': uniforms.uFogFar.value };
  }

  function update(dt, camera) {
    time += dt * settings['motion.speed'];
    swell = 0.5 + settings['motion.breathing'] * (0.3 * Math.sin(time * 0.27) + 0.2 * Math.sin(time * 0.17 + 1.3));
    uniforms.uTime.value = time;
    uniforms.uSwell.value = swell;
    uniforms.uWobble.value = (0.38 + swell * 0.18) * settings['motion.breathing'];
    uniforms.uCam.value.copy(camera.position);

    // Your wake: every third of a second, leave a mark where you are, as
    // strong as you were fast; the marks fade over a few seconds.
    const trail = uniforms.uTrail.value;
    if (dt > 0) {
      const speed = moved ? camera.position.distanceTo(was) / dt : 0;
      for (const mark of trail) mark.w *= Math.exp(-dt * 0.55);
      sinceDrop += dt;
      if (sinceDrop > 0.3 && speed > 0.4) {
        trail[head].set(camera.position.x, camera.position.y - 0.3, camera.position.z, Math.min(1, speed / 5));
        head = (head + 1) % TRAIL;
        sinceDrop = 0;
      }
    }
    was.copy(camera.position);
    moved = true;

    // the water changes with your depth
    const up = THREE.MathUtils.smoothstep(camera.position.y, 1, plan.bell.y);
    scene.background.copy(deep).lerp(shallow, up);
    scene.fog.color.copy(scene.background);
    uniforms.uInk.value.copy(inkDeep).lerp(inkShallow, up);

    for (const s of stones) {
      const p = s.points;
      p.rotation.y += p.userData.turn * dt * settings['motion.speed'];
      p.position.y = p.userData.y + Math.sin(time * 0.5 + p.userData.phase) * 0.06;
    }
    for (const mesh of lettering) {
      const [near, far] = mesh.userData.fade;
      const want = 1 - THREE.MathUtils.smoothstep(mesh.getWorldPosition(at).distanceTo(camera.position), near, far);
      const m = mesh.material;
      m.opacity += (want - m.opacity) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
      mesh.visible = m.opacity > 0.01;
      mesh.quaternion.copy(camera.quaternion); // words turn to face you
    }
    for (const bird of birds) {
      const u = bird.userData;
      const t = time * u.speed + u.phase;
      bird.position.x += Math.cos(t * 0.83 + u.bank) * dt * 0.18 * settings['motion.current'];
      bird.position.z += Math.sin(t * 0.71 + u.bank) * dt * 0.18 * settings['motion.current'];
      bird.position.y = u.height + Math.sin(t * 0.9) * 0.45;
      bird.rotation.y = Math.atan2(Math.sin(t * 0.71 + u.bank), Math.cos(t * 0.83 + u.bank));
      bird.rotation.z = Math.sin(t * 1.7) * 0.18;
      bird.visible = settings['life.birds'] > 0.01;
      bird.scale.setScalar((0.75 + settings['life.birds'] * 0.65) * (0.85 + 0.15 * Math.sin(t * 2.1)));
      if (Math.hypot(bird.position.x, bird.position.z) > DIM.world - 2) { bird.position.x *= 0.92; bird.position.z *= 0.92; }
    }
  }

  /* Shards are sized in metres; this is what turns metres into pixels. */
  function setViewport(heightPx, fovDeg, dpr) {
    uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    uniforms.uMax.value = 70 * dpr;
  }

  const redraw = () => labels.forEach((draw) => draw());
  redraw();

  return {
    scene, rooms, plan, clickable, floors, stones, kelp, sign, birds, ground, ceiling: SURFACE - 2,
    get swell() { return swell; },
    get points() { return main.count + stones.reduce((n, s) => n + s.points.geometry.attributes.seed.count, 0); },
    redraw, setViewport, update, setControl, controlValues,
  };
}

function wrap(ctx, text, x, y, maxW, lineH) {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      ctx.fillText(line, x, y);
      y += lineH;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
