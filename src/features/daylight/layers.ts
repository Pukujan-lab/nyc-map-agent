import type { Map as MapLibreMap } from "maplibre-gl";
import { getAmbient, subscribeAmbient } from "@/lib/ambient";
import { SOURCE_IDS } from "@/lib/map/style";
import { categoryOf, css, mix, NIGHT, parseColor, shade, skyColors, sunFor, type Rgba, type Sun } from "./palette";

/**
 * Time-of-day lighting: recolours the basemap (fill, line, extrusion, labels),
 * sets MapLibre 5 light + sky/fog, adds a warm streetlight wash on roads at
 * night and swaps the city3d facade textures for night versions with random
 * lit windows. Eco mode skips the glow (streetlights, lit windows).
 */
const COLOR_PROPS: Record<string, string[]> = {
  background: ["background-color"],
  fill: ["fill-color"],
  line: ["line-color"],
  "fill-extrusion": ["fill-extrusion-color"],
  symbol: ["text-color", "text-halo-color"],
};
const GLOW_LAYER = "daylight-streetlights";
const FACADES = ["modern", "prewar", "rowhouse", "storefront", "tower", "walkup"].map((f) => `facade-${f}`);

type Saved = { base: unknown; written: string | null };

export function mount(map: MapLibreMap): () => void {
  const own = new Set<string>(Object.values(SOURCE_IDS));
  const saved = new Map<string, Saved>();
  const facadeDay = new Map<string, ImageData>();
  const facadeNight = new Map<string, ImageData>();
  let facadesAt: "day" | "night" = "day";
  let lastKey = "";

  const recolor = (sun: Sun) => {
    const { weather } = getAmbient();
    for (const layer of map.getStyle().layers ?? []) {
      const source = (layer as { source?: string }).source;
      // Our data layers, other features' overlays and the glow keep their own colours.
      if (layer.id === GLOW_LAYER || (source && own.has(source)) || /^(hazards|restrooms|weather)/.test(layer.id)) continue;
      for (const prop of COLOR_PROPS[layer.type] ?? []) {
        const key = `${layer.id}|${prop}`;
        const current = map.getPaintProperty(layer.id, prop);
        let entry = saved.get(key);
        // Someone else (the street palette) changed it since we wrote: new base.
        if (!entry || (typeof current === "string" ? current : JSON.stringify(current)) !== entry.written) {
          entry = { base: current, written: null };
          saved.set(key, entry);
        }
        const cat = categoryOf(layer.id, layer.type, prop);
        let next: string | null = null;
        if (typeof entry.base === "string") {
          const day = parseColor(entry.base);
          if (day) next = css(shade(day, cat, sun, weather));
        } else if ((cat === "text" || cat === "halo") && sun.night > 0.5) {
          next = css(NIGHT[cat]);
        }
        const value = next ?? entry.base;
        if (value === undefined) continue;
        map.setPaintProperty(layer.id, prop, value);
        entry.written = typeof value === "string" ? value : JSON.stringify(value);
      }
    }
  };

  const atmosphere = (sun: Sun) => {
    const { weather, walking } = getAmbient();
    const { sky, horizon } = skyColors(sun, weather);
    const fog = weather === "fog";
    map.setSky({
      "sky-color": css(sky),
      "horizon-color": css(horizon),
      "fog-color": css(horizon),
      "fog-ground-blend": fog ? (walking ? 0.25 : 0.1) : walking ? 0.9 : 0.5,
      "horizon-fog-blend": fog ? 0.95 : walking ? 0.2 : 0.5,
      "sky-horizon-blend": fog ? 0.95 : 0.6,
      "atmosphere-blend": 0,
    });
    const soft = weather === "clear" ? 1 : weather === "fog" ? 0.45 : 0.6;
    const dusk = 1 - Math.abs(2 * sun.night - 1);
    const warm = parseColor("#ffb27a")!;
    const moon = parseColor("#8fa6ff")!;
    const white: Rgba = [255, 255, 255, 1];
    const color = sun.night < 0.5 ? mix(white, warm, dusk) : mix(warm, moon, sun.night * 2 - 1);
    map.setLight({
      anchor: "map",
      color: css(color),
      intensity: (0.5 - 0.3 * sun.night) * soft,
      position: [1.5, sun.azimuthDeg, Math.min(80, Math.max(10, 90 - sun.altitudeDeg))],
    });
  };

  const streetlights = (sun: Sun) => {
    const { eco } = getAmbient();
    const on = sun.night > 0.3 && !eco;
    if (!map.getLayer(GLOW_LAYER)) {
      const roads = (map.getStyle().layers ?? []).find(
        (l) => (l as { "source-layer"?: string })["source-layer"] === "transportation",
      ) as { source?: string } | undefined;
      if (!roads?.source) return;
      const firstSymbol = (map.getStyle().layers ?? []).find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: GLOW_LAYER,
          type: "line",
          source: roads.source,
          "source-layer": "transportation",
          minzoom: 13,
          filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "minor", "trunk"]]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffc46b",
            "line-width": ["interpolate", ["exponential", 2], ["zoom"], 13, 3, 18, 60, 22, 400],
            "line-blur": ["interpolate", ["exponential", 2], ["zoom"], 13, 3, 18, 50, 22, 330],
            "line-opacity": 0,
          },
        },
        firstSymbol,
      );
    }
    map.setPaintProperty(GLOW_LAYER, "line-opacity", on ? 0.28 * Math.min(1, (sun.night - 0.3) / 0.5) : 0);
    map.setLayoutProperty(GLOW_LAYER, "visibility", on ? "visible" : "none");
  };

  const facades = async (sun: Sun) => {
    const want = sun.night > 0.55 && !getAmbient().eco ? "night" : "day";
    if (want === facadesAt || !map.hasImage(FACADES[0])) return;
    facadesAt = want;
    for (const id of FACADES) {
      if (!map.hasImage(id)) continue;
      if (!facadeDay.has(id)) {
        const day = await loadImageData(`/textures/${id}.png`);
        facadeDay.set(id, day);
        facadeNight.set(id, litWindows(day));
      }
      map.updateImage(id, (want === "night" ? facadeNight : facadeDay).get(id)!);
    }
  };

  const apply = (force = false) => {
    const a = getAmbient();
    const sun = sunFor(new Date(), a.lighting);
    const key = `${sun.night.toFixed(2)}|${a.weather}|${a.walking}|${a.eco}|${a.lighting}`;
    void facades(sun).catch(() => {});
    if (!force && key === lastKey) return;
    lastKey = key;
    recolor(sun);
    atmosphere(sun);
    streetlights(sun);
  };

  apply(true);
  const unsub = subscribeAmbient(() => apply(true));
  const timer = window.setInterval(() => apply(), 5_000);
  const onStyle = () => apply(true);
  map.on("style.load", onStyle);
  return () => {
    unsub();
    window.clearInterval(timer);
    map.off("style.load", onStyle);
    if (map.getLayer(GLOW_LAYER)) map.removeLayer(GLOW_LAYER);
  };
}

