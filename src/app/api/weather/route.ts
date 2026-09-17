import { atmosphereFor, type Weather } from "@/lib/weather-theme";

/*
  Current conditions for wherever the visitor is, with no permission prompt and
  no third-party script on the page.

  Location comes from the edge's own geo headers, which Vercel attaches to every
  request — we never call the browser Geolocation API unasked. That is an
  ISP-level guess: the weather is right for the region, but the city it names
  is often the next town over, so the page says "near <city>" for it.

  A visitor who presses that label can share their exact position, and the
  browser's coordinates then arrive here as ?lat=&lon=. They are already
  rounded to two decimals (~1 km) before they leave the browser; that is enough
  to name the right town, and the name is looked up once a day per rounded
  point. Weather itself is always fetched at one decimal (~11 km), which is
  both a privacy floor and what makes the upstream response cacheable across
  everyone in the same area. Nothing is stored here either way.
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

type Nominatim = {
  address?: Record<string, string | undefined>;
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

function readCoordinate(raw: string | null, limit: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/*
  The town for a point, from OpenStreetMap's Nominatim. zoom=10 asks for the
  city level, so a point in a neighbourhood still comes back as its city. The
  lookup is cached a day per two-decimal point; Nominatim asks to be identified
  and to be called sparingly, and this is both.
*/
async function nameFor(lat: number, lon: number): Promise<string | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&zoom=10&accept-language=en`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "mateolarreaferro.com (weather label)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Nominatim;
    const a = data.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryLat = readCoordinate(searchParams.get("lat"), 90);
  const queryLon = readCoordinate(searchParams.get("lon"), 180);
  const precise = queryLat !== null && queryLon !== null;

  const headerLat = request.headers.get("x-vercel-ip-latitude");
  const headerLon = request.headers.get("x-vercel-ip-longitude");
  const located = precise || (headerLat !== null && headerLon !== null);

  const lat = precise ? queryLat : located ? Number(headerLat) : FALLBACK.lat;
  const lon = precise ? queryLon : located ? Number(headerLon) : FALLBACK.lon;

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
    const [res, city] = await Promise.all([
      fetch(url, { next: { revalidate: 900 } }),
      precise ? nameFor(lat, lon) : Promise.resolve(readCity(request) ?? (located ? null : FALLBACK.city)),
    ]);
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
        precise,
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
