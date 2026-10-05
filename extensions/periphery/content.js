/*
  Periphery's corner on every page: a small breathing circle in a shadow
  root, so the page's styles can't reach it and it can't reach the page.
  It takes no clicks (pointer-events: none), so it never gets in the way;
  the toolbar button turns it on and off and sets it.
*/
(() => {
  if (window.top !== window || document.getElementById("periphery-breath")) return;

  const host = document.createElement("div");
  host.id = "periphery-breath";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: fixed; z-index: 2147483646; pointer-events: none; transition: opacity .6s ease; }
      svg { display: block; filter: drop-shadow(0 4px 14px rgba(0,0,0,.25)); }
      text { font: 500 11px Inter, system-ui, sans-serif; fill: #fff; letter-spacing: .01em; }
    </style>
    <div class="wrap">
      <svg viewBox="-50 -50 100 100">
        <circle r="49" fill="rgb(253,206,99)"/>
        <circle r="44" fill="rgb(91,134,194)"/>
        <circle class="breath" r="20" fill="rgb(253,206,99)"/>
        <circle r="16" fill="#000"/>
        <text class="word" text-anchor="middle" dominant-baseline="central" font-size="6.4">inhale</text>
      </svg>
    </div>`;
  const wrap = root.querySelector(".wrap");
  const svg = root.querySelector("svg");
  const breath = root.querySelector(".breath");
  const word = root.querySelector(".word");
  let settings = { ...PERIPHERY_DEFAULTS };
  let raf = 0;

  const place = () => {
    const s = settings;
    wrap.style.opacity = s.on ? String(s.opacity) : "0";
    svg.setAttribute("width", s.size);
    svg.setAttribute("height", s.size);
    const [v, h] = s.corner.split("-");
    wrap.style.top = v === "top" ? "16px" : "";
    wrap.style.bottom = v === "bottom" ? "16px" : "";
    wrap.style.left = h === "left" ? "16px" : "";
    wrap.style.right = h === "right" ? "16px" : "";
  };

  const frame = () => {
    const b = peripheryBreath(Date.now(), settings.perMinute);
    // between the black centre and the blue edge, as in the piece
    breath.setAttribute("r", (17 + b.fill * 26).toFixed(2));
    if (word.textContent !== b.phase) word.textContent = b.phase;
    raf = requestAnimationFrame(frame);
  };

  // a hidden tab doesn't need to breathe
  const run = () => {
    cancelAnimationFrame(raf);
    if (settings.on && !document.hidden) raf = requestAnimationFrame(frame);
  };

  chrome.storage.sync.get(PERIPHERY_DEFAULTS, (s) => {
    settings = s;
    document.documentElement.appendChild(host);
    place();
    run();
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
    place();
    run();
  });
  document.addEventListener("visibilitychange", run);
})();
