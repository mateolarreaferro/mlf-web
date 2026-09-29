import { noteConnections } from "./note-links.js";
import * as THREE from "../vendor/three.module.min.js";

export const NOTE_COLORS = {
  sea: { name: "sea glass", paper: "#203f3c", light: "#a9d9c7" },
  amber: { name: "amber", paper: "#473b25", light: "#e8ce96" },
  lilac: { name: "lilac", paper: "#353650", light: "#c4bde7" },
  rose: { name: "rose", paper: "#49343e", light: "#e6b6c1" },
};

export function createNotesSculpture(world) {
  const groups = new Map(), cards = new Map();
  // Darken the rendered world before drawing the searchable cards and links.
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    uniforms: { focus: { value: 0 } },
    fragmentShader: 'uniform float focus; void main() { gl_FragColor = vec4(0.0, 0.005, 0.01, focus * 0.72); }',
  }));
  shade.frustumCulled = false; shade.renderOrder = 900; shade.visible = false; world.scene.add(shade);
  const network = new THREE.Group(); network.name = 'note-knowledge-network'; world.scene.add(network);
  let graph = { nodes: [], edges: [] }, links = [], graphSignature = '';
  function setGraph(value) { graph = value; rebuildLinks(); return links.length; }
  function rebuildLinks() {
    const projected = noteConnections(graph, [...cards.values()].map(c => c.note));
    const signature = JSON.stringify(projected);
    if (signature === graphSignature) return;
    graphSignature = signature;
    for (const link of links) { link.line.geometry.dispose(); link.line.material.dispose(); link.glow.material.dispose(); link.particle.geometry.dispose(); link.particle.material.dispose(); }
    network.clear();
    links = projected.map(connection => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
      const options = { color: connection.inferred ? 0xc2ace9 : 0x83d9eb, transparent: true, opacity: .25, depthWrite: false, blending: THREE.AdditiveBlending };
      const line = new THREE.Line(geometry, connection.inferred ? new THREE.LineDashedMaterial({ ...options, dashSize: .24, gapSize: .18 }) : new THREE.LineBasicMaterial(options));
      line.renderOrder = 951; line.frustumCulled = false; line.userData.noteConnection = connection;
      const glow = new THREE.Line(geometry, new THREE.LineBasicMaterial({ ...options, opacity: .08 })); glow.frustumCulled = false; glow.renderOrder = 950;
      // Browsers commonly restrict line widths to one pixel; use moving light instead.
      const particle = new THREE.Mesh(new THREE.SphereGeometry(.045, 6, 4), new THREE.MeshBasicMaterial({ color: options.color, transparent: true, depthWrite: false }));
      particle.renderOrder = 952; network.add(line, glow, particle);
      return { ...connection, line, glow, particle };
    });
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), control = new THREE.Vector3(), p = new THREE.Vector3();
  function curvePoint(t, out) { return out.copy(a).multiplyScalar((1-t)*(1-t)).addScaledVector(control, 2*(1-t)*t).addScaledVector(b, t*t); }
  function updateLinks(blend) {
    for (const link of links) {
      const from = cards.get(link.source), to = cards.get(link.target);
      if (!from || !to) continue;
      from.mesh.getWorldPosition(a); to.mesh.getWorldPosition(b);
      control.copy(a).add(b).multiplyScalar(.5);
      const distance = a.distanceTo(b);
      control.y += Math.min(7, distance * .2) + 3;
      control.z += Math.min(4, distance * .12);
      const position = link.line.geometry.attributes.position;
      for (let i = 0; i <= 32; i++) { curvePoint(i / 32, p); position.setXYZ(i, p.x, p.y, p.z); }
      position.needsUpdate = true;
      link.line.geometry.computeBoundingSphere();
      if (link.inferred) link.line.computeLineDistances();
      const lit = searching && (matches.has(link.source) || matches.has(link.target));
      link.line.userData.highlighted = lit;
      for (const object of [link.line, link.glow, link.particle]) object.material.depthTest = focus < .01;
      link.line.material.opacity = THREE.MathUtils.lerp(link.line.material.opacity, lit ? .9 : searching ? .035 : .26, blend);
      link.glow.material.opacity = THREE.MathUtils.lerp(link.glow.material.opacity, lit ? .18 : 0, blend);
      link.particle.material.opacity = THREE.MathUtils.lerp(link.particle.material.opacity, lit ? 1 : 0, blend);
      link.particle.visible = link.particle.material.opacity > .02;
      curvePoint((time * .12 + .25) % 1, link.particle.position);
    }
  }
  const geometry = new THREE.PlaneGeometry(2.25, 2.5, 18, 18);
  const vertices = geometry.attributes.position;
  // A thin sheet with a loose lower corner, instead of a rigid billboard.
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i);
    vertices.setZ(i, 0.065 * x * x + 0.12 * Math.pow(Math.max(0, -y), 2) + 0.17 * Math.pow(Math.max(0, x - y - 1), 2));
  }
  geometry.computeVertexNormals();
  for (const room of world.rooms) {
    const group = new THREE.Group();
    const distance = room.r + 2.4;
    group.position.set(room.center.x + room.out.x * distance, room.center.y + 1.1, room.center.z + room.out.z * distance);
    group.rotation.y = Math.atan2(room.out.x, room.out.z);
    world.scene.add(group); groups.set(room.id, group);
  }
  function draw(card, note) {
    const ctx = card.canvas.getContext("2d"), palette = NOTE_COLORS[note.color] || NOTE_COLORS.sea;
    const w = card.canvas.width, h = card.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, palette.paper); gradient.addColorStop(0.7, palette.paper); gradient.addColorStop(1, "#14252b");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette.light; ctx.globalAlpha = 0.1; ctx.fillRect(0, 0, w, 64); ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.light; ctx.globalAlpha = 0.25; ctx.strokeRect(1, 1, w - 2, h - 2); ctx.globalAlpha = 1;
    ctx.fillStyle = palette.light; ctx.font = '24px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(world.rooms.find(r => r.id === note.week)?.label || "notes", 54, 117);
    ctx.fillStyle = "#eff0e7"; ctx.font = '42px "Helvetica Neue", Helvetica, Arial, sans-serif';
    const text = note.text || "a thought, still forming…";
    const lines = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      // Break long URLs / words too; never paint user text outside its sheet.
      for (const word of paragraph.split(/\s+/)) {
        if (line && ctx.measureText(`${line} ${word}`).width > w - 108) { lines.push(line); line = ""; }
        if (line) line += " ";
        for (const char of word) {
          if (ctx.measureText(line + char).width > w - 108) { lines.push(line); line = ""; }
          line += char;
        }
      }
      lines.push(line);
    }
    for (let i = 0; i < Math.min(lines.length, 9); i++) ctx.fillText(i === 8 && lines.length > 9 ? lines[i].slice(0, -2) + "…" : lines[i], 54, 198 + i * 53);
    ctx.fillStyle = palette.light; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(w / 2, 32, 5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    card.texture.needsUpdate = true;
    card.signature = `${note.color}:${note.text}:${note.week}`;
  }
  function sync(notes) {
    const ids = new Set(notes.map(n => n.id));
    for (const [id, card] of cards) if (!ids.has(id)) {
      card.mesh.removeFromParent(); card.texture.dispose(); card.mesh.material.dispose(); card.halo.material.dispose(); cards.delete(id);
    }
    notes.forEach((note, index) => {
      if (!groups.has(note.week)) return;
      let card = cards.get(note.id);
      if (!card) {
        const canvas = document.createElement("canvas"); canvas.width = 672; canvas.height = 748;
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = 1000; mesh.userData.noteId = note.id;
        const halo = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xace5ed, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
        halo.renderOrder = 999; halo.scale.set(1.065, 1.065, 1); halo.position.z = -0.025; mesh.add(halo);
        card = { mesh, halo, canvas, texture, phase: index * 2.399, signature: "", note };
        cards.set(note.id, card);
      }
      card.note = note; groups.get(note.week).add(card.mesh);
      if (card.signature !== `${note.color}:${note.text}:${note.week}`) draw(card, note);
    });
    rebuildLinks();
  }
  let matches = new Set(), related = new Set(), searching = false, focus = 0;
  function setHighlights(direct, neighbors, active) {
    matches = direct; related = new Set(neighbors); searching = active;
    document.documentElement.toggleAttribute('data-note-search', active);
    for (const link of links) {
      if (matches.has(link.source)) related.add(link.target);
      if (matches.has(link.target)) related.add(link.source);
    }
  }
  let time = 0;
  function update(dt, camera, activeWeek, dragging = null, reduced = false) {
    if (!reduced) time += dt;
    const blend = 1 - Math.exp(-dt * (reduced ? 10 : 3.2));
    focus = THREE.MathUtils.lerp(focus, searching ? 1 : 0, blend);
    shade.material.uniforms.focus.value = focus; shade.visible = focus > .001;
    const counts = new Map();
    for (const card of cards.values()) {
      const n = card.note, index = counts.get(n.week) || 0;
      counts.set(n.week, index + 1);
      card.mesh.visible = !activeWeek || n.week === activeWeek;
      if (!card.mesh.visible) continue;
      const still = dragging === n.id;
      card.mesh.position.set(n.x, n.y - Math.floor(index / 6) * 5.8 + (still ? 0 : Math.sin(time * 0.28 + card.phase) * 0.065), Math.sin(card.phase) * 0.17);
      card.mesh.rotation.set(still ? 0 : Math.sin(time * 0.19 + card.phase) * 0.045, Math.sin(time * 0.13 + card.phase) * 0.055, Math.sin(card.phase) * 0.045);
      let targetOpacity = activeWeek ? 0.97 : 0.94 * (1 - THREE.MathUtils.smoothstep(groups.get(n.week).position.distanceTo(camera.position), 17, 29));
      const direct = searching && matches.has(n.id), neighbor = searching && related.has(n.id);
      card.mesh.userData.searchMatch = direct;
      card.mesh.userData.searchRelated = neighbor;
      const targetColor = searching && !direct && !neighbor ? .5 : direct ? 2 : neighbor ? 1.2 : 1;
      card.mesh.material.color.setScalar(THREE.MathUtils.lerp(card.mesh.material.color.r, targetColor, blend));
      if (links.length) targetOpacity = Math.max(targetOpacity, direct ? .95 : neighbor ? .7 : .18);
      if (searching) targetOpacity = direct || neighbor ? 1 : .5;
      card.mesh.material.opacity = THREE.MathUtils.lerp(card.mesh.material.opacity, targetOpacity, blend);
      card.mesh.material.depthTest = focus < .01;
      card.halo.material.depthTest = focus < .01;
      card.halo.material.opacity = THREE.MathUtils.lerp(card.halo.material.opacity, direct ? .95 : neighbor ? .28 : 0, blend);
      if (card.mesh.material.opacity < 0.02) card.mesh.visible = false;
    }
    updateLinks(blend);
  }
  function focusNote(id, camera, walker) {
    const card = cards.get(id); if (!card) return;
    const center = card.mesh.getWorldPosition(new THREE.Vector3());
    const group = groups.get(card.note.week);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion);
    const distance = Math.max(5.2, 2 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const target = center.clone().addScaledVector(normal, distance).addScaledVector(right, innerWidth > 800 ? 1.15 : 0);
    walker.goToPose(target, Math.atan2(-normal.x, normal.z));
  }
  function frame(week, camera, walker) {
    const room = world.rooms.find(r => r.id === week), group = groups.get(week);
    const horizontalTan = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    const count = [...cards.values()].filter(c => c.note.week === week).length;
    const extraRows = Math.floor(Math.max(0, count - 1) / 6);
    const centerY = group.position.y - extraRows * 2.9;
    const distance = Math.max(8.5, 5.3 / horizontalTan, (3 + extraRows * 2.9) / Math.tan(camera.fov * Math.PI / 360));
    // Perspective changes on resize; the notes keep their actual 3D positions.
    walker.place(group.position.x + room.out.x * distance, centerY + 0.25, group.position.z + room.out.z * distance,
      Math.atan2(-room.out.x, room.out.z), -Math.atan2(0.25, distance));
    walker.update(0);
  }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function cast(e, camera) { pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); ray.setFromCamera(pointer, camera); }
  function pick(e, camera) {
    cast(e, camera);
    return ray.intersectObjects([...cards.values()].filter(c => c.mesh.visible).map(c => c.mesh), false)[0]?.object.userData.noteId;
  }
  function pickLink(e, camera) {
    cast(e, camera); ray.params.Line.threshold = .13;
    return ray.intersectObjects(links.map(link => link.line), false)[0]?.object.userData.noteConnection;
  }
  function point(e, camera, week) {
    cast(e, camera);
    const group = groups.get(week), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, group.position), new THREE.Vector3());
    return hit ? group.worldToLocal(hit) : null;
  }
  return { sync, update, frame, pick, point, cards, setHighlights, setGraph, pickLink, focusNote, get focus() { return focus; } };
}
