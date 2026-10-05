/*
  The breath, shared by the corner and the settings: the same circles as the
  piece on mateolarreaferro.com (src/lib/periphery). Its phase comes from the
  clock, so every tab breathes together.
*/
const PERIPHERY_DEFAULTS = { on: true, corner: "bottom-right", size: 76, perMinute: 6, opacity: 0.9 };

function peripheryBreath(now, perMinute) {
  const period = 60000 / perMinute;
  const theta = ((now % period) / period) * Math.PI * 2;
  // 0 at the bottom of the breath, 1 at the top; in while it rises
  return { fill: (1 - Math.cos(theta)) / 2, phase: Math.sin(theta) >= 0 ? "inhale" : "exhale" };
}
