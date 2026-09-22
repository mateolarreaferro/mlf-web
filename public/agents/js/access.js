// This records a tab's chosen view, never a password or permission. The server
// still validates the HttpOnly editor session on every note write.
const KEY = "agents-entry-role";
export const accessRole = () => document.documentElement.dataset.access || "guest";
export function rememberedRole() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function chooseRole(role, notify = true) {
  document.documentElement.dataset.access = role;
  try { sessionStorage.setItem(KEY, role); } catch { /* entry works without storage */ }
  if (notify) dispatchEvent(new CustomEvent("agents:access", { detail: role }));
}
