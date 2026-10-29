import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { cached, getJson, NWS_HEADERS } from "../../lib/ttlCache";
import { coarsen, nyHour, type HourWeather } from "../../../src/lib/weather/street";

/**
 * GET /api/weather?lat=&lon= : current conditions for the map's area.
 * Open-Meteo (free, keyless, WMO codes); the US National Weather Service is
 * the fallback. Cached ~10 min per lat/lon rounded to 0.05° (~5 km).
 */
export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow";
export interface Weather {
  kind: WeatherKind;
  code: number | null;
  tempC: number | null;
  source: "open-meteo" | "nws";
}

/** WMO 4677 codes as Open-Meteo reports them. */
export function kindFromWmo(code: number): WeatherKind {
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if (code >= 2) return "cloudy";
  return "clear";
}

export function kindFromText(text: string): WeatherKind {
  const t = text.toLowerCase();
  if (/snow|sleet|flurr|ice/.test(t)) return "snow";
  if (/rain|shower|drizzle|thunder|storm/.test(t)) return "rain";
  if (/fog|mist|haze|smoke/.test(t)) return "fog";
  if (/cloud|overcast/.test(t)) return "cloudy";
  return "clear";
}

const OpenMeteo = z.object({ current: z.object({ temperature_2m: z.number(), weather_code: z.number() }) });
const NwsPoint = z.object({ properties: z.object({ observationStations: z.string() }) });
const NwsStations = z.object({ features: z.array(z.object({ id: z.string() })).min(1) });
const NwsObs = z.object({
  properties: z.object({ textDescription: z.string().nullable(), temperature: z.object({ value: z.number().nullable() }) }),
});

async function openMeteo(lat: number, lon: number): Promise<Weather> {
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: "temperature_2m,weather_code" });
  const { current } = OpenMeteo.parse(await getJson(`https://api.open-meteo.com/v1/forecast?${q}`));
  return { kind: kindFromWmo(current.weather_code), code: current.weather_code, tempC: current.temperature_2m, source: "open-meteo" };
}

async function nws(lat: number, lon: number): Promise<Weather> {
  const point = NwsPoint.parse(await getJson(`https://api.weather.gov/points/${lat},${lon}`, NWS_HEADERS));
  const stations = NwsStations.parse(await getJson(point.properties.observationStations, NWS_HEADERS));
  const obs = NwsObs.parse(await getJson(`${stations.features[0].id}/observations/latest`, NWS_HEADERS));
  return {
    kind: kindFromText(obs.properties.textDescription ?? ""),
    code: null,
    tempC: obs.properties.temperature.value,
    source: "nws",
  };
}

export const Query = z.object({ lat: z.coerce.number().min(39).max(42), lon: z.coerce.number().min(-75.5).max(-72.5) });

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const lat = Math.round(q.lat * 20) / 20;
  const lon = Math.round(q.lon * 20) / 20;
  try {
    const weather = await cached(`weather:${lat},${lon}`, 10 * 60_000, () =>
      openMeteo(lat, lon).catch(() => nws(lat, lon)),
    );
    return json(weather, { maxAge: 600, browserMaxAge: 300 });
  } catch (err) {
    return fail(err);
  }
}

/* ---------- GET /api/weather/hour: one forecast hour + active alerts, for street level ---------- */

const series = z.array(z.number().nullable());
const Hourly = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: series,
    apparent_temperature: series,
    precipitation_probability: series,
    precipitation: series,
    weather_code: series,
    wind_speed_10m: series,
    wind_gusts_10m: series,
    cloud_cover: series,
    visibility: series,
  }),
});
type HourlyData = z.infer<typeof Hourly>["hourly"];
const AlertList = z.object({ features: z.array(z.object({ properties: z.object({ event: z.string() }) })) });

/** The forecast row for `hour` ("YYYY-MM-DDTHH"), else the current hour, else the first. */
export function pickHour(h: HourlyData, hour: string, now = nyHour(new Date())): HourWeather {
  let i = h.time.findIndex((t) => t.startsWith(hour));
  if (i < 0) i = h.time.findIndex((t) => t.startsWith(now));
  if (i < 0) i = 0;
  return {
    time: h.time[i],
    tempC: h.temperature_2m[i] ?? 0,
    feelsLikeC: h.apparent_temperature[i],
    precipPct: h.precipitation_probability[i] ?? 0,
    precipMm: h.precipitation[i],
    windKmh: h.wind_speed_10m[i],
    gustKmh: h.wind_gusts_10m[i],
    code: h.weather_code[i],
    cloudPct: h.cloud_cover[i],
    visibilityM: h.visibility[i],
  };
}

export const HourQuery = Query.extend({
  /** New York local time "YYYY-MM-DDTHH[:mm]"; omitted means now. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}/).optional(),
});

export async function GET_HOUR(request: Request): Promise<Response> {
  const q = parseQuery(HourQuery, request.url);
  if (q instanceof Response) return q;
  // About 1 km: a forecast needs no more, and the outside services never see the exact spot.
  const { lat, lon } = coarsen(q.lat, q.lon);
  try {
    const [hourly, alerts] = await Promise.all([
      cached(`weather-hourly:${lat},${lon}`, 10 * 60_000, async () => {
        const p = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover,visibility",
          timezone: "America/New_York",
          forecast_days: "7",
        });
        return Hourly.parse(await getJson(`https://api.open-meteo.com/v1/forecast?${p}`)).hourly;
      }),
      cached(`weather-alerts:${lat},${lon}`, 5 * 60_000, async () =>
        AlertList.parse(await getJson(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, NWS_HEADERS)).features.map((f) => f.properties.event),
      ).catch(() => [] as string[]),
    ]);
    const hour = pickHour(hourly, (q.at ?? nyHour(new Date())).slice(0, 13));
    return json({ hour, alerts: [...new Set(alerts)].slice(0, 3) }, { maxAge: 600, browserMaxAge: 300 });
  } catch (err) {
    return fail(err);
  }
}
