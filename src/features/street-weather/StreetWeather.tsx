import { AlertTriangle, Cloud, CloudFog, CloudRain, CloudSnow, Snowflake, Sun, Thermometer, Umbrella, Wind } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import SunCalc from "suncalc";
import { useAmbient } from "@/lib/ambient";
import { getMapInstance } from "@/lib/map/mapInstance";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import {
  atmosphere,
  coarsen,
  forecastHour,
  headsUpFacts,
  nyHour,
  precipitation,
  recommend,
  type Advice,
  type HourWeather,
} from "@/lib/weather/street";
import { startPrecip, type PrecipHandle } from "./precipCanvas";
import { api } from "@/lib/api/client";

/**
 * Street weather: while you are in street view, the forecast hour (the
 * planned trip's departure, else now) is drawn as rain, snow or sleet over
 * the street with an overcast or fog tint, plus a small heads-up chip with
 * one plain recommendation. Reduced motion, Eco mode and Weather "Off" get
 * the tint only.
 */

interface HourResponse {
  hour: HourWeather;
  alerts: string[];
}

const POLL_MS = 10 * 60_000;

/* ---------- dev-only override: ?streetWeather=rain|snow|sleet|fog|clear[:0..1] or window.__streetWeather("snow", 0.8) ---------- */

type Forced = { kind: "rain" | "snow" | "sleet" | "fog" | "clear"; intensity: number } | null;

function parseForced(spec: string | null): Forced {
  const [kind, n] = (spec ?? "").split(":");
  if (!["rain", "snow", "sleet", "fog", "clear"].includes(kind)) return null;
  const v = Number(n);
  return { kind: kind as NonNullable<Forced>["kind"], intensity: Number.isFinite(v) && n ? v : 0.7 };
}

/** A made-up hour for the override, so the chip and the rules run on it too. */
function forcedHour(f: NonNullable<Forced>, time: string): HourWeather {
  const base: HourWeather = { time: `${time}:00`, tempC: 14, feelsLikeC: 12, precipPct: 0, precipMm: 0, windKmh: 12, gustKmh: 20, code: 1, cloudPct: 20, visibilityM: 20000 };
  switch (f.kind) {
    case "rain": return { ...base, code: 63, precipPct: 90, precipMm: 8 * f.intensity, cloudPct: 100, visibilityM: 6000 };
    case "snow": return { ...base, tempC: -2, feelsLikeC: -7, code: 73, precipPct: 90, precipMm: 3 * f.intensity, cloudPct: 100, visibilityM: 2500 };
    case "sleet": return { ...base, tempC: 0, feelsLikeC: -4, code: 67, precipPct: 85, precipMm: 5 * f.intensity, cloudPct: 100, visibilityM: 4000 };
    case "fog": return { ...base, code: 45, cloudPct: 100, visibilityM: 300 };
    default: return base;
  }
}

function useForced(): Forced {
  const [forced, setForced] = useState<Forced>(() => (import.meta.env.DEV ? parseForced(new URLSearchParams(location.search).get("streetWeather")) : null));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __streetWeather?: (kind: string | null, intensity?: number) => void };
    w.__streetWeather = (kind, intensity) => setForced(kind ? parseForced(`${kind}:${intensity ?? ""}`) : null);
    return () => {
      delete w.__streetWeather;
    };
  }, []);
  return forced;
}

/* ---------- data: one forecast hour for the ~1 km cell under the street view ---------- */

function useCell(active: boolean): string | null {
  const [cell, setCell] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const map = getMapInstance();
    if (!map) return;
    const update = () => {
      const c = map.getCenter();
      const { lat, lon } = coarsen(c.lat, c.lng);
      setCell(`${lat.toFixed(2)},${lon.toFixed(2)}`);
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [active]);
  return cell;
}

