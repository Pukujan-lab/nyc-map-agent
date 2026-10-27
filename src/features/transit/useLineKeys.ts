import { useEffect, useRef } from "react";
import { Marker, type Map as MaplibreMap } from "maplibre-gl";
import { setSelectedLine } from "@/lib/transit/selectedLine";
import type { StaticSystem, Vehicle } from "./model";
import { lineStops, otherLine, pointAt, shapeM, stepAlong, type LineStop } from "./lineSteps";

const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return Boolean(e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable));
};

function focusMarker(color: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.dataset.testid = "line-focus";
  el.style.cssText = "width:30px;height:30px;pointer-events:none";
  const ring = document.createElement("div");
  ring.style.cssText = `width:30px;height:30px;box-sizing:border-box;border-radius:15px;border:3px solid ${color};box-shadow:0 0 0 5px rgba(255,255,255,0.55)`;
  const tag = document.createElement("div");
  tag.textContent = label;
  tag.style.cssText = "position:absolute;left:36px;top:4px;padding:3px 8px;border-radius:8px;background:rgba(15,23,42,0.92);color:#f1f5f9;font:600 12px Inter,system-ui,sans-serif;white-space:nowrap";
  el.append(ring, tag);
  return el;
}

/**
 * Keys on a picked subway line (owner, 2026-10-27). The arrow that points along
 * the line on screen steps to whatever comes next on it, a train between two
 * stations or else the next station; the arrow across it switches to another
 * line at the focused station. Escape leaves the line (an open card closes first).
 */
export function useLineKeys(map: MaplibreMap | undefined, route: string | null, train: string | null, sys: StaticSystem | undefined, trains: () => Vehicle[], walking: boolean) {
  const focus = useRef<{ id: string | null; m: number } | null>(null);
  const marker = useRef<Marker | null>(null);
  // The station kept when an arrow switches lines, so the new line starts there.
  const carry = useRef<string | null>(null);
  const live = useRef({ train, trains });
  live.current = { train, trains };

  useEffect(() => {
    const kept = carry.current;
    carry.current = null;
    marker.current?.remove();
    marker.current = null;
    focus.current = null;
    if (!route || !sys || !kept) return;
    const m = sys.stopM[route]?.[kept];
    if (m === undefined) return;
    focus.current = { id: kept, m };
    const f = sys.stations.features.find((s) => s.properties.id === kept);
    if (map && f) marker.current = new Marker({ element: focusMarker(sys.routes[route]?.color ?? "#2563eb", f.properties.name) }).setLngLat(f.geometry.coordinates as [number, number]).addTo(map);
  }, [map, route, sys]);

  // A focused train keeps moving: its ring rides along.
  useEffect(() => {
    if (!map || !route) return;
    const id = window.setInterval(() => {
      const f = focus.current;
      if (!f?.id || !marker.current) return;
      const v = live.current.trains().find((t) => t.key === f.id);
      if (v) marker.current.setLngLat([v.lon, v.lat]);
    }, 1000);
    return () => window.clearInterval(id);
  }, [map, route]);

  useEffect(() => () => { marker.current?.remove(); marker.current = null; }, []);

  useEffect(() => {
    if (!map || !route || !sys || walking) return;
    const shape = sys.shapes[route];
    const color = sys.routes[route]?.color ?? "#2563eb";
    const onLine = () => live.current.trains().filter((v) => v.system === "subway" && v.route.replace(/X$/, "") === route);

    const go = (stop: LineStop) => {
      focus.current = { id: stop.id, m: stop.m };
      const label = stop.kind === "train" ? `${route} train` : sys.stations.features.find((s) => s.properties.id === stop.id)?.properties.name ?? "";
      marker.current?.remove();
      marker.current = new Marker({ element: focusMarker(color, label) }).setLngLat(stop.coord).addTo(map);
      setSelectedLine(route, stop.kind === "train" ? stop.id : null);
      map.easeTo({ center: stop.coord, zoom: Math.max(map.getZoom(), 14), duration: 500 });
    };

    const onArrow = (e: KeyboardEvent) => {
      const arrow = ARROWS[e.key];
      if (!arrow || !shape || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      // Ours, not the map's pan.
      e.preventDefault();
      e.stopPropagation();
      const trains = onLine();
      const stops = lineStops(sys, route, trains);
      let at = focus.current;
      if (!at) {
        const t = live.current.train ? trains.find((v) => v.key === live.current.train) : undefined;
        const c = map.getCenter();
        at = t ? { id: t.key, m: shapeM(shape, [t.lon, t.lat]) } : { id: null, m: shapeM(shape, [c.lng, c.lat]) };
      }
      // Which way the line runs on screen here.
      const a = map.project(pointAt(shape, at.m - 150)), b = map.project(pointAt(shape, at.m + 150));
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const along = ((b.x - a.x) * arrow[0] + (b.y - a.y) * arrow[1]) / len;
      // Within 45° of the line steps along it; the arrow across it changes line at the nearest station.
      if (Math.abs(along) < Math.SQRT1_2) {
        const m = at.m;
        const station = stops.filter((s) => s.kind === "station").sort((p, q) => Math.abs(p.m - m) - Math.abs(q.m - m))[0];
        const next = station ? otherLine(sys, station.id, route, arrow[0] + arrow[1] > 0 ? 1 : -1) : null;
        if (next) {
          carry.current = next.station;
          setSelectedLine(next.route);
          return;
        }
      }
      const next = stepAlong(stops, at, along < 0 ? -1 : 1);
      if (next) go(next);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || typing(e.target)) return;
      setSelectedLine(null);
    };
    // Capture, so MapLibre's own arrow-key panning never sees the press; Escape bubbles,
    // after the panel stack has had its chance to close an open card (src/lib/store/PanelContext.tsx).
    window.addEventListener("keydown", onArrow, true);
    window.addEventListener("keydown", onEscape);
    return () => { window.removeEventListener("keydown", onArrow, true); window.removeEventListener("keydown", onEscape); };
  }, [map, route, sys, walking]);
}
