/*
  The way in: the splash (Splash.tsx) and the first-visit tour (Tour.tsx).

  The splash plays once per tab session and only when the visit starts on the
  home page. Whether it plays has to be known before first paint, or a reload
  flashes the page and then covers it, so INTRO_SCRIPT (inlined in layout.tsx
  after BOOT_SCRIPT) sets html[data-splash="seen"] from sessionStorage and
  globals.css hides the overlay on that. Entering anywhere else counts as
  having seen it. The attribute outlives client navigations, so coming back
  to "/" from a thought never replays it.

  The tour runs once per browser (localStorage) after the splash lifts, and
  again whenever the nav's "tour" asks for it.
*/
export const SPLASH_KEY = "mlf:splash";
export const TOURED_KEY = "mlf:toured";
/* set by the nav's "tour" when it has to navigate home first */
export const TOUR_NOW_KEY = "mlf:tour-now";

export const SPLASH_DONE_EVENT = "mlf:splash-done";
export const TOUR_EVENT = "mlf:tour";

export const INTRO_SCRIPT = `(function(){try{var s=sessionStorage,k=${JSON.stringify(
  SPLASH_KEY,
)};if(location.pathname!=="/")s.setItem(k,"1");if(s.getItem(k))document.documentElement.dataset.splash="seen"}catch(e){document.documentElement.dataset.splash="seen"}})()`;

export function splashSeen(): boolean {
  return document.documentElement.dataset.splash === "seen";
}

export function markSplashSeen(): void {
  document.documentElement.dataset.splash = "seen";
  try {
    sessionStorage.setItem(SPLASH_KEY, "1");
  } catch {}
  window.dispatchEvent(new Event(SPLASH_DONE_EVENT));
}

export function toured(): boolean {
  try {
    return localStorage.getItem(TOURED_KEY) !== null;
  } catch {
    // no storage, no memory: better never than every visit
    return true;
  }
}

export function markToured(): void {
  try {
    localStorage.setItem(TOURED_KEY, String(Date.now()));
  } catch {}
}
