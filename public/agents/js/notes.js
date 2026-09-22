import { createNotesStore } from "./notes-store.js";
import { createNotesSculpture, NOTE_COLORS } from "./notes-sculpture.js";

// The sculpture is the overview; a real textarea is the close-up. Keeping text
// input in HTML gives touch keyboards, selection, dictation and screen readers
// the same editing surface, without trying to type into a WebGL texture.
export function createNotes({ world, camera, walker, canvas, beforeOpen, reducedMotion }) {
  const root = document.documentElement;
  const host = document.createElement("section"); host.id = "weekly-notes"; host.hidden = true;
  host.setAttribute("aria-label", "weekly notes");
  host.innerHTML = `
    <div class="notes-bar">
      <span class="notes-name">notes</span>
      <label class="sr" for="notes-week">week</label><select id="notes-week"></select>
      <button class="pill" id="notes-add" hidden>+ note</button>
      <button class="pill" id="notes-auth">edit</button>
      <button class="pill" id="notes-close" aria-label="close notes">close</button>
    </div>
    <div class="notes-empty" id="notes-empty" hidden><p id="notes-empty-text">a little space to think.</p><button class="pill" id="notes-first" hidden>+ first note</button></div>
    <div class="notes-foot">
      <div id="notes-index" class="notes-index" aria-label="notes in this week"></div>
      <div class="notes-pagination"><button class="pill" id="notes-prev" aria-label="previous notes">←</button><span id="notes-page"></span><button class="pill" id="notes-next" aria-label="next notes">→</button></div>
      <div class="notes-save"><span id="notes-status" role="status" aria-live="polite"></span><button class="pill" id="notes-retry" hidden>retry save</button></div>
    </div>
    <dialog id="note-dialog" class="note-dialog" aria-labelledby="note-label">
      <div class="note-top"><span id="note-label" class="label"></span><button class="pill" id="note-done">done</button></div>
      <label class="sr" for="note-text">note</label><textarea id="note-text" placeholder="a thought, a question, something to return to…" maxlength="4000" spellcheck="true"></textarea>
      <div class="note-bottom"><div id="note-colors" aria-label="note color"></div><span id="note-count"></span><button class="pill" id="note-delete">remove</button></div>
      <div id="note-remove-confirm" hidden><span>remove this note?</span><button class="pill" id="note-remove-yes">remove</button><button class="pill" id="note-remove-no">keep</button></div>
      <div id="note-conflict" hidden><p>Changed on another device. Your draft is above.</p><button class="pill" id="note-keep-draft">keep my draft</button><button class="pill" id="note-use-saved">use saved note</button></div>
      <p id="note-save-status" role="status" aria-live="polite"></p>
    </dialog>
    <dialog id="notes-login" class="notes-login" aria-labelledby="notes-login-label">
      <form id="notes-login-form"><div class="note-top"><h2 id="notes-login-label">your notes</h2><button class="pill" type="button" id="notes-login-close">close</button></div>
      <label for="notes-key">editing key</label><input id="notes-key" type="password" autocomplete="current-password" required maxlength="256">
      <button class="pill solid" type="submit">sign in</button><p id="notes-login-status" role="status"></p></form>
    </dialog>`;
  document.body.append(host);
  const $ = id => document.getElementById(id);
  const sculpture = createNotesSculpture(world);
  const worldLabels = world.scene.children.filter(object => object.userData.fade);
  let opened = false, week = "week01", page = 0, selected = null, drag = null, returnPosition = null;
  const store = createNotesStore(refresh);
  const weekNotes = () => store.notes.filter(n => n.week === week);
  const pageCount = () => Math.max(1, Math.ceil(weekNotes().length / 6));
  for (const room of world.rooms) {
    const option = document.createElement("option"); option.value = room.id; option.textContent = room.label; $("notes-week").append(option);
  }
  for (const [key, color] of Object.entries(NOTE_COLORS)) {
    const b = document.createElement("button"); b.className = "note-swatch"; b.dataset.color = key; b.style.setProperty("--swatch", color.light);
    b.setAttribute("aria-label", color.name); b.addEventListener("click", () => { const note = store.get(selected); if (note) store.edit({ ...note, color: key }); });
    $("note-colors").append(b);
  }
  function refresh() {
    page = Math.min(page, pageCount() - 1);
    const counts = new Map();
    const visible = store.notes.filter(note => {
      const i = counts.get(note.week) || 0; counts.set(note.week, i + 1);
      return opened ? note.week === week && Math.floor(i / 6) === page : i < 6;
    });
    sculpture.sync(visible);
    $("notes-status").textContent = store.message;
    $("note-save-status").textContent = store.message;
    $("notes-retry").hidden = !store.pending || store.message === "saving…";
    $("notes-auth").textContent = store.canEdit ? "sign out" : "edit";
    $("notes-auth").disabled = !store.ready;
    $("notes-add").hidden = !store.canEdit;
    $("notes-add").disabled = weekNotes().length >= 24;
    $("notes-empty").hidden = weekNotes().length > 0;
    $("notes-empty-text").textContent = store.private && !store.canEdit ? "a space of your own." : "a little space to think.";
    $("notes-first").hidden = !store.canEdit;
    $("notes-page").textContent = `${page + 1} / ${pageCount()}`;
    $("notes-prev").disabled = page === 0; $("notes-next").disabled = page === pageCount() - 1;
    $("notes-prev").parentElement.hidden = pageCount() === 1;
    const index = $("notes-index");
    // Preserve the focused index button during autosave / typing.
    const signature = weekNotes().map(n => `${n.id}:${n.text.slice(0, 36)}`).join("|");
    if (index.dataset.signature !== signature) {
      index.dataset.signature = signature; index.replaceChildren();
      for (const [i, note] of weekNotes().entries()) {
        const button = document.createElement("button"); button.className = "notes-index-item"; button.dataset.noteId = note.id;
        button.textContent = note.text.trim().split("\n")[0]?.slice(0, 36) || `note ${i + 1}`;
        button.addEventListener("click", () => { page = Math.floor(i / 6); select(note.id); }); index.append(button);
      }
    }
    if (selected) {
      const note = store.get(selected);
      if (!note) { closeNote(); return; }
      const palette = NOTE_COLORS[note.color] || NOTE_COLORS.sea;
      $("note-dialog").style.setProperty("--note-paper", palette.paper);
      $("note-dialog").style.setProperty("--note-light", palette.light);
      $("note-text").readOnly = !store.canEdit;
      $("note-count").textContent = `${note.text.length} / 4000`;
      $("note-colors").hidden = !store.canEdit; $("note-delete").hidden = !store.canEdit;
      for (const b of $("note-colors").children) b.setAttribute("aria-pressed", String(b.dataset.color === note.color));
      $("note-conflict").hidden = !store.conflict(selected);
    }
  }
  function setInert(value) {
    for (const el of document.querySelectorAll(".hud, #here, #legend, #menu, #scene-editor, #panel")) el.inert = value;
  }
  function open(id) {
    beforeOpen();
    if (!opened) returnPosition = { ...walker.position, yaw: walker.yaw, pitch: camera.rotation.x };
    week = world.rooms.some(r => r.id === id) ? id : "week01";
    page = 0; opened = true; host.hidden = false; root.dataset.notes = "";
    $("notes-button").setAttribute("aria-expanded", "true");
    $("notes-week").value = week; setInert(true); walker.setEnabled(false);
    sculpture.frame(week, camera, walker); refresh(); $("notes-week").focus();
    void store.load();
  }
  function close() {
    if (!opened) return;
    closeNote(); $("notes-login").close(); opened = false; host.hidden = true; delete root.dataset.notes;
    setInert(false); walker.setEnabled(true);
    if (returnPosition) walker.place(returnPosition.x, returnPosition.y, returnPosition.z, returnPosition.yaw, returnPosition.pitch);
    $("notes-button").setAttribute("aria-expanded", "false"); $("notes-button").focus();
    refresh();
    void store.flush();
  }
  function select(id) {
    const note = store.get(id); if (!note) return;
    if (!opened) open(note.week);
    selected = id;
    $("note-label").textContent = world.rooms.find(r => r.id === note.week)?.label || "notes";
    $("note-text").value = note.text; $("note-remove-confirm").hidden = true;
    refresh(); $("note-dialog").showModal();
    if (store.canEdit) $("note-text").focus(); else $("note-done").focus();
  }
  function closeNote() { $("note-dialog").close(); selected = null; void store.flush(); }
  function add() {
    if (!store.canEdit || weekNotes().length >= 24) return;
    const i = weekNotes().length;
    const note = { id: crypto.randomUUID(), week, text: "", color: Object.keys(NOTE_COLORS)[i % 4], x: (i % 3 - 1) * 2.65, y: (Math.floor(i % 6 / 3) === 0 ? 1 : -1) * 1.45, revision: null };
    store.edit(note); page = Math.floor(i / 6); select(note.id);
  }
  $("notes-week").addEventListener("change", () => { week = $("notes-week").value; page = 0; sculpture.frame(week, camera, walker); refresh(); });
  $("notes-close").addEventListener("click", close);
  $("notes-add").addEventListener("click", add); $("notes-first").addEventListener("click", add);
  $("notes-prev").addEventListener("click", () => { page--; refresh(); });
  $("notes-next").addEventListener("click", () => { page++; refresh(); });
  $("notes-retry").addEventListener("click", () => void store.flush());
  $("note-done").addEventListener("click", closeNote);
  $("note-dialog").addEventListener("cancel", e => { e.preventDefault(); closeNote(); });
  $("note-text").addEventListener("input", () => { const note = store.get(selected); if (note) store.edit({ ...note, text: $("note-text").value }); });
  $("note-delete").addEventListener("click", () => { $("note-remove-confirm").hidden = false; $("note-remove-no").focus(); });
  $("note-remove-no").addEventListener("click", () => { $("note-remove-confirm").hidden = true; });
  $("note-remove-yes").addEventListener("click", async () => {
    const removing = selected;
    $("note-remove-yes").disabled = true;
    try { if (await store.remove(removing) && selected === removing) closeNote(); } finally { $("note-remove-yes").disabled = false; }
  });
  for (const [id, keep] of [["note-keep-draft", true], ["note-use-saved", false]]) $(id).addEventListener("click", async () => {
    await store.resolve(selected, keep); const note = store.get(selected); if (note) $("note-text").value = note.text;
  });
  $("notes-auth").addEventListener("click", async () => {
    if (store.canEdit) {
      try { await store.logout(); } catch (error) { $("notes-status").textContent = error.message; }
    } else { $("notes-login-status").textContent = ""; $("notes-login").showModal(); $("notes-key").focus(); }
  });
  $("notes-login-close").addEventListener("click", () => $("notes-login").close());
  $("notes-login-form").addEventListener("submit", async e => {
    e.preventDefault(); const button = e.target.querySelector('[type="submit"]'); button.disabled = true;
    try { await store.login($("notes-key").value); $("notes-key").value = ""; $("notes-login").close(); }
    catch (error) { $("notes-login-status").textContent = error.message; }
    finally { button.disabled = false; }
  });
  // Capture before the walker's canvas handlers. Notes can be dragged only in
  // notes mode; a normal swim click opens the same close-up editor.
  canvas.addEventListener("pointerdown", e => {
    if (!opened || e.button !== 0) return;
    e.stopImmediatePropagation();
    const id = sculpture.pick(e, camera); if (!id) return;
    const note = store.get(id), point = sculpture.point(e, camera, week);
    if (!point) return;
    drag = { id, clientX: e.clientX, clientY: e.clientY, x: note.x, y: note.y, point, moved: false, pointerId: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  }, { capture: true });
  canvas.addEventListener("pointermove", e => {
    if (!opened) return;
    e.stopImmediatePropagation();
    if (!drag) { canvas.style.cursor = sculpture.pick(e, camera) ? "pointer" : "default"; return; }
    if (e.pointerId !== drag.pointerId || !store.canEdit) return;
    if (Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) < 8 && !drag.moved) return;
    drag.moved = true; canvas.style.cursor = "grabbing";
    const point = sculpture.point(e, camera, week), note = store.get(drag.id);
    if (point && note) {
      // Move the geometry immediately; persist only when the pointer is lifted.
      note.x = Math.max(-6, Math.min(6, drag.x + point.x - drag.point.x));
      note.y = Math.max(-3.5, Math.min(3.5, drag.y + point.y - drag.point.y));
    }
  }, { capture: true });
  function release(e) {
    if (!opened) return;
    e.stopImmediatePropagation();
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { id, moved } = drag; drag = null; canvas.style.cursor = "default";
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (moved) store.edit({ ...store.get(id) });
    else if (e.type === "pointerup") select(id);
  }
  canvas.addEventListener("pointerup", release, { capture: true });
  canvas.addEventListener("pointercancel", release, { capture: true });
  addEventListener("keydown", e => {
    if (!opened) return;
    if (e.key === "Escape") {
      e.stopImmediatePropagation(); e.preventDefault();
      if ($("note-dialog").open) closeNote(); else if ($("notes-login").open) $("notes-login").close(); else close();
    }
  }, { capture: true });
  document.fonts.ready.then(() => { for (const card of sculpture.cards.values()) card.signature = ""; sculpture.sync(store.notes); });
  void store.load();
  return { open, close, get opened() { return opened; },
    resize() { if (opened) sculpture.frame(week, camera, walker); },
    press(e) { const id = sculpture.pick(e, camera); if (id) { select(id); return true; } return false; },
    hover(e) { return Boolean(sculpture.pick(e, camera)); },
    update(dt) {
      if (opened) for (const label of worldLabels) label.visible = false;
      sculpture.update(reducedMotion() ? 0 : dt, camera, opened ? week : null, 0, drag?.id);
    },
  };
}
