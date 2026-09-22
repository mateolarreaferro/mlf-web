import { chooseRole, rememberedRole } from "./access.js";

export function createEntrance({ sound, onEnter }) {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const splash = $("entrance"), environment = $("environment"), form = $("entrance-form");
  let busy = false;
  const isOpen = () => root.hasAttribute("data-entering");
  async function request(body) {
    const res = await fetch("/api/weekly-notes", { cache: "no-store", credentials: "same-origin",
      ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000) });
    let data;
    try { data = await res.json(); } catch { throw new Error("Editor access is available on mateolarreaferro.com."); }
    if (!res.ok) throw new Error(res.status === 401 ? "That code isn’t correct." : data.error || "Couldn’t connect. Please try again.");
    return data;
  }
  function enter(role) {
    chooseRole(role);
    splash.hidden = true; environment.inert = false; delete root.dataset.entering;
    $("entrance-code").value = "";
    onEnter(role);
    $("notes-button").disabled ? $("menu-button").focus({ preventScroll: true }) : $("notes-button").focus({ preventScroll: true });
  }
  function pending(value) {
    busy = value;
    for (const id of ["entrance-editor", "entrance-submit", "entrance-back"]) $(id).disabled = value;
    form.setAttribute("aria-busy", String(value));
  }
  $("entrance-editor").addEventListener("click", () => {
    $("entrance-editor").hidden = true; form.hidden = false; $("entrance-status").textContent = ""; $("entrance-code").focus();
  });
  $("entrance-back").addEventListener("click", () => {
    form.hidden = true; $("entrance-code").value = ""; $("entrance-editor").hidden = false; $("entrance-editor").focus();
  });
  $("entrance-guest").addEventListener("click", async () => {
    if (busy) return;
    pending(true);
    // A guest choice also clears an existing server editor session. If this
    // static mirror has no API, guests can still enter the scene normally.
    try { await request({ action: "logout" }); } catch { /* guest mode is always available */ }
    pending(false); enter("guest");
  });
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return;
    pending(true); $("entrance-status").textContent = "checking code…";
    try {
      // Accept a copied env assignment as well as the code alone.
      const key = $("entrance-code").value.trim().replace(/^WEEKLY_NOTES_EDIT_KEY\s*=\s*/, "");
      await request({ action: "login", key });
      const session = await request();
      if (!session.canEdit) throw new Error("Couldn’t confirm editor access. Please try again.");
      enter("editor");
    } catch (error) { $("entrance-status").textContent = error.message; $("entrance-code").focus(); }
    finally { pending(false); }
  });
  const audioButton = $("entrance-audio");
  sound.onChange(state => {
    const on = state === "on";
    audioButton.setAttribute("aria-pressed", String(on));
    audioButton.disabled = !sound.scene || ["starting", "unavailable"].includes(state);
    $("entrance-audio-label").textContent = on ? "audio on" : state === "unavailable" ? "audio unavailable" : state === "starting" ? "starting audio…" : sound.scene ? "enable audio" : "loading audio…";
  });
  audioButton.addEventListener("click", () => {
    if (sound.state === "on" || sound.state === "off") sound.toggle();
    else sound.start();
  });
  const remembered = rememberedRole();
  if (remembered === "guest") enter("guest");
  else if (remembered === "editor") {
    // Reloading this tab preserves the chosen view only while the server
    // session remains valid. New tabs still show both entry choices.
    void request().then(session => {
      if (isOpen() && !busy && session.canEdit) enter("editor");
    }).catch(() => {});
  }
  return { get open() { return isOpen(); } };
}
