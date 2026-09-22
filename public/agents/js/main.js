/*
  The page around the building: the renderer and its loop, the rooms menu, the card that says where you are, and the panel a room's page
  is read in. The building is world.js, you are walker.js, the list of rooms
  is rooms.js, and sound.js is where Satie will plug in.

  Two URL conveniences:
    #week01    arrive standing in that room (good for presenting in class)
    ?embed=1   no interface, the camera drifts down the atrium by itself
               (this is what the card on mateolarreaferro.com shows)
*/

import * as THREE from "../vendor/three.module.min.js";
import { buildWorld } from "./world.js";
import { createWalker } from "./walker.js";
import { createSound, soundManifest } from "./sound.js";
import { layout } from "./rooms.js";
import { createEditor } from "./editor.js";
import { createNotes } from "./notes.js";

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const canvas = $("world");
const embed = new URLSearchParams(location.search).has("embed");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = () => motionQuery.matches;

if (embed) root.dataset.embed = "";

/* ---------- the world ---------- */

let world = null;
let renderer = null;
let walker = null;
let editor = null;
let notes = null;
const sound = createSound();

const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 220);

async function start() {
  // Labels are drawn to canvases, so the font has to be there first. Give it
  // a moment and then go without it rather than hold the page for a font.
  await Promise.race([
    Promise.all(['400 32px "Instrument Serif"', 'italic 400 32px "Instrument Serif"', '400 32px "Instrument Sans"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch {
    // No WebGL: the rooms menu is the whole site, and it is enough.
    root.dataset.flat = "";
    buildMenu(layout().rooms.map((r) => ({ ...r, open: r.status === "open" })));
    $("menu").hidden = false;
    return;
  }

  // fewer points on small screens: a phone draws them with less to spare
  world = buildWorld({ density: Math.min(innerWidth, innerHeight) < 700 ? 0.45 : 1.3 });
  walker = createWalker(camera, canvas, world, { onPress, reducedMotion });
  window.agentsWorld = { world, camera, walker, sound, soundManifest: () => soundManifest(world) };
  if (!embed) sound.attach(world, walker); // the card on the main site stays silent
  if (!embed) {
    editor = createEditor(world, sound);
    window.agentsWorld.controls = editor.controls;
    $("edit-button").disabled = false;
    notes = createNotes({ world, camera, walker, canvas, reducedMotion,
      beforeOpen() { closePanel(); closeMenu(); if (editor?.open) editor.close(); } });
    $("notes-button").disabled = false;
  }

  // If the font arrived after the labels were drawn, draw them again.
  document.fonts.ready.then(() => world.redraw());

  buildMenu(world.rooms);
  resize();
  addEventListener("resize", resize);
  arrive();
  addEventListener("hashchange", arrive);
  requestAnimationFrame(frame);
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // a phone held upright needs a wider lens or the atrium is a slot
  camera.fov = w < h ? 90 : 66;
  camera.updateProjectionMatrix();
  const dpr = renderer.getPixelRatio();
  world.setViewport(h * dpr, camera.fov, dpr);
  notes?.resize();
}

/* Start in the room named by the hash, or outside the front door. */
function arrive() {
  const room = world.rooms.find((r) => r.id === location.hash.slice(1));
  if (room) walker.place(room.stand.x, room.stand.y, room.stand.z, Math.atan2(room.board.x - room.stand.x, -(room.board.z - room.stand.z)));
  else if (!location.hash) {
    const portrait = innerWidth < innerHeight;
    // Arrive far enough back, looking up slightly, to read the whole creature.
    walker.place(0, 6.5, portrait ? 23 : 25.5, 0, portrait ? 0.10 : 0.18);
  }
}

let last = 0;
let region = "";
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min((now - last) / 1000 || 0, 0.05);
  last = now;

  if (embed) drift(now / 1000);
  else walker.update(dt);

  world.update(reducedMotion() ? 0 : dt, camera);
  notes?.update(dt);
  sound.update(camera, dt);

  const at = walker.regionAt(camera.position.x, camera.position.y, camera.position.z);
  if (!notes?.opened && at !== region) changeRegion(at);

  renderer.render(world.scene, camera);
}

/* The unattended camera: a slow spiral up the column and back, always looking in. */
function drift(t) {
  const k = reducedMotion() ? 0.15 : (1 - Math.cos(t * 0.045)) / 2;
  const a = t * 0.05 + 1.2;
  const y = 2.4 + k * (world.plan.bell.y - 3);
  camera.position.set(Math.cos(a) * 15, y, Math.sin(a) * 15);
  camera.lookAt(0, y + 2.5, 0);
}

/* ---------- where you are ---------- */

function changeRegion(at) {
  const before = world.rooms.find((r) => r.id === region);
  const room = world.rooms.find((r) => r.id === at);
  if (before) sound.event("room.leave", before.id);
  if (room) sound.event("room.enter", room.id);
  region = at;

  $("here").hidden = !room;
  if (room) {
    $("here-label").textContent = room.label;
    $("here-title").textContent = room.open ? room.title : "not yet";
    $("here-read").hidden = !room.open;
    $("here").style.setProperty("--room", room.final ? "var(--ink)" : room.color);
  }
  if (!embed) {
    history.replaceState(null, "", location.pathname + location.search + (room ? `#${room.id}` : ""));
  }
  for (const li of $("menu-list").children) {
    li.firstElementChild.toggleAttribute("aria-current", li.dataset.room === at);
  }
}

/* ---------- pressing the world ---------- */

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/*
  What is under the pointer. Nothing in the cloud is solid, so the only things
  that can be pressed are the invisible ones made for it: boards and floors.
*/
let pressables = null;
function pick(e) {
  pressables ??= [...world.clickable, ...world.floors];
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  // words that have not surfaced yet cannot be pressed
  return ray.intersectObjects(pressables, false).find((hit) => !hit.object.userData.roomId || hit.object.material.opacity > 0.4);
}

/* A click on a room's words goes there and reads; a double-click on the ground goes to that spot. */
function onPress(e, double) {
  sound.start(); // a press is the only thing allowed to wake the audio
  if (notes?.press(e)) return;
  const hit = pick(e);
  if (!hit) return;
  const id = hit.object.userData.roomId;
  if (id) visit(id);
  else if (double && world.floors.includes(hit.object)) walker.goToPoint(hit.point.x, hit.point.z);
}

let hoverAt = 0;
canvas.addEventListener("pointermove", (e) => {
  if (!world || e.buttons || e.timeStamp - hoverAt < 80) return;
  hoverAt = e.timeStamp;
  canvas.style.cursor = notes?.hover(e) || pick(e)?.object.userData.roomId ? "pointer" : "grab";
});

/* Walk to a room and, if it has a page, open it on arrival. */
function visit(id) {
  if (!world) return openPanel(id); // no WebGL: the menu opens pages directly
  const room = world.rooms.find((r) => r.id === id);
  if (!room) return;
  closeMenu();
  walker.goToRoom(id, () => room.open && openPanel(id));
}

/* ---------- the rooms menu ---------- */

function buildMenu(rooms) {
  const list = $("menu-list");
  list.textContent = "";
  for (const room of rooms) {
    const li = document.createElement("li");
    li.dataset.room = room.id;
    const b = document.createElement("button");
    b.style.setProperty("--room", room.final ? "var(--ink)" : room.color);
    b.disabled = !world && !room.open;
    b.dataset.status = room.status;
    b.innerHTML = `<span class="dot"></span><span class="label"></span><span class="title"></span>`;
    b.children[1].textContent = room.label;
    b.children[2].textContent = room.open ? room.title : "not yet";
    b.addEventListener("click", () => visit(room.id));
    li.append(b);
    list.append(li);
  }
}

function closeMenu() {
  if (!$("menu").hidden) sound.event("menu.close");
  $("menu").hidden = true;
  $("menu-button").setAttribute("aria-expanded", "false");
}

$("menu-button").addEventListener("click", () => {
  if (editor?.open) editor.close();
  const open = $("menu").hidden;
  $("menu").hidden = !open;
  sound.event(open ? "menu.open" : "menu.close");
  $("menu-button").setAttribute("aria-expanded", String(open));
});

$("edit-button").addEventListener("click", closeMenu);
$("notes-button").addEventListener("click", () => notes?.open(region));

$("here-read").addEventListener("click", () => world.rooms.find((r) => r.id === region)?.open && openPanel(region));

// Sound starts with your first press anywhere, and this button turns it off and on.
const soundButton = $("sound-button");
let soundButtonGesture = false;
const SOUND_LABEL = { loading: "sound loading", starting: "sound starting", ready: "play sound", on: "sound on", off: "sound off", unavailable: "sound unavailable" };
sound.onChange((now) => {
  soundButton.textContent = SOUND_LABEL[now];
  soundButton.setAttribute("aria-pressed", String(now === "on"));
  soundButton.disabled = now === "unavailable" || now === "loading" || now === "starting";
  soundButton.setAttribute("aria-busy", String(now === "loading" || now === "starting"));
});
soundButton.addEventListener("click", (e) => {
  e.stopPropagation();
  // Brave can resolve scene.start() before dispatching the synthesized click
  // that follows pointerdown. That click must not be mistaken for a second
  // press, or it immediately toggles the scene back off.
  if (soundButtonGesture) { soundButtonGesture = false; return; }
  // A pointer click should return Space to swimming. Keyboard activation
  // keeps focus so the button remains usable with Tab, Enter and Space.
  if (e.detail > 0) soundButton.blur();
  if (sound.state === "ready" || sound.state === "loading" || sound.state === "starting") sound.start();
  else sound.toggle();
});
soundButton.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  if (sound.state === "ready") {
    soundButtonGesture = true;
    sound.start();
  }
});
// Match Satie's field-study integration: a gesture resumes the loaded scene.
// The sound button owns its own click so one press cannot start then immediately mute.
addEventListener("pointerdown", (e) => e.target !== soundButton && sound.start(), { capture: true });
addEventListener("keydown", (e) => e.target !== soundButton && sound.start(), { capture: true });
document.addEventListener("pointerover", (e) => e.target.closest?.("button, a") && !e.relatedTarget?.closest?.("button, a") && sound.event("ui.hover"));
document.addEventListener("click", (e) => e.target.closest?.("button, a") && sound.event("ui.press"));

