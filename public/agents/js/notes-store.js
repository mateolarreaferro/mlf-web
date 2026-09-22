// Saved notes live on the server. Only unfinished drafts live in this browser.
// Each note has a revision; two devices cannot silently overwrite each other.
import { accessRole, chooseRole } from "./access.js";
const API = "/api/weekly-notes";
const DRAFTS = "agents-weekly-note-drafts-v1";
export function createNotesStore(onChange) {
  const notes = new Map(), pending = new Map(), saving = new Map(), conflicts = new Map();
  let ready = false, canEdit = false, privateNotes = false, message = "loading notes…", timer;
  let recovered = false;
  const emit = () => onChange();
  function stash() {
    try { localStorage.setItem(DRAFTS, JSON.stringify([...pending.values()])); }
    catch { message = "Draft backup unavailable. Keep this tab open until saved."; }
  }
  async function request(body) {
    const res = await fetch(API, { method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true } : {}),
      signal: AbortSignal.timeout(20000) });
    let data;
    try { data = await res.json(); } catch { throw new Error("Notes are available on mateolarreaferro.com."); }
    if (!res.ok) throw Object.assign(new Error(data.error || "Couldn’t save. Your draft is still here."), { status: res.status, data });
    return data;
  }
  async function load() {
    try {
      const data = await request();
      ready = data.ready; canEdit = data.canEdit && accessRole() === "editor"; privateNotes = data.private;
      if (privateNotes && !canEdit) data.notes = [];
      for (const note of data.notes) if (!pending.has(note.id)) notes.set(note.id, note);
      for (const id of notes.keys()) if (!pending.has(id) && !data.notes.some(n => n.id === id)) notes.delete(id);
      message = ready ? (pending.size ? "unsaved" : canEdit ? "saved" : "") : "Notes are available on mateolarreaferro.com.";
      if (canEdit && !recovered) {
        recovered = true;
        let drafts = [];
        try { drafts = JSON.parse(localStorage.getItem(DRAFTS) || "[]"); } catch { /* storage may be blocked */ }
        if (Array.isArray(drafts)) for (const draft of drafts) {
          if (!draft?.id || typeof draft.text !== "string" || !["save", "delete"].includes(draft.action)) continue;
          pending.set(draft.id, draft);
          const current = notes.get(draft.id);
          if (draft.action === "delete" && !current) { pending.delete(draft.id); continue; }
          // A response can be lost after a successful write: recognize that
          // content, instead of presenting the already-saved draft as a conflict.
          if (current && draft.action === "save" && ["week", "text", "color", "x", "y"].every(k => current[k] === draft[k])) {
            pending.delete(draft.id); continue;
          }
          if ((current?.revision ?? null) !== draft.revision) conflicts.set(draft.id, current ?? null);
          if (draft.action === "save") notes.set(draft.id, draft);
          // Keep a failed removal visible so its conflict can be resolved.
          else notes.set(draft.id, current || draft);
        }
        stash();
        if (pending.size) message = "Recovered unsaved drafts.";
      }
    } catch (error) { message = error.message; }
    emit();
  }
  function edit(note) {
    if (!canEdit) return;
    const draft = { ...note, action: "save" };
    notes.set(note.id, draft); pending.set(note.id, draft); stash();
    message = "unsaved"; emit();
    clearTimeout(timer); timer = setTimeout(flush, 900);
  }
  async function save(id) {
    if (saving.has(id)) return saving.get(id);
    if (!pending.has(id) || conflicts.has(id)) return;
    const operation = (async () => {
      while (pending.has(id) && !conflicts.has(id)) {
        const draft = pending.get(id);
        message = "saving…"; emit();
        try {
          const { note } = await request(draft);
          const newer = pending.get(id);
          if (newer === draft) {
            pending.delete(id);
            if (note) notes.set(id, note); else notes.delete(id);
          } else if (newer) {
            // Typing continued during the request. Keep that text, advance only
            // its base revision, then send it after this request has finished.
            newer.revision = note?.revision ?? null;
          }
          stash(); message = pending.size ? "unsaved" : "saved";
        } catch (error) {
          if (error.status === 409 && "current" in (error.data ?? {})) conflicts.set(id, error.data.current);
          if (error.status === 401) canEdit = false;
          message = error.status ? error.message : "Couldn’t save. Your draft is still here."; emit(); return;
        }
        emit();
      }
    })();
    saving.set(id, operation);
    try { await operation; } finally { saving.delete(id); }
  }
  async function flush() { clearTimeout(timer); await Promise.all([...pending.keys()].map(save)); }
  async function remove(id) {
    await save(id);
    if (pending.has(id) || conflicts.has(id)) return false;
    const note = notes.get(id);
    if (!note || !canEdit) return false;
    pending.set(id, { ...note, action: "delete" }); stash();
    await save(id);
    return !pending.has(id);
  }
  async function resolve(id, keepDraft) {
    if (!conflicts.has(id)) return;
    const current = conflicts.get(id);
    conflicts.delete(id);
    if (keepDraft) {
      pending.get(id).revision = current?.revision ?? null;
      await save(id);
    } else {
      pending.delete(id);
      if (current) notes.set(id, current); else notes.delete(id);
      message = "loaded saved note";
    }
    stash(); emit();
  }
  async function login(key) { await request({ action: "login", key }); chooseRole("editor", false); await load(); }
  async function logout() {
    await flush();
    if (pending.size) throw new Error("Save or resolve your drafts before signing out.");
    await request({ action: "logout" }); chooseRole("guest", false); canEdit = false; recovered = false; notes.clear(); await load();
  }
  addEventListener("beforeunload", e => { if (pending.size) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) void flush(); });
  addEventListener("online", () => void flush());
  addEventListener("agents:access", () => void load());
  return { load, edit, flush, remove, login, logout, resolve,
    get notes() { return [...notes.values()]; }, get ready() { return ready; }, get canEdit() { return canEdit; },
    get private() { return privateNotes; }, get message() { return message; }, get pending() { return pending.size; },
    conflict: id => conflicts.has(id), get: id => notes.get(id) };
}
