import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { GuidedRoute, RouteStep } from "./steps";
import { splitAt } from "./steps";

/**
 * Navigation styling on the shared MapLibre map (no three.js, no deck.gl):
 * a glowing route (blurred wide line + crisp core) with the walked part dimmed,
 * chevrons along the line (symbol-placement line), a big turn arrow lying on
 * the ground at the next maneuver, and the user's chevron puck with an
 * accuracy halo. Colours come from CSS variables so every theme (including
 * the time-of-day theme) repaints them: `--nav-route`, `--nav-glow`, falling
 * back to `--primary`.
 */
const SRC = { route: "nav-route", turn: "nav-turn", puck: "nav-puck" } as const;
const LAYERS = {
  glow: "nav-route-glow",
  walked: "nav-route-walked",
  core: "nav-route-core",
  chevrons: "nav-route-chevrons",
  turn: "nav-turn-arrow",
  halo: "nav-puck-halo",
  puck: "nav-puck",
} as const;
const IMG = { chevron: "nav-chevron", turn: "nav-turn", puck: "nav-puck" } as const;

interface NavColors {
  route: string;
  glow: string;
  ink: string;
}

function cssColor(name: string, fallbackVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const s = getComputedStyle(document.documentElement);
  const v = s.getPropertyValue(name).trim() || s.getPropertyValue(fallbackVar).trim();
  if (!v) return fallback;
  // shadcn tokens are bare "H S% L%" triples.
  return /^\d/.test(v) ? `hsl(${v.replace(/ /g, ", ")})` : v;
}

export function readNavColors(): NavColors {
  return {
    route: cssColor("--nav-route", "--primary", "#38bdf8"),
    glow: cssColor("--nav-glow", "--primary", "#38bdf8"),
    ink: cssColor("--nav-ink", "--primary-foreground", "#ffffff"),
  };
}

function canvas(size: number, draw: (c: CanvasRenderingContext2D) => void): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.canvas.width = ctx.canvas.height = size;
  draw(ctx);
  return ctx.getImageData(0, 0, size, size);
}

/** ">" pointing right: symbol-placement line points an icon's +x along the line. */
const chevron = (ink: string) =>
  canvas(48, (c) => {
    c.strokeStyle = ink;
    c.lineWidth = 9;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(16, 10);
    c.lineTo(32, 24);
    c.lineTo(16, 38);
    c.stroke();
  });

/** A big arrow pointing up (north before rotation). */
const turnArrow = (fill: string, ink: string) =>
  canvas(128, (c) => {
    c.fillStyle = fill;
    c.strokeStyle = ink;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(64, 6);
    c.lineTo(118, 62);
    c.lineTo(84, 62);
    c.lineTo(84, 122);
    c.lineTo(44, 122);
    c.lineTo(44, 62);
    c.lineTo(10, 62);
    c.closePath();
    c.fill();
    c.stroke();
  });

/** Navigation puck: a chevron pointing up, in a ring. */
const puckIcon = (fill: string, ink: string) =>
  canvas(64, (c) => {
    c.beginPath();
    c.arc(32, 32, 28, 0, Math.PI * 2);
    c.fillStyle = ink;
    c.fill();
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(32, 9);
    c.lineTo(51, 50);
    c.lineTo(32, 40);
    c.lineTo(13, 50);
    c.closePath();
    c.fill();
  });

const empty = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

function putImage(map: MapLibreMap, id: string, img: ImageData | null): void {
  if (!img) return;
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, img, { pixelRatio: 2 });
}

