// One shared location for the ecosystem; never the visitor's location.
export async function GET() {
  const url = "https://api.open-meteo.com/v1/forecast?latitude=42.36&longitude=-71.06" +
    "&current=temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day&timezone=UTC&timeformat=unixtime";
  try {
    const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Weather unavailable");
    const { current: c } = await response.json();
    const required = ["time", "temperature_2m", "cloud_cover", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "precipitation", "is_day"];
    if (!c || required.some(key => typeof c[key] !== "number" || !Number.isFinite(c[key])) || Math.abs(Date.now() / 1000 - c.time) > 7200) throw new Error("Weather incomplete or stale");
    return Response.json({ source: "open-meteo", location: "Boston", observedAt: c.time * 1000,
      temperature: c.temperature_2m, cloud: c.cloud_cover, wind: c.wind_speed_10m,
      direction: c.wind_direction_10m, gust: c.wind_gusts_10m, rain: c.precipitation, daylight: c.is_day,
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } });
  } catch {
    // The client keeps evolving, explicitly labelled as a simulation.
    return Response.json({ source: "unavailable", location: "Boston" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
