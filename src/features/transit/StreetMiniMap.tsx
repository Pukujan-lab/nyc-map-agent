import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/store/MapStateContext";
import { useDataView } from "@/lib/store/DataViewContext";
import { useWalkingRoute } from "@/lib/api/routing";
import { THEMES, useTheme } from "@/lib/theme";
import { EYE_HEIGHT_M, lookTarget } from "@/lib/map/walk";
import { useNow, useTransitData } from "./hooks";
import { estimateTrain, type StaticSystem, type Vehicle } from "./model";
import { northAngle, project, unproject, type MiniView } from "./miniMap";

/** Metres from the walker to the rim. */
const RADIUS_M = 260;
const STREET_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "pedestrian", "path"]);

/** A theme CSS variable (`h s% l%`) as a canvas colour. */
function cssVar(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const [h, s, l] = v.split(/\s+/);
  return h && s && l ? `hsla(${h}, ${s}, ${l}, ${alpha})` : `rgba(17,24,39,${alpha})`;
}

/** The walker's own spot: the map centre floats up to 10 m ahead of the eye at street level. */
function eyeOf(map: MaplibreMap): { lon: number; lat: number } {
  const c = map.getCenter();
  const { ahead } = lookTarget(map.getPitch(), EYE_HEIGHT_M);
  const b = (map.getBearing() * Math.PI) / 180;
  return {
    lon: c.lng - (ahead * Math.sin(b)) / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
    lat: c.lat - (ahead * Math.cos(b)) / 111_320,
  };
}

function streets(map: MaplibreMap): Array<{ c: number[][]; major: boolean }> {
  const out: Array<{ c: number[][]; major: boolean }> = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
    const cls = String(f.properties?.class);
    if (!STREET_CLASSES.has(cls) || f.properties?.brunnel === "tunnel") continue;
    const major = cls === "primary" || cls === "secondary" || cls === "trunk" || cls === "motorway";
    const g = f.geometry;
    if (g.type === "LineString") out.push({ c: g.coordinates, major });
    else if (g.type === "MultiLineString") for (const c of g.coordinates) out.push({ c, major });
  }
  return out;
}

/**
 * Street view's mini map: a heading-up disc in the corner with the walker's
 * spot and heading chevron, the streets, nearby subway lines, stations and
 * live trains, the walking route glowing, and an N on the rim. Colours come
 * from the theme. Tap a point to stand there.
 */
export default function StreetMiniMap() {
  const { current } = useMap();
  const map = current?.getMap();
  const { startWalk } = useMapState();
  const { routeStart, routeEnd } = useDataView();
  const route = useWalkingRoute(routeStart, routeEnd).data;
  const theme = useTheme();
  const sub = useTransitData(["subway"]).subway;
  const now = useNow();
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<MiniView | null>(null);
  const roads = useRef<ReturnType<typeof streets>>([]);
  const trains = useRef<Vehicle[]>([]);
  const stat = useRef<StaticSystem | undefined>(undefined);
  stat.current = sub?.stat;
  const routeLine = useRef<number[][] | null>(null);
  routeLine.current = route?.coordinates ?? null;
  const draw = useRef<() => void>(() => {});

  useEffect(() => {
    const st = sub?.stat;
    trains.current = st && sub?.live ? sub.live.trips.flatMap((t) => estimateTrain(st, t, now) ?? []) : [];
    draw.current();
  }, [sub?.stat, sub?.live, now]);

  useEffect(() => {
    if (!map) return;
    const el = canvas.current;
    if (!el) return;
    const t = THEMES[theme];
    draw.current = () => {
      const size = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(size * dpr)) { el.width = Math.round(size * dpr); el.height = Math.round(size * dpr); }
      const ctx = el.getContext("2d");
      if (!ctx || !size) return;
      const r = size / 2;
      const v: MiniView = { ...eyeOf(map), bearing: map.getBearing(), radiusM: RADIUS_M, radiusPx: r - 6 };
      view.current = v;
      const P = (c: number[]) => project(v, c[0], c[1]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(r, r);
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.fillStyle = t.land;
      ctx.fill();
      ctx.clip();
      const line = (c: number[][]) => {
        ctx.beginPath();
        c.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
        ctx.stroke();
      };
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of roads.current) { ctx.strokeStyle = t.label_; ctx.globalAlpha = 0.35; ctx.lineWidth = s.major ? 7 : 5; line(s.c); }
      ctx.globalAlpha = 1;
      for (const s of roads.current) { ctx.strokeStyle = s.major ? t.major : t.street; ctx.lineWidth = s.major ? 5 : 3; line(s.c); }
      const st = stat.current;
      if (st) {
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        for (const f of st.lines.features) {
          const c = f.geometry.coordinates;
          if (!c.some((p) => P(p).d < RADIUS_M * 1.6)) continue;
          ctx.strokeStyle = f.properties.color;
          ctx.setLineDash(f.properties.grade === "underground" ? [4, 3] : []);
          line(c);
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (routeLine.current) {
        const glow = cssVar("--primary");
        ctx.save();
        ctx.shadowColor = glow;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = cssVar("--primary", 0.45);
        ctx.lineWidth = 9;
        line(routeLine.current);
        ctx.restore();
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3.5;
        line(routeLine.current);
      }
      if (st) {
        for (const f of st.stations.features) {
          const q = P(f.geometry.coordinates);
          if (q.d > RADIUS_M * 1.1) continue;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = cssVar("--foreground");
          ctx.stroke();
        }
      }
      for (const tr of trains.current) {
        const q = P([tr.lon, tr.lat]);
        if (q.d > RADIUS_M * 1.1) continue;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = tr.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = t.dark ? "#000" : "#fff";
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(r, r);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 8);
      ctx.lineTo(0, 3);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fillStyle = cssVar("--primary");
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = cssVar("--border");
      ctx.stroke();
      const a = northAngle(v.bearing);
      const nx = Math.sin(a) * (r - 11), ny = -Math.cos(a) * (r - 11);
      ctx.beginPath();
      ctx.arc(nx, ny, 9, 0, Math.PI * 2);
      ctx.fillStyle = cssVar("--card");
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = cssVar("--primary");
      ctx.stroke();
      ctx.fillStyle = cssVar("--foreground");
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", nx, ny + 0.5);
      ctx.restore();
    };
    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw.current(); }); };
    const reload = () => { roads.current = streets(map); schedule(); };
    reload();
    map.on("move", schedule);
    map.on("moveend", reload);
    map.on("idle", reload);
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", schedule);
      map.off("moveend", reload);
      map.off("idle", reload);
    };
  }, [map, theme]);

  useEffect(() => { draw.current(); }, [route, sub?.stat]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = view.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
    if (Math.hypot(x, y) > rect.width / 2) return;
    startWalk(unproject(v, x, y));
  };

  return (
    <canvas
      ref={canvas}
      data-testid="street-minimap"
      role="button"
      aria-label="Mini map, heading up. Tap a point to jump there"
      onPointerUp={onTap}
      className="pointer-events-auto absolute bottom-32 right-3 z-30 h-[120px] w-[120px] cursor-crosshair rounded-full shadow-xl sm:bottom-10 sm:h-[168px] sm:w-[168px]"
    />
  );
}