/* ---------- the reading panel ---------- */

let returnFocus = null;

async function openPanel(id) {
  if (notes?.opened) notes.close();
  if (editor?.open) editor.close();
  const room = world?.rooms.find((r) => r.id === id);
  const panel = $("panel");
  const body = $("panel-body");
  $("panel-label").textContent = room ? room.label : id;
  panel.style.setProperty("--room", !room || room.final ? "var(--ink)" : room.color);
  body.innerHTML = "";
  returnFocus = document.activeElement;
  closeMenu();
  panel.hidden = false;
  root.dataset.reading = "";
  for (const el of [canvas, $("menu"), $("here"), $("legend"), document.querySelector(".hud")]) el.inert = true;
  walker?.setEnabled(false);
  sound.event("page.open", id);
  panel.focus({ preventScroll: true });
  panel.scrollTop = 0;

  try {
    const res = await fetch(`rooms/${id}.html`);
    if (!res.ok) throw new Error(String(res.status));
    // Our own files, written by hand: inserted as they are.
    body.innerHTML = await res.text();
  } catch {
    body.innerHTML =
      "<h1>nothing here yet</h1><p>This room's page could not be loaded. If you opened index.html straight from disk, serve the folder instead: <code>python3 -m http.server</code> inside <code>website/</code>.</p>";
  }
}

