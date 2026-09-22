import * as THREE from "../vendor/three.module.min.js";

export const NOTE_COLORS = {
  sea: { name: "sea glass", paper: "#203f3c", light: "#a9d9c7" },
  amber: { name: "amber", paper: "#473b25", light: "#e8ce96" },
  lilac: { name: "lilac", paper: "#353650", light: "#c4bde7" },
  rose: { name: "rose", paper: "#49343e", light: "#e6b6c1" },
};

export function createNotesSculpture(world) {
  const groups = new Map(), cards = new Map();
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
      card.mesh.removeFromParent(); card.texture.dispose(); card.mesh.material.dispose(); cards.delete(id);
    }
    notes.forEach((note, index) => {
      if (!groups.has(note.week)) return;
      let card = cards.get(note.id);
      if (!card) {
        const canvas = document.createElement("canvas"); canvas.width = 672; canvas.height = 748;
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
        const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(geometry, material); mesh.userData.noteId = note.id;
        card = { mesh, canvas, texture, phase: index * 2.399, signature: "", note };
        cards.set(note.id, card);
      }
      card.note = note; groups.get(note.week).add(card.mesh);
      if (card.signature !== `${note.color}:${note.text}:${note.week}`) draw(card, note);
    });
  }
  let time = 0;
  function update(dt, camera, activeWeek, page = 0, dragging = null) {
    time += dt;
    const counts = new Map();
    for (const card of cards.values()) {
      const n = card.note, index = counts.get(n.week) || 0;
      counts.set(n.week, index + 1);
      const pageForWeek = activeWeek === n.week ? page : 0;
      card.mesh.visible = Math.floor(index / 6) === pageForWeek && (!activeWeek || n.week === activeWeek);
      if (!card.mesh.visible) continue;
      const still = dragging === n.id;
      card.mesh.position.set(n.x, n.y + (still ? 0 : Math.sin(time * 0.28 + card.phase) * 0.065), Math.sin(card.phase) * 0.17);
      card.mesh.rotation.set(still ? 0 : Math.sin(time * 0.19 + card.phase) * 0.045, Math.sin(time * 0.13 + card.phase) * 0.055, Math.sin(card.phase) * 0.045);
      card.mesh.material.opacity = activeWeek ? 0.97 : 0.94 * (1 - THREE.MathUtils.smoothstep(groups.get(n.week).position.distanceTo(camera.position), 17, 29));
      if (card.mesh.material.opacity < 0.02) card.mesh.visible = false;
    }
  }
  function frame(week, camera, walker) {
    const room = world.rooms.find(r => r.id === week), group = groups.get(week);
    const horizontalTan = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    const distance = Math.max(8.5, 5.3 / horizontalTan);
    // Perspective changes on resize; the notes keep their actual 3D positions.
    walker.place(group.position.x + room.out.x * distance, group.position.y + 0.25, group.position.z + room.out.z * distance,
      Math.atan2(-room.out.x, room.out.z), -Math.atan2(0.25, distance));
    walker.update(0);
  }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function cast(e, camera) { pointer.set(e.clientX / innerWidth * 2 - 1, 1 - e.clientY / innerHeight * 2); ray.setFromCamera(pointer, camera); }
  function pick(e, camera) {
    cast(e, camera);
    return ray.intersectObjects([...cards.values()].filter(c => c.mesh.visible).map(c => c.mesh), false)[0]?.object.userData.noteId;
  }
  function point(e, camera, week) {
    cast(e, camera);
    const group = groups.get(week), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
    const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, group.position), new THREE.Vector3());
    return hit ? group.worldToLocal(hit) : null;
  }
  return { sync, update, frame, pick, point, cards };
}
