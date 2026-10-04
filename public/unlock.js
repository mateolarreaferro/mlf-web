/*
  The password box past the three free model calls. Loaded by the site's
  layout and by the hosted demos (/theo, /headwave, injected by
  `npm run sync:demos`), before anything else calls fetch.

  It wraps fetch. When a same-origin call comes back 401 with x-mlf-locked
  (see spendUse in src/lib/hosted.ts), it asks for the password, sends it to
  /api/unlock, and on success repeats the call, so the page that made it
  never sees the refusal. Closing the box hands the page the original 401,
  whose message says what happened. Calls that arrive locked while the box is
  open wait on the same answer, so "render all" asks once. The same box
  guards moderation of the open wall (/sticky-notes?moderate).

  Site-owned: this is not a copy of anything and the sync does not replace it.
*/
(() => {
  if (window.__mlfUnlock) return;
  window.__mlfUnlock = true;

  const realFetch = window.fetch.bind(window);
  let pending = null;

  const css = `
    .mlf-unlock{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
      padding:16px;background:rgba(20,22,24,.35);font-family:var(--font-inter,Inter),system-ui,sans-serif;
      animation:mlf-in .25s ease-out}
    .mlf-unlock form{width:100%;max-width:340px;padding:24px;border-radius:20px;
      background:var(--paper,#f8f7f4);color:var(--ink,#23282c);box-shadow:0 20px 60px rgba(0,0,0,.25)}
    .mlf-unlock p{margin:0 0 6px;font-size:15px;line-height:1.5}
    .mlf-unlock small{display:block;margin-bottom:16px;font-size:13px;line-height:1.5;color:var(--faint,#656f77)}
    .mlf-unlock input{width:100%;box-sizing:border-box;padding:10px 16px;border:0;border-radius:999px;font:inherit;font-size:14px;
      background:rgba(127,127,127,.14);color:inherit;outline:none}
    .mlf-unlock input:focus-visible{box-shadow:0 0 0 2px var(--accent,#23718f)}
    .mlf-unlock .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
    .mlf-unlock button{padding:7px 16px;border:0;border-radius:999px;font:inherit;font-size:14px;cursor:pointer;
      background:transparent;color:var(--faint,#656f77)}
    .mlf-unlock button[type=submit]{background:var(--ink,#23282c);color:var(--paper,#f8f7f4)}
    .mlf-unlock button:disabled{opacity:.5;cursor:default}
    .mlf-unlock .error{min-height:18px;margin:8px 0 0 4px;font-size:13px;color:#c2412d}
    @keyframes mlf-in{from{opacity:0}}
    @media (prefers-reduced-motion:reduce){.mlf-unlock{animation:none}}`;

  const COPY = {
    uses: ["The three free tries are used up.", "Each one is a real call to the model. If Mateo gave you the password, enter it to keep going."],
    moderate: ["Moderate sticky notes.", "With the site password you can delete any note on the wall."],
  };

  function ask(kind) {
    const [title, detail] = COPY[kind] || COPY.uses;
    return new Promise((resolve) => {
      const root = document.createElement("div");
      root.className = "mlf-unlock";
      root.innerHTML = `<style>${css}</style>
        <form role="dialog" aria-modal="true" aria-labelledby="mlf-unlock-title">
          <p id="mlf-unlock-title"></p>
          <small></small>
          <input type="password" autocomplete="current-password" aria-label="password" placeholder="password" required>
          <div class="error" role="status"></div>
          <div class="row"><button type="button">not now</button><button type="submit">unlock</button></div>
        </form>`;
      root.querySelector("#mlf-unlock-title").textContent = title;
      root.querySelector("small").textContent = detail;
      const form = root.querySelector("form");
      const input = root.querySelector("input");
      const error = root.querySelector(".error");
      const submit = root.querySelector("button[type=submit]");
      const done = (value) => { root.remove(); document.removeEventListener("keydown", onKey, true); resolve(value); };
      const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };

      root.querySelector("button[type=button]").onclick = () => done(false);
      root.addEventListener("mousedown", (e) => { if (e.target === root) done(false); });
      document.addEventListener("keydown", onKey, true);
      form.onsubmit = async (e) => {
        e.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        try {
          const response = await realFetch("/api/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: input.value }),
          });
          if (response.ok) return done(true);
          error.textContent = (await response.json().catch(() => ({}))).error || "That did not work.";
        } catch {
          error.textContent = "Could not reach the site. Try again.";
        }
        submit.disabled = false;
        input.select();
      };
      document.body.appendChild(root);
      input.focus();
    });
  }

  window.fetch = async (input, init) => {
    // A Request's body can be read once; keep a copy so the call can be repeated.
    const request = new Request(input, init);
    const retry = request.clone();
    const response = await realFetch(request);
    const sameOrigin = new URL(request.url).origin === window.location.origin;
    if (!sameOrigin || response.status !== 401 || !response.headers.get("x-mlf-locked")) return response;
    // x-mlf-locked-copy picks the wording: "moderate" for the open wall's moderation.
    if (!pending) pending = ask(response.headers.get("x-mlf-locked-copy")).finally(() => { pending = null; });
    return (await pending) ? realFetch(retry) : response;
  };
})();