/** Adds (or re-adds after a style reload) every navigation source and layer. */
export function installNavLayers(map: MapLibreMap, colors: NavColors): void {
  setPlainRouteVisible(map, false);
  putImage(map, IMG.chevron, chevron(colors.ink));
  putImage(map, IMG.turn, turnArrow(colors.route, colors.ink));
  putImage(map, IMG.puck, puckIcon(colors.route, colors.ink));
  // Sources last-in-first-checked: `nav-puck` existing means the set is installed.
  for (const id of [SRC.route, SRC.turn]) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty() });
  }
  // Widths grow with zoom so the ribbon keeps a street-scale width at eye level.
  const width = (base: number) =>
    ["interpolate", ["exponential", 2], ["zoom"], 12, base, 22, base * 24] as unknown as number;
  const add = (layer: Parameters<MapLibreMap["addLayer"]>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };
  add({
    id: LAYERS.walked,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "part"], "walked"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.route, "line-opacity": 0.3, "line-width": width(2.5) },
  });
  add({
    id: LAYERS.glow,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "part"], "ahead"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.glow, "line-opacity": 0.45, "line-width": width(9), "line-blur": width(6) },
  });
  add({
    id: LAYERS.core,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "part"], "ahead"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.route, "line-width": width(3.5) },
  });
  add({
    id: LAYERS.chevrons,
    type: "symbol",
    source: SRC.route,
    filter: ["==", ["get", "part"], "ahead"],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 14, 80, 22, 700] as unknown as number,
      "icon-image": IMG.chevron,
      "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 14, 0.35, 22, 2.2] as unknown as number,
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  add({
    id: LAYERS.turn,
    type: "symbol",
    source: SRC.turn,
    layout: {
      "icon-image": IMG.turn,
      "icon-rotate": ["get", "bearing"],
      "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 15, 0.4, 22, 4] as unknown as number,
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  if (!map.getSource(SRC.puck)) map.addSource(SRC.puck, { type: "geojson", data: empty() });
  add({
    id: LAYERS.halo,
    type: "circle",
    source: SRC.puck,
    paint: {
      "circle-color": colors.glow,
      "circle-opacity": 0.18,
      "circle-blur": 0.4,
      // Halo grows with GPS inaccuracy: `accuracyPx` is set per update.
      "circle-radius": ["get", "accuracyPx"],
      "circle-pitch-alignment": "map",
    },
  });
  add({
    id: LAYERS.puck,
    type: "symbol",
    source: SRC.puck,
    filter: ["==", ["get", "showPuck"], true],
    layout: {
      "icon-image": IMG.puck,
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

/** The plain Directions line steps aside while the glowing one is shown. */
const PLAIN_ROUTE = ["walk-route-casing", "walk-route-line"];
function setPlainRouteVisible(map: MapLibreMap, visible: boolean): void {
  for (const id of PLAIN_ROUTE) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export function removeNavLayers(map: MapLibreMap): void {
  for (const id of Object.values(LAYERS)) if (map.getLayer(id)) map.removeLayer(id);
  setPlainRouteVisible(map, true);
  for (const id of Object.values(SRC)) if (map.getSource(id)) map.removeSource(id);
}

interface NavFrame {
  route: GuidedRoute;
  along: number;
  next: RouteStep | null;
  puck: { lon: number; lat: number; bearing: number; accuracyM: number; show: boolean } | null;
}

/** Pixels per metre at a latitude and zoom (Web Mercator, 512 px tiles). */
function pxPerMetre(lat: number, zoom: number): number {
  return (512 * 2 ** zoom) / (40_075_016.686 * Math.cos((lat * Math.PI) / 180));
}

export function updateNavLayers(map: MapLibreMap, f: NavFrame): void {
  const [walked, ahead] = splitAt(f.route.coordinates, f.along);
  const line = (part: string, coordinates: Array<[number, number]>): GeoJSON.Feature => ({
    type: "Feature",
    properties: { part },
    geometry: { type: "LineString", coordinates },
  });
  map.getSource<GeoJSONSource>(SRC.route)?.setData({
    type: "FeatureCollection",
    features: [line("walked", walked), line("ahead", ahead)],
  });
  map.getSource<GeoJSONSource>(SRC.turn)?.setData(
    f.next && f.next.type !== "arrive"
      ? {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { bearing: f.next.bearingAfter }, geometry: { type: "Point", coordinates: f.next.location } },
          ],
        }
      : empty(),
  );
  const p = f.puck;
  map.getSource<GeoJSONSource>(SRC.puck)?.setData(
    p
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                bearing: p.bearing,
                showPuck: p.show,
                accuracyPx: Math.min(400, Math.max(14, p.accuracyM * pxPerMetre(p.lat, map.getZoom()))),
              },
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            },
          ],
        }
      : empty(),
  );
}

/** The basemap street name under a point, for the street pill when the step has none. */
export function roadNameAt(map: MapLibreMap, lon: number, lat: number): string {
  const p = map.project([lon, lat]);
  const hits = map.queryRenderedFeatures(
    [
      [p.x - 24, p.y - 24],
      [p.x + 24, p.y + 24],
    ],
  );
  for (const h of hits) {
    if (h.geometry.type !== "LineString" && h.geometry.type !== "MultiLineString") continue;
    // Streets only: transit lines carry station names, not the street you are on.
    if (!/road|street|transportation/i.test(`${h.sourceLayer ?? ""} ${h.layer.id}`)) continue;
    const props = (h.properties ?? {}) as Record<string, unknown>;
    const name = props["name:en"] ?? props.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}
