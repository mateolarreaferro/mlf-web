/* the settings: every change is saved at once and every open tab follows */
const $ = (id) => document.getElementById(id);
const shown = {
  perMinute: (v) => `${v}/min`,
  size: (v) => `${v}px`,
  opacity: (v) => `${Math.round(v * 100)}%`,
};

chrome.storage.sync.get(PERIPHERY_DEFAULTS, (s) => {
  const on = $("on");
  const paint = () => {
    on.setAttribute("aria-pressed", String(s.on));
    on.textContent = s.on ? "on" : "off";
  };
  paint();
  on.addEventListener("click", () => {
    s.on = !s.on;
    paint();
    chrome.storage.sync.set({ on: s.on });
  });

  $("corner").value = s.corner;
  $("corner").addEventListener("change", (e) => chrome.storage.sync.set({ corner: e.target.value }));

  for (const key of ["perMinute", "size", "opacity"]) {
    const input = $(key);
    const value = $(key + "V");
    input.value = s[key];
    value.textContent = shown[key](s[key]);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      value.textContent = shown[key](v);
      chrome.storage.sync.set({ [key]: v });
    });
  }
});
