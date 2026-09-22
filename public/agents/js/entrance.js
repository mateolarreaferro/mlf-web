import { chooseRole, rememberedRole } from "./access.js";

export function createEntrance({ sound, loadWorld, onEnter }) {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const splash = $("entrance"), environment = $("environment"), form = $("entrance-form");
  let busy = false, chosen = false, loadingWorld = null, worldReady = false, launched = false, withSound = false;
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
  function choose(role) {
    chooseRole(role); chosen = true;
    $("entrance-code").value = ""; form.hidden = true; $("entrance-actions").hidden = true;
    $("entrance-launch").hidden = false; $("entrance-audio").focus({ preventScroll: true });
  }
  function finish() {
    if (!worldReady || !launched || !isOpen() || withSound && sound.state !== "on") return;
    splash.hidden = true; environment.inert = false; delete root.dataset.entering;
    onEnter();
    ($("notes-button").disabled ? $("menu-button") : $("notes-button")).focus({ preventScroll: true });
  }
  function renderLoading() {
    const s = sound.state, p = sound.progress;
    $("entrance-audio").disabled = launched && withSound && (s === "loading" || s === "starting");
    $("entrance-audio").setAttribute("aria-pressed", String(s === "on"));
    $("entrance-audio-label").textContent = s === "unavailable" ? "retry sound" : launched && withSound ? s === "ready" ? "tap to start sound" : "loading sound…" : "enter with sound";
    $("entrance-quiet").textContent = launched ? "continue quietly" : "enter quietly";
    $("entrance-load-status").textContent = !launched ? "headphones recommended" : !worldReady ? "forming the world…" : withSound ? s === "unavailable" ? "Sound couldn’t load. Retry or enter quietly." : s === "ready" ? "One more tap to start sound." : p.label : "ready";
    $("entrance-progress").hidden = !launched || !withSound || s === "unavailable";
    if (p.total) { $("entrance-progress").max = p.total; $("entrance-progress").value = p.completed; }
    else $("entrance-progress").removeAttribute("value");
    finish();
  }
  function launch(audio) {
    if (!chosen) return;
    launched = true; withSound = audio;
    // The actual AudioContext is resumed within this click, before loading.
    if (audio) sound.enable(); else sound.silence();
    renderLoading();
    if (!loadingWorld) loadingWorld = new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))).then(loadWorld).then(() => {
      worldReady = true; renderLoading();
    }).catch(() => {
      loadingWorld = null;
      $("entrance-load-status").textContent = "Couldn’t load the world. Please try again.";
      $("entrance-audio").disabled = false;
    });
    finish();
  }
  function pending(value) {
    busy = value;
    for (const id of ["entrance-guest", "entrance-editor", "entrance-submit", "entrance-back"]) $(id).disabled = value;
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
    try { await request({ action: "logout" }); } catch { /* static/offline guest mode remains available */ }
    pending(false); choose("guest");
  });
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return;
    pending(true); $("entrance-status").textContent = "checking code…";
    try {
      const key = $("entrance-code").value.trim().replace(/^WEEKLY_NOTES_EDIT_KEY\s*=\s*/, "");
      await request({ action: "login", key });
      const session = await request();
      if (!session.canEdit) throw new Error("Couldn’t confirm editor access. Please try again.");
      choose("editor");
    } catch (error) { $("entrance-status").textContent = error.message; $("entrance-code").focus(); }
    finally { pending(false); }
  });
  $("entrance-audio").addEventListener("click", () => launch(true));
  $("entrance-quiet").addEventListener("click", () => launch(false));
  sound.onChange(renderLoading);
  const remembered = rememberedRole();
  if (remembered === "guest") choose("guest");
  else if (remembered === "editor") void request().then(session => {
    if (isOpen() && !busy && !chosen && session.canEdit) choose("editor");
  }).catch(() => {});
  return { get open() { return isOpen(); } };
}
