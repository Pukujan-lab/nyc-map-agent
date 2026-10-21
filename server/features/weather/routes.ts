import { z } from "zod";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { cached, getJson, NWS_HEADERS } from "../../lib/ttlCache";

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
