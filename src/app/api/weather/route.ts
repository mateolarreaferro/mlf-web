import { atmosphereFor, type Weather } from "@/lib/weather-theme";

/*
  Current conditions for wherever the visitor is, with no permission prompt and
  no third-party script on the page.

  Location comes from the edge's own geo headers, which Vercel attaches to every
  request — we never call the browser Geolocation API. Coordinates are rounded
  to one decimal (~11 km) before they leave this function, which is both a
  privacy floor and what makes the upstream response cacheable across everyone
  in the same area. Nothing is stored.
*/

const FALLBACK = { lat: 37.4, lon: -122.1, city: "Palo Alto" };

type OpenMeteo = {
  current?: {
    temperature_2m?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
};

/* Vercel percent-encodes the city header ("San%20Francisco"). */
function readCity(request: Request): string | null {
  const raw = request.headers.get("x-vercel-ip-city");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(request: Request) {
  const headerLat = request.headers.get("x-vercel-ip-latitude");
  const headerLon = request.headers.get("x-vercel-ip-longitude");

  const located = headerLat !== null && headerLon !== null;
  const lat = located ? Number(headerLat) : FALLBACK.lat;
  const lon = located ? Number(headerLon) : FALLBACK.lon;
  const city = readCity(request) ?? (located ? null : FALLBACK.city);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ ok: false, reason: "bad-coordinates" }, { status: 200 });
  }

  // one decimal: coarse enough to be anonymous, sharp enough for weather
  const qLat = lat.toFixed(1);
  const qLon = lon.toFixed(1);

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${qLat}&longitude=${qLon}` +
    `&current=temperature_2m,cloud_cover,wind_speed_10m,is_day&timezone=UTC`;

  try {
    // one upstream call per area per 15 minutes, shared by every visitor there
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);

    const data = (await res.json()) as OpenMeteo;
    const c = data.current;
    if (!c || typeof c.temperature_2m !== "number") {
      throw new Error("no current conditions");
    }

    const weather: Weather = {
      temperature: c.temperature_2m,
      cloudCover: c.cloud_cover ?? 50,
      windSpeed: c.wind_speed_10m ?? 0,
      isDay: c.is_day !== 0,
    };

    return Response.json(
      {
        ok: true,
        located,
        city,
        weather,
        atmosphere: atmosphereFor(weather),
      },
      // the browser may hold onto this briefly; it changes on the hour at most
      { headers: { "cache-control": "public, max-age=600" } },
    );
  } catch {
    // the page has a perfectly good default — never fail loudly over decoration
    return Response.json({ ok: false, reason: "upstream" }, { status: 200 });
  }
}