async function loadImageData(url: string): Promise<ImageData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

/** Night facade: dark walls, window panes found by flood fill, ~45% lit warm. */
export function litWindows(day: ImageData): ImageData {
  const { width: w, height: h, data } = day;
  const out = new ImageData(new Uint8ClampedArray(data), w, h);
  const isPane = (i: number) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b < 95 && b >= r;
  };
  const label = new Int32Array(w * h).fill(-1);
  let n = 0;
  const lit: boolean[] = [];
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== -1 || !isPane(p * 4)) continue;
    // Deterministic per-window "random" so the texture is stable.
    lit[n] = ((Math.sin((n + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.45;
    const stack = [p];
    label[p] = n;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % w, y = (q / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nq = ny * w + nx;
        if (label[nq] === -1 && isPane(nq * 4)) {
          label[nq] = n;
          stack.push(nq);
        }
      }
    }
    n++;
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (label[p] >= 0 && lit[label[p]]) {
      out.data[i] = 255;
      out.data[i + 1] = 205;
      out.data[i + 2] = 120;
    } else {
      out.data[i] = data[i] * 0.2 + 6;
      out.data[i + 1] = data[i + 1] * 0.22 + 10;
      out.data[i + 2] = data[i + 2] * 0.28 + 22;
    }
  }
  return out;
}