function closePanel() {
  if ($("panel").hidden) return;
  sound.event("page.close", region);
  $("panel").hidden = true;
  delete root.dataset.reading;
  for (const el of [canvas, $("menu"), $("here"), $("legend"), document.querySelector(".hud")]) el.inert = false;
  walker?.setEnabled(true);
  returnFocus?.focus?.({ preventScroll: true });
}

$("panel-close").addEventListener("click", closePanel);

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePanel();
    closeMenu();
  } else if (e.key === "Enter" && !notes?.opened && $("panel").hidden && !e.target.closest?.("button, a, input, textarea, select, summary")) {
    const room = world?.rooms.find((r) => r.id === region);
    if (room?.open) openPanel(room.id);
  }
});

/* ---------- the legend in the corner lights up with your hands ---------- */

const legendKeys = new Map();
for (const el of document.querySelectorAll("#legend [data-key]")) {
  for (const code of el.dataset.key.split(" ")) legendKeys.set(code, el);
}
const lightKey = (e, on) => legendKeys.get(e.code.startsWith("Shift") ? "Shift" : e.code)?.toggleAttribute("data-on", on);
addEventListener("keydown", (e) => lightKey(e, true));
addEventListener("keyup", (e) => lightKey(e, false));
addEventListener("blur", () => legendKeys.forEach((el) => el.removeAttribute("data-on")));

start();

addEventListener("pagehide", () => sound.scene?.dispose(), { once: true });
