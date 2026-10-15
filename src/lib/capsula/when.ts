/*
  Moments in Spanish, for the capsule's "last seen": "hace 3 días", "ayer",
  "hace unos minutos". Pure, so the admin panel (a client component) and the
  capsule page (a server one) share it.
*/

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `at` was, in words. */
export function ago(at: number, now = Date.now()): string {
  const d = Math.max(0, now - at);
  if (d < 2 * MINUTE) return "hace un momento";
  if (d < HOUR) return `hace ${Math.floor(d / MINUTE)} minutos`;
  if (d < 2 * HOUR) return "hace una hora";
  if (d < DAY) return `hace ${Math.floor(d / HOUR)} horas`;
  const days = Math.floor(d / DAY);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "hace una semana";
  if (days < 30) return `hace ${weeks} semanas`;
  const months = Math.floor(days / 30);
  if (months === 1) return "hace un mes";
  if (days < 365) return `hace ${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? "hace un año" : `hace ${years} años`;
}

/** "3 de octubre de 2026, 14:05". */
export const onDate = (at: number) =>
  new Date(at).toLocaleString("es", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
