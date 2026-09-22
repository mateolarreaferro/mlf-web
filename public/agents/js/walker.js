/*
  You, in the water: a point with a heading.

  The controls are Satie's, on purpose, so the two feel like one hand:

    drag (either button)   look. Immediate: the view is under your hand, not
                           following it a moment later.
    W A S D / arrows       move. The arrows move too; they do not turn.
    W / S                  swim forward or back along the camera's gaze.
    A / D                  drift sideways relative to the camera.
    shift                  faster
    scroll / pinch         dolly along the way you are looking
    double-click / -tap    go to that spot on the ground

  Manual movement has a little water drag and buoyant drift, so releasing a key
  does not feel like hitting a hard stop. The one thing that is eased is being
  taken somewhere you asked for by name (a room's words,
  or the rooms menu): that follows a single smooth curve through the doors and
  ends facing what you came to read. Touching any control takes the camera
  straight back.

  Nothing is a wall: membranes are skin you swim through. Only the seabed, the
  top of the water, the edge of the world and the attractors are solid, and a
  step is taken per axis so you slide along them.
*/

import * as THREE from "../vendor/three.module.min.js";

const EYE = 1.62;
const SPEED = 4.2; // m/s
const SPRINT = 2.2;
const LOOK = 0.003; // rad per pixel, mouse
const LOOK_TOUCH = 0.005;
const CRUISE = 4.2; // m/s at the middle of a route
const EDGE = 33; // how far from the column the world goes

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const angleTo = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createWalker(camera, canvas, world, { onPress, reducedMotion }) {
  const pos = new THREE.Vector3(0, 2.6, 17);
  let yaw = 0; // 0 looks down -z, into the building
  let pitch = 0;
  const velocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const keys = new Set();
  let route = null; // { curve, length, t, duration, face, done }
  let enabled = true;

  /* ---------- where you can be ---------- */

  // Nothing here is a wall. The membranes are skin you swim through. What is
  // solid: the seabed, the top of the water, the edge of the world, and the
  // attractors themselves, which you go round.
  function canBe(x, y, z) {
    if (y < world.ground(x, z) + 0.55 || y > world.ceiling) return false;
    if (Math.hypot(x, z) > EDGE) return false;
    return !world.stones.some((s) => Math.hypot(x - s.x, y - s.y, z - s.z) < s.radius * 0.8);
  }

  /* The pod you are inside, or "water". */
  function regionAt(x, y, z) {
    const hit = world.rooms.find((r) => Math.hypot(x - r.center.x, (y - r.center.y) * (r.final ? 1.6 : 1), z - r.center.z) < r.r * 1.15); // a little outside the skin: where you stop to read
    return hit ? hit.id : "water";
  }

  const roomById = (id) => world.rooms.find((r) => r.id === id);

  /*
    Move one axis at a time, so what is solid is slid along. A dune is not a
    wall: swimming into rising ground carries you up and over it.
  */
  function step(dx, dy, dz) {
    const over = (x, z) => Math.max(pos.y, world.ground(x, z) + 0.6);
    let y = over(pos.x + dx, pos.z);
    if (canBe(pos.x + dx, y, pos.z)) { pos.x += dx; pos.y = y; }
    y = over(pos.x, pos.z + dz);
    if (canBe(pos.x, y, pos.z + dz)) { pos.z += dz; pos.y = y; }
    if (canBe(pos.x, pos.y + dy, pos.z)) pos.y += dy;
  }

  /* ---------- being taken somewhere ---------- */

  /*
    From here to there in one curve. If the straight way would cut through the
    column, bow out round it, the way the current does.
  */
  function waypoints(target) {
    const points = [{ x: pos.x, y: pos.y, z: pos.z }];
    const mx = (pos.x + target.x) / 2, mz = (pos.z + target.z) / 2;
    const near = Math.hypot(mx, mz);
    if (near < 5 && Math.hypot(pos.x - target.x, pos.z - target.z) > 6) {
      const k = 6.5 / Math.max(near, 0.4);
      points.push({ x: mx * k || 6.5, y: (pos.y + target.y) / 2, z: mz * k });
    }
    points.push(target);
    return points;
  }

  function travel(points, face, done, quick = false) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, "centripetal",
    );
    const length = curve.getLength();
    if (length < 0.3) return done?.();
    const duration = quick ? Math.min(1.2, 0.35 + length / 14) : Math.max(2, length / CRUISE + 1.4);
    route = { curve, length, t: 0, duration, face, done };
  }

  /* Looking from where you stop, into the pod, at its words. */
  const facing = (room) => Math.atan2(room.board.x - room.stand.x, -(room.board.z - room.stand.z));

  function goToRoom(id, done) {
    const room = roomById(id);
    if (!room) return;
    if (reducedMotion()) {
      place(room.stand.x, room.stand.y, room.stand.z, facing(room));
      return done?.();
    }
    travel(waypoints(room.stand), facing(room), done);
  }

  /* Satie's teleport, as a short glide so the cloud does not cut. */
  function goToPoint(x, z) {
    const y = world.ground(x, z) + EYE;
    if (!canBe(x, y, z)) return;
    if (reducedMotion()) return place(x, y, z, yaw);
    travel([{ x: pos.x, y: pos.y, z: pos.z }, { x, y, z }], null, null, true);
  }

  function place(x, y, z, heading, elevation = 0) {
    pos.set(x, y, z);
    yaw = heading;
    pitch = elevation;
    velocity.set(0, 0, 0);
    route = null;
  }

  /* ---------- input ---------- */

  const MOVE_KEYS = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  ]);

  window.addEventListener("keydown", (e) => {
    if (e.code.startsWith("Shift")) keys.add("Shift");
    if (!enabled || e.metaKey || e.ctrlKey || e.altKey || !MOVE_KEYS.has(e.code)) return;
    // a focused button keeps the arrows for itself
    if (e.target instanceof HTMLElement && e.target.closest("button, a, input, textarea")) {
      if (e.code === "Space" || e.code.startsWith("Arrow")) return;
    }
    keys.add(e.code);
    route = null; // your hands are on it now
    e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    if (e.code.startsWith("Shift")) keys.delete("Shift");
  });
  window.addEventListener("blur", () => keys.clear());

  // Pointers: one drags the view, two pinch to dolly. A press that never
  // became a drag is a click; two of those close together are a double.
  const pointers = new Map();
  let moved = 0;
  let pinch = 0;
  let lastTap = { t: 0, x: 0, y: 0 };

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function dolly(amount) {
    route = null;
    const d = THREE.MathUtils.clamp(amount, -1.5, 1.5);
    const cp = Math.cos(pitch);
    step(Math.sin(yaw) * cp * d, Math.sin(pitch) * d, -Math.cos(yaw) * cp * d);
  }

  canvas.style.cursor = "grab";
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (!enabled || (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2)) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) pinch = spread();
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2) {
      const now = spread();
      dolly((now - pinch) * 0.02);
      pinch = now;
      moved = 99;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 4) return; // the dead zone that keeps a click a click
    route = null;
    const k = e.pointerType === "touch" ? LOOK_TOUCH : LOOK;
    yaw += dx * k; // drag right, look right: Satie's direction
    pitch = THREE.MathUtils.clamp(pitch - dy * k, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  });
  const release = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size) return;
    canvas.style.cursor = "grab";
    if (moved >= 6 || e.type !== "pointerup") return;
    const now = performance.now();
    const double = now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40;
    lastTap = double ? { t: 0, x: 0, y: 0 } : { t: now, x: e.clientX, y: e.clientY };
    onPress(e, double);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (e) => {
    if (!enabled) return;
    e.preventDefault();
    dolly(-e.deltaY * 0.01);
  }, { passive: false });

  /* ---------- each frame ---------- */

  const ahead = new THREE.Vector3();
  const here = new THREE.Vector3();

  function follow(dt) {
    route.t = Math.min(1, route.t + dt / route.duration);
    const u = ease(route.t);
    route.curve.getPointAt(u, here);
    pos.copy(here); // the curve carries the height too: up to the gallery, or back down

    // look a few metres down the path; over the last stretch, turn to what
    // you came to see. A short hop keeps the heading you had.
    if (route.face !== null || route.length > 6) {
      const lead = Math.min(1, u + 3.2 / Math.max(route.length, 0.001));
      route.curve.getPointAt(lead, ahead);
      let want = yaw;
      if (Math.hypot(ahead.x - here.x, ahead.z - here.z) > 0.1) want = Math.atan2(ahead.x - here.x, -(ahead.z - here.z));
      if (route.face !== null) want += angleTo(want, route.face) * THREE.MathUtils.smoothstep(route.t, 0.62, 0.97);
      yaw += angleTo(yaw, want) * (1 - Math.exp(-dt * 2.6));
      pitch += (0 - pitch) * (1 - Math.exp(-dt * 2));
    }

    if (route.t >= 1) {
      const { done } = route;
      route = null;
      done?.();
    }
  }

  function swim(dt) {
    const has = (...codes) => codes.some((c) => keys.has(c));
    const f = (has("KeyW", "ArrowUp") ? 1 : 0) - (has("KeyS", "ArrowDown") ? 1 : 0);
    const s = (has("KeyD", "ArrowRight") ? 1 : 0) - (has("KeyA", "ArrowLeft") ? 1 : 0);
    const d = SPEED * (keys.has("Shift") ? SPRINT : 1);
    // Swim along the camera's full gaze. Looking up and holding W carries you
    // upward; the body coasts and eases into a turn like it is suspended in water.
    const cp = Math.cos(pitch);
    const forward = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    desired.set(0, 0, 0).addScaledVector(forward, f * d).addScaledVector(right, s * d);
    const response = 1 - Math.exp(-dt * 4.2);
    velocity.lerp(desired, response);
    // A little residual water drift keeps release from feeling like a hard stop.
    velocity.y += Math.sin(performance.now() * 0.00037 + pos.x * 0.17) * 0.018 * dt;
    velocity.multiplyScalar(Math.exp(-dt * (f || s ? 0.42 : 1.25)));
    if (velocity.lengthSq() < 0.00001) { velocity.set(0, 0, 0); return; }
    step(velocity.x * dt, velocity.y * dt, velocity.z * dt);
  }

  function update(dt) {
    if (route) follow(dt);
    else if (enabled) swim(dt);
    camera.position.copy(pos);
    camera.rotation.set(pitch, -yaw, 0, "YXZ");
  }

  return {
    update, goToRoom, goToPoint, place, regionAt,
    get position() { return pos; },
    get yaw() { return yaw; },
    get moving() { return route !== null || keys.size > 0; },
    get carried() { return route !== null; }, // on a glide, not swimming
    get sprinting() { return route === null && keys.has("Shift") && keys.size > 1; },
    setEnabled(v) { enabled = v; if (!v) keys.clear(); },
  };
}
