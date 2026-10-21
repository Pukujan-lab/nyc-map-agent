import { useEffect, useRef } from "react";
import type { ExpressionSpecification, Map as MaplibreMap } from "maplibre-gl";
import { WORLD } from "@/lib/map/transitFocus";

const VEIL = "follow-xray-veil";
const TUNNEL = "follow-xray-tunnel";
const STATIONS = "follow-xray-stations";
/** Building opacity while the followed train is underground (the x-ray look). */
const XRAY_BUILDINGS = 0.12;

/** The theme's foreground colour as an HSL string, so the ground veil follows the theme. */
function themeInk(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
  const [h, s, l] = v.split(/\s+/);
  return h && s && l ? `hsl(${h}, ${s}, ${l})` : "#111827";
}

/**
 * X-ray dressing: with `route`, that line only (follow-train); without it,
 * every underground line and station (the X-ray toggle).
 * veil over the ground, buildings faded, the followed line's tunnel and stations lit. */
export function useXrayDressing(map: MaplibreMap | undefined, route: string | undefined, color: string, on: boolean, u: number) {
  const saved = useRef(new Map<string, unknown>());
  useEffect(() => {
    if (!map) return;
    const before = map.getLayer("transit-line-under") ? "transit-line-under" : undefined;
    if (!map.getSource(VEIL)) map.addSource(VEIL, { type: "geojson", data: WORLD });
    if (!map.getLayer(VEIL)) map.addLayer({ id: VEIL, type: "fill", source: VEIL, paint: { "fill-color": themeInk(), "fill-opacity": 0, "fill-opacity-transition": { duration: 0 } } }, before);
    if (map.getSource("transit-lines") && !map.getLayer(TUNNEL))
      map.addLayer({ id: TUNNEL, type: "line", source: "transit-lines", filter: route ? ["all", ["==", ["get", "route"], route], ["==", ["get", "grade"], "underground"]] : ["==", ["get", "grade"], "underground"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": route ? color : ["get", "color"], "line-width": 7, "line-opacity": 0 } });
    if (map.getSource("transit-stations") && !map.getLayer(STATIONS))
      map.addLayer({ id: STATIONS, type: "circle", source: "transit-stations", ...(route ? { filter: ["in", route, ["to-string", ["get", "routes"]]] as ExpressionSpecification } : {}), paint: { "circle-radius": route ? 9 : 6, "circle-color": "#ffffff", "circle-stroke-color": route ? color : "#111827", "circle-stroke-width": 3, "circle-opacity": 0, "circle-stroke-opacity": 0 } });
    return () => {
      for (const id of [STATIONS, TUNNEL, VEIL]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(VEIL)) map.removeSource(VEIL);
    };
  }, [map, route, color]);
  // Continuous parts follow the blend every frame-ish.
  useEffect(() => {
    if (!map) return;
    if (map.getLayer(VEIL)) map.setPaintProperty(VEIL, "fill-opacity", 0.62 * u);
    if (map.getLayer(TUNNEL)) map.setPaintProperty(TUNNEL, "line-opacity", u);
    if (map.getLayer(STATIONS)) { map.setPaintProperty(STATIONS, "circle-opacity", u); map.setPaintProperty(STATIONS, "circle-stroke-opacity", u); }
  }, [map, u]);
  // Buildings fade with MapLibre's own paint transition, not a pop.
  useEffect(() => {
    if (!map) return;
    const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && !l.id.startsWith("transit-")).map((l) => l.id);
    for (const id of ids) {
      map.setPaintProperty(id, "fill-extrusion-opacity-transition", { duration: 900, delay: 0 });
      if (on) {
        if (!saved.current.has(id)) saved.current.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
        map.setPaintProperty(id, "fill-extrusion-opacity", XRAY_BUILDINGS);
      } else if (saved.current.has(id)) {
        map.setPaintProperty(id, "fill-extrusion-opacity", saved.current.get(id));
        saved.current.delete(id);
      }
    }
  }, [map, on]);
  useEffect(() => () => {
    if (!map) return;
    for (const [id, v] of saved.current) if (map.getLayer(id)) map.setPaintProperty(id, "fill-extrusion-opacity", v);
    saved.current.clear();
  }, [map]);
}


/** The X-ray toggle without a followed train: every tunnel and station, ground veiled, buildings faded. */
export function XrayView({ map }: { map: MaplibreMap | undefined }) {
  useXrayDressing(map, undefined, "#808183", true, 1);
  return null;
}
