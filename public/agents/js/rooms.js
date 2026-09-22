/*
  The whole site hangs off this list. One entry per room; the building, the
  menu, the reading panel and the sound hosts are all derived from it.

  To publish a week: write rooms/<id>.html, then flip its status to "open"
  and give it a title. Nothing else changes.

    status "open"  a full pod in its colour, with its attractor, and a page to read
    status "soon"  a small cool bud that has not formed, with nothing to read

  Weeks 5 and 8 have no build (no folder in weekly_builds/), so they have no
  room either.
*/

export const ROOMS = [
  { id: "week01", label: "week 1", title: "a first agent, from scratch", status: "open" },
  { id: "week02", label: "week 2", title: "", status: "soon" },
  { id: "week03", label: "week 3", title: "", status: "soon" },
  { id: "week04", label: "week 4", title: "", status: "soon" },
  { id: "week06", label: "week 6", title: "", status: "soon" },
  { id: "week07", label: "week 7", title: "", status: "soon" },
  { id: "week09", label: "week 9", title: "", status: "soon" },
  { id: "week10", label: "week 10", title: "", status: "soon" },
  { id: "week11", label: "week 11", title: "", status: "soon" },
  { id: "week12", label: "week 12", title: "", status: "soon" },
  { id: "week13", label: "week 13", title: "", status: "soon" },
  // The last entry is the big room at the far end of the atrium.
  { id: "final", label: "final project", title: "three ideas", status: "open", final: true },
];

/* The same spectral ramp as mateolarreaferro.com, warm to cool. */
export const RAMP = [
  "#F94144", "#F3722C", "#F8961E", "#F9844A", "#F9C74F",
  "#90BE6D", "#43AA8B", "#4D908E", "#577590", "#277DA1",
];

/*
  The site uses six of them, with a rule. The water and the building are cool
  and only cool. Warm is reserved for the work: a room that has opened, and the
  stone inside it. Weeks run amber to red across the term.
*/
export const COOL = ["#43AA8B", "#4D908E", "#277DA1"];
export const WARM = ["#F9C74F", "#F9844A", "#F94144"];

/* A colour at t in [0, 1] along a ramp, linearly mixed between its steps. */
export function rampAt(t, ramp = RAMP) {
  const x = Math.min(Math.max(t, 0), 1) * (ramp.length - 1);
  const i = Math.min(Math.floor(x), ramp.length - 2);
  const f = x - i;
  const a = parseInt(ramp[i].slice(1), 16);
  const b = parseInt(ramp[i + 1].slice(1), 16);
  const mix = (shift) =>
    Math.round(((a >> shift) & 255) * (1 - f) + ((b >> shift) & 255) * f);
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, "0")}`;
}

/*
  Where everything is, in metres. y is up. There is no building.

  The world is one creature: a vast jellyfish. A column of current rises from
  the seabed at the origin; the weeks are soft pods spiralling up around it,
  one after another, so going up is how the term proceeds; and the bell, high
  over everything, is the final project, its tentacles hanging down the column
  past every week on the way.
*/
export const DIM = {
  helix: 8.5, // how far the pods sit from the column
  turn: (58 * Math.PI) / 180, // the angle from one week to the next
  first: 70 * (Math.PI / 180), // where week 1 is (you arrive from +z, looking in)
  base: 2.4, // week 1's height,
  climb: 1.25, // and how much higher each week is than the last
  pod: 2.7, // radius of a pod that has opened
  bud: 1.5, // radius of one that has not
  bell: 5.6, // radius of the bell
  world: 34, // how far you can swim from the column
};

/* The floor of the sea: low dunes. Pure, so the walker and the world agree. */
const lattice = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function dune(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const u = x - i, v = z - j;
  const su = u * u * u * (u * (u * 6 - 15) + 10), sv = v * v * v * (v * (v * 6 - 15) + 10);
  const a = lattice(i, j), b = lattice(i + 1, j), c = lattice(i, j + 1), d = lattice(i + 1, j + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
export function ground(x, z) {
  return 1.5 * dune(x * 0.075, z * 0.075) + 0.45 * dune(x * 0.24 + 9.1, z * 0.24 + 3.7) + 0.0016 * (x * x + z * z) - 0.7;
}

export function layout() {
  const weeks = ROOMS.filter((r) => !r.final);
  const top = DIM.base + (weeks.length - 1) * DIM.climb;
  const rooms = ROOMS.map((room) => {
    if (room.final) {
      const center = { x: 0, y: top + 6.2, z: 0 };
      return {
        ...room, color: "#dbe6ea", r: DIM.bell, center,
        out: { x: 0, z: 1 }, // the way its words face
        stand: { x: 0, y: center.y + 0.9, z: 4.2 },
        board: { x: 0, y: center.y + 2.7, z: -1.6 }, // over the three attractors, under the crown
      };
    }
    const i = weeks.indexOf(room);
    const a = DIM.first + i * DIM.turn;
    const open = room.status === "open";
    const r = open ? DIM.pod : DIM.bud;
    const center = { x: Math.cos(a) * DIM.helix, y: DIM.base + i * DIM.climb, z: Math.sin(a) * DIM.helix };
    const out = { x: Math.cos(a), z: Math.sin(a) }; // from the column, outward through the pod
    return {
      ...room, index: i, color: rampAt(i / (weeks.length - 1), WARM), r, center, out,
      // you come in on the column's side and read the words hung at the back
      // far enough back that the attractor and the words over it both fit in view
      stand: { x: center.x - out.x * r * 0.95, y: center.y + 0.35, z: center.z - out.z * r * 0.95 },
      // the words hang over the attractor, not behind it
      board: { x: center.x + out.x * r * 0.35, y: center.y + (open ? 1.25 : 0.1), z: center.z + out.z * r * 0.35 },
    };
  });
  return { rooms, top, bell: rooms[rooms.length - 1].center };
}