function useNowHour(): string {
  const [hour, setHour] = useState(() => nyHour(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setHour(nyHour(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return hour;
}

function useHour(cell: string | null, at: string): HourResponse | null {
  const [data, setData] = useState<HourResponse | null>(null);
  useEffect(() => {
    if (!cell) return;
    const [lat, lon] = cell.split(",");
    const ctrl = new AbortController();
    const load = () =>
      api
        .GET("/api/weather/hour", { params: { query: { lat: Number(lat), lon: Number(lon), at } }, signal: ctrl.signal })
        .then(({ data: d }) => d && setData(d as unknown as HourResponse))
        .catch(() => {
          /* keep the last hour */
        });
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(t);
    };
  }, [cell, at]);
  return data;
}

/* ---------- view ---------- */

const ADVICE_ICON: Record<Advice["kind"], typeof Sun> = {
  ice: Snowflake,
  heat: Thermometer,
  snow: CloudSnow,
  rain: Umbrella,
  cold: Thermometer,
  wind: Wind,
  fine: Sun,
};

function skyIcon(h: HourWeather) {
  const p = precipitation(h.code, h.precipMm, h.tempC);
  if (p.type === "snow" || p.type === "sleet") return CloudSnow;
  if (p.type === "rain") return CloudRain;
  if (h.code === 45 || h.code === 48) return CloudFog;
  return (h.cloudPct ?? 0) > 60 ? Cloud : Sun;
}

function isNight(lighting: string): boolean {
  if (lighting === "night") return true;
  if (lighting === "day") return false;
  return SunCalc.getPosition(new Date(), 40.7549, -73.984).altitude < 0;
}

export default function StreetWeather() {
  const { walking, eco, weatherMode, lighting, tripDepart } = useAmbient();
  const reduced = usePrefersReducedMotion();
  const forced = useForced();
  const nowHour = useNowHour();
  const at = forecastHour(tripDepart, nowHour);
  const cell = useCell(walking && !forced);
  const live = useHour(walking && !forced ? cell : null, at);
  const data = useMemo<HourResponse | null>(() => (forced ? { hour: forcedHour(forced, at), alerts: [] } : live), [forced, at, live]);

  const precip = useMemo(() => (data ? precipitation(data.hour.code, data.hour.precipMm, data.hour.tempC) : { type: "none" as const, intensity: 0 }), [data]);
  const air = data ? atmosphere(data.hour.cloudPct, data.hour.visibilityM, data.hour.code) : { overcast: 0, fog: 0 };
  const animate = walking && !reduced && !eco && weatherMode !== "off" && precip.type !== "none";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<PrecipHandle | null>(null);
  useEffect(() => {
    if (!animate || !canvasRef.current) return;
    const h = startPrecip(canvasRef.current, precip);
    handle.current = h;
    if (import.meta.env.DEV) (window as unknown as { __streetWeatherFps?: () => number }).__streetWeatherFps = h.fps;
    return () => {
      h.stop();
      handle.current = null;
    };
    // Start once per animate toggle; intensity changes go through set() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);
  useEffect(() => handle.current?.set(precip), [precip]);

  if (!walking || !data) return null;

  // Grey for cloud, whiter for fog and snow; darker at night. Static, so reduced motion keeps it.
  const night = isNight(lighting);
  const wet = precip.type === "none" ? 0 : precip.intensity;
  const alpha = Math.min(0.5, air.overcast * 0.1 + air.fog * 0.35 + wet * 0.12);
  const tint = precip.type === "snow" || air.fog > 0.4 ? (night ? "120,128,140" : "225,230,236") : night ? "20,26,36" : "110,120,135";
  const advice = recommend(data.hour, data.alerts);
  const AdviceIcon = ADVICE_ICON[advice.kind];
  const Sky = skyIcon(data.hour);
  const isTrip = at !== nowHour;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5] transition-[background-color] duration-1000"
        style={{ backgroundColor: `rgba(${tint},${alpha.toFixed(3)})` }}
        data-testid="street-weather-tint"
      />
      {animate ? <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-[6] h-full w-full" data-testid="street-weather-precip" /> : null}
      <div className="pointer-events-none absolute left-3 top-[7.5rem] z-30 max-w-[min(18rem,calc(100%-1.5rem))] sm:top-24" role="status" aria-live="polite">
        <div className="rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AdviceIcon className="h-4 w-4 shrink-0" aria-hidden />
            {advice.text}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
            <Sky className="h-3.5 w-3.5" aria-hidden />
            <span>{isTrip ? `At ${data.hour.time.slice(11, 16)} (your trip)` : "This hour"}</span>
            {headsUpFacts(data.hour).map((f) => (
              <span key={f}>· {f}</span>
            ))}
          </div>
          {data.alerts.map((a) => (
            <div key={a} className="mt-1 flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {a}
            </div>
          ))}
          {forced ? <div className="mt-1 text-[10px] text-muted-foreground">Dev override: {forced.kind}</div> : null}
        </div>
      </div>
    </>
  );
}
