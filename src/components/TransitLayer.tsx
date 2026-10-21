import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import type { Map as MaplibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { Accessibility, Navigation2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  bodyPolygon,
  estimateTrain,
  stationOf,
  viaductPolygons,
  VIADUCT_TOP,
  type StaticSystem,
  type SystemId,
  type Vehicle,
} from "@/lib/transit/model";
import { useAlerts, useBuses, useStarred, useTransitData, useTransitMeta, useTransitToggles } from "@/lib/transit/hooks";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, usePanelChip, usePanelSearch, type SearchProvider } from "@/lib/store/PanelContext";
import { setFollowed, useFollowed } from "@/lib/transit/follow";
import { SYSTEM_LABELS } from "@/lib/transit/model";
import { StationDetails, VehicleDetails } from "./TransitCard";
import { TransitStatusDetails } from "./TransitStatus";

/** Layers a click on the map should hand to transit instead of the area pick. */
export const TRANSIT_CLICK_LAYERS = ["transit-vehicle-2d", "transit-vehicle-3d", "transit-vehicle-xray", "transit-access", "transit-entrance", "transit-station"];
export function hitsTransit(map: MaplibreMap, point: { x: number; y: number }): boolean {
  const layers = TRANSIT_CLICK_LAYERS.filter((id) => map.getLayer(id));
  return layers.length > 0 && map.queryRenderedFeatures([point.x, point.y], { layers }).length > 0;
}

const MAX_VEHICLES = 400;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const ICONS: Record<string, { node: JSX.Element; sdf: boolean }> = {
  "transit-arrow": { node: <Navigation2 fill="#fff" color="#fff" strokeWidth={1.5} size={48} />, sdf: true },
  "transit-access": { node: <Accessibility color="#2563eb" strokeWidth={2.5} size={40} />, sdf: false },
  "transit-wrench": { node: <Wrench color="#f59e0b" strokeWidth={2.5} size={40} />, sdf: false },
};

function addIcon(map: MaplibreMap, id: string) {
  const def = ICONS[id];
  if (!def || map.hasImage(id)) return;
  const img = new Image(48, 48);
  img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { sdf: def.sdf, pixelRatio: 2 }); };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderToStaticMarkup(def.node))}`;
}

/** Slice of a route shape between two stops, for marking planned work on the exact segment. */
function shapeSlice(sys: StaticSystem, route: string, stops: string[]): GeoJSON.Position[] | null {
  const shape = sys.shapes[route], sm = sys.stopM[route];
  if (!shape || !sm) return null;
  const ms = stops.map((s) => sm[stationOf(sys.system, s)]).filter((m): m is number => m !== undefined);
  if (ms.length < 2) return null;
  const lo = Math.min(...ms), hi = Math.max(...ms);
  const c = shape.c.filter((_, i) => shape.m[i] >= lo && shape.m[i] <= hi);
  return c.length > 1 ? c : null;
}

const AGENCY: Record<string, SystemId> = { MTASBWY: "subway", LI: "lirr", MNR: "mnr" };

/**
 * Live MTA transit, drawn by MapLibre itself: lines (underground runs glow,
 * elevated runs get a viaduct deck in 3D), stations, street entrances at
 * street level, planned-work wrenches, and vehicles — oriented arrows in 2D,
 * extruded bodies in 3D (on the viaduct when elevated, x-ray when underground).
 */
export function TransitLayer() {
  const { current } = useMap();
  const map = current?.getMap();
  const { tilted, walking } = useMapState();
  const three = tilted || walking;
  const { on, set, panelOpen, setPanelOpen } = useTransitToggles();
  const { content, showPanel } = usePanel();
  const meta = useTransitMeta();
  const rail = (["subway", "lirr", "mnr"] as SystemId[]).filter((s) => on.has(s));
  const busOn = on.has("bus") && meta.data?.bus === true;
  const data = useTransitData(rail);
  const buses = useBuses(busOn);
  const alerts = useAlerts(rail.length > 0 || panelOpen);
  const stars = useStarred();
  // The panel owns what is open; a vehicle stays "selected" while its panel is up.
  const selectedKey = content?.id.startsWith("transit:vehicle:") ? content.id.slice(16) : undefined;
  const followedKey = useFollowed();
  const following = followedKey !== null && followedKey === selectedKey;
  useEffect(() => { if (followedKey && followedKey !== selectedKey) setFollowed(null); }, [followedKey, selectedKey]);
  const display = useRef(new Map<string, Vehicle>());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const openStation = useCallback(
    (system: SystemId, id: string, name: string) =>
      showPanel({ id: `transit:station:${system}:${id}`, title: name, subtitle: `${SYSTEM_LABELS[system]} station`, details: <StationDetails system={system} id={id} /> }),
    [showPanel],
  );
  useEffect(() => {
    if (!panelOpen) return;
    showPanel({ id: "transit:status", title: "Service status", subtitle: "Live MTA feeds, refreshed every 15 s", details: <TransitStatusDetails /> });
    setPanelOpen(false);
  }, [panelOpen, showPanel, setPanelOpen]);
  const anyOn = on.size > 0;
  const toggleChip = useCallback(() => {
    if (anyOn) (["subway", "lirr", "mnr", "bus"] as const).forEach((id) => set(id, false));
    else set("subway", true);
  }, [anyOn, set]);
  usePanelChip({ id: "transit", label: "Transit", active: anyOn, onToggle: toggleChip });

  // Icons, including after a style swap.
  useEffect(() => {
    if (!map) return;
    const missing = (e: { id: string }) => addIcon(map, e.id);
    Object.keys(ICONS).forEach((id) => addIcon(map, id));
    map.on("styleimagemissing", missing);
    return () => { map.off("styleimagemissing", missing); };
  }, [map]);

  const statics = rail.map((s) => data[s]?.stat).filter((s): s is StaticSystem => Boolean(s));
  const staticKey = statics.map((s) => s.system).join(",");
  const lines = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: statics.flatMap((s) => s.lines.features.map((f) => ({ ...f, properties: { ...f.properties, system: s.system } }))),
  }), [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: statics.flatMap((s) => s.stations.features.map((f) => ({ ...f, properties: { ...f.properties, system: s.system } }))),
  }), [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const viaduct = useMemo(() => viaductPolygons(lines as StaticSystem["lines"]), [lines]);
  const entrances = data.subway?.stat?.entrances ?? EMPTY;

  // Planned work: wrenches on affected stations; reroutes and planned work get an
  // amber overlay on the exact segment and a ring on each skipped stop.
  // Elevator / escalator outages get an accessibility marker on the station.
  const work = useMemo(() => {
    const points: GeoJSON.Feature[] = [], segs: GeoJSON.Feature[] = [], skips: GeoJSON.Feature[] = [], access: GeoJSON.Feature[] = [];
    const stationPos = new Map(stations.features.map((f) => [`${f.properties!.system}:${f.properties!.id}`, f]));
    for (const a of alerts.data?.alerts ?? []) {
      if (a.kind !== "planned" && !a.reroute) continue;
      const sys = statics.find((s) => s.system === AGENCY[a.agency]);
      if (!sys) continue;
      const seen = new Set<string>();
      for (const stop of a.stops) {
        const key = `${sys.system}:${stationOf(sys.system, stop)}`;
        const st = stationPos.get(key);
        if (!st || seen.has(key)) continue;
        seen.add(key);
        if (a.kind === "planned") points.push({ type: "Feature", properties: { id: a.id }, geometry: st.geometry });
        if (a.reroute) skips.push({ type: "Feature", properties: { ...st.properties }, geometry: st.geometry });
      }
      for (const r of a.routes) {
        const c = shapeSlice(sys, r, a.stops);
        if (c) segs.push({ type: "Feature", properties: { id: a.id }, geometry: { type: "LineString", coordinates: c } });
      }
    }
    const accessSeen = new Set<string>();
    for (const o of alerts.data?.outages ?? []) {
      for (const stop of o.stops) {
        const st = stationPos.get(`subway:${stationOf("subway", stop)}`);
        if (!st || accessSeen.has(String(st.properties!.id))) continue;
        accessSeen.add(String(st.properties!.id));
        access.push({ type: "Feature", properties: { ...st.properties }, geometry: st.geometry });
      }
    }
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    return { points: fc(points), segs: fc(segs), skips: fc(skips), access: fc(access) };
  }, [alerts.data, stations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchStations = useCallback<SearchProvider>(
    (q) => {
      const needle = q.trim().toLowerCase();
      if (needle.length < 2) return [];
      return stations.features
        .filter((f) => String(f.properties!.name).toLowerCase().includes(needle))
        .slice(0, 6)
        .map((f) => {
          const p = f.properties!;
          const system = p.system as SystemId;
          return {
            id: `transit:${system}:${p.id}`,
            label: `${p.name} (${system === "subway" ? p.routes : SYSTEM_LABELS[system]})`,
            kind: "Station",
            onSelect: () => {
              map?.flyTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: Math.max(map.getZoom(), 15) });
              openStation(system, String(p.id), String(p.name));
            },
          };
        });
    },
    [stations, map, openStation],
  );
  usePanelSearch("transit-stations", rail.length ? searchStations : null);

  // Targets: recompute estimated positions once a second (they are a function of time),
  // culled to the padded viewport and capped.
  const targets = useRef<Vehicle[]>([]);
  useEffect(() => {
    if (!map) return;
    const tick = () => {
      const now = Date.now() / 1000;
      const b = map.getBounds();
      const padLon = (b.getEast() - b.getWest()) * 0.2, padLat = (b.getNorth() - b.getSouth()) * 0.2;
      const inView = (v: Vehicle) => v.lon > b.getWest() - padLon && v.lon < b.getEast() + padLon && v.lat > b.getSouth() - padLat && v.lat < b.getNorth() + padLat;
      const out: Vehicle[] = [];
      for (const s of rail) {
        const st = data[s]?.stat, lv = data[s]?.live;
        if (!st || !lv) continue;
        for (const trip of lv.trips) {
          const v = estimateTrain(st, trip, now);
          if (v && (inView(v) || v.key === selectedKey)) out.push(v);
        }
      }
      for (const bus of buses.data?.buses ?? []) {
        const v: Vehicle = { key: `bus:${bus.id}`, system: "bus", route: bus.route, label: bus.route, color: "#0039A6", lon: bus.lon, lat: bus.lat, bearing: bus.bearing ?? 0, grade: "grade", dir: bus.dir, nextStop: bus.next ?? undefined };
        if (inView(v) || v.key === selectedKey) out.push(v);
      }
      const c = map.getCenter();
      out.sort((a, z) => Math.hypot(a.lon - c.lng, a.lat - c.lat) - Math.hypot(z.lon - c.lng, z.lat - c.lat));
      targets.current = out.slice(0, MAX_VEHICLES);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [map, rail.join(","), data, buses.data, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tween displayed positions and headings toward the targets (~20 fps).
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 50) return;
      last = t;
      const next = new Map<string, Vehicle>();
      for (const v of targets.current) {
        const d = display.current.get(v.key);
        if (!d || Math.hypot(d.lon - v.lon, d.lat - v.lat) > 0.01) { next.set(v.key, v); continue; }
        let db = ((v.bearing - d.bearing + 540) % 360) - 180;
        if (Math.abs(db) > 150) db = 0; // shape end flip
        next.set(v.key, { ...v, lon: d.lon + (v.lon - d.lon) * 0.15, lat: d.lat + (v.lat - d.lat) * 0.15, bearing: (d.bearing + db * 0.2 + 360) % 360 });
      }
      display.current = next;
      setVehicles([...next.values()]);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const vehicleFc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: vehicles.map((v) => ({ type: "Feature", properties: { key: v.key, color: v.color, bearing: v.bearing, grade: v.grade, label: v.label }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })),
  }), [vehicles]);
  const bodies = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!three) return EMPTY;
    return {
      type: "FeatureCollection",
      features: vehicles.map((v) => {
        const base = v.grade === "elevated" ? VIADUCT_TOP : v.grade === "underground" ? 0 : 0.3;
        const bus = v.system === "bus";
        return {
          type: "Feature",
          properties: { key: v.key, color: v.color, grade: v.grade, base, top: base + (bus ? 3.2 : 3.8) },
          geometry: bodyPolygon(v.lon, v.lat, v.bearing, bus ? 12 : 20, bus ? 2.6 : 3),
        };
      }),
    };
  }, [vehicles, three]);

  // Follow mode: ease the camera onto the tweened vehicle; drag or Esc exits.
  const followed = following ? vehicles.find((v) => v.key === selectedKey) : undefined;
  useEffect(() => {
    if (!map || !followed) return;
    map.easeTo({ center: [followed.lon, followed.lat], bearing: three ? followed.bearing : map.getBearing(), duration: 250, easing: (t) => t });
  }, [map, followed, three]);
  useEffect(() => {
    if (!map || !following) return;
    const stop = () => setFollowed(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    map.on("dragstart", stop);
    window.addEventListener("keydown", key);
    return () => { map.off("dragstart", stop); window.removeEventListener("keydown", key); };
  }, [map, following]);

  // Clicks on transit features.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapLayerMouseEvent) => {
      const layers = TRANSIT_CLICK_LAYERS.filter((id) => map.getLayer(id));
      const f = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : undefined;
      if (!f?.properties) return;
      if (f.layer.id.startsWith("transit-vehicle")) {
        const key = String(f.properties.key);
        const [system] = key.split(":");
        showPanel({ id: `transit:vehicle:${key}`, title: `${SYSTEM_LABELS[system as SystemId] ?? "Bus"} ${f.properties.label ?? ""}`.trim(), subtitle: "Live vehicle", details: <VehicleDetails vehicleKey={key} /> });
      } else {
        // Entrances carry the station's GTFS id, so they open the same card.
        const system = (f.layer.id === "transit-entrance" ? "subway" : f.properties.system) as SystemId;
        openStation(system, String(f.properties.id), String(f.properties.name));
      }
      setFollowed(null);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, openStation, showPanel]);

  // Notices for alerts touching starred lines or stations (in-app + optional browser).
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (!alerts.data || !stars.starred.length) return;
    for (const a of alerts.data.alerts) {
      const sys = AGENCY[a.agency];
      if (!sys || a.kind === "notice" || notified.current.has(a.id)) continue;
      const hit = a.routes.some((r) => stars.isStarred(`${sys}:line:${r}`)) || a.stops.some((s) => stars.isStarred(`${sys}:station:${stationOf(sys, s)}`));
      if (!hit) continue;
      notified.current.add(a.id);
      toast(a.kind === "planned" ? "Planned work on a starred line" : "Delay on a starred line", { description: a.text });
      if (stars.notify && "Notification" in window && Notification.permission === "granted") new Notification("NYC transit", { body: a.text });
    }
  }, [alerts.data, stars]);

  if (!rail.length && !busOn) return null;

  const hide2d = three;
  return (
    <>
      <Source id="transit-lines" type="geojson" data={lines}>
        <Layer id="transit-line-under-glow" type="line" filter={["==", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 14], "line-blur": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 10], "line-opacity": 0.3 }} />
        <Layer id="transit-line-under" type="line" filter={["==", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.5], "line-opacity": 0.7 }} />
        <Layer id="transit-line" type="line" filter={["!=", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 4] }} />
      </Source>
      <Source id="transit-work-segs" type="geojson" data={work.segs}>
        <Layer id="transit-work-line" type="line" paint={{ "line-color": "#f59e0b", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6], "line-dasharray": [1, 1.5], "line-opacity": 0.85 }} />
      </Source>
      <Source id="transit-viaduct" type="geojson" data={three ? viaduct : EMPTY}>
        <Layer id="transit-viaduct" type="fill-extrusion" minzoom={13}
          paint={{ "fill-extrusion-color": "#8b8f94", "fill-extrusion-base": VIADUCT_TOP - 1.5, "fill-extrusion-height": VIADUCT_TOP, "fill-extrusion-opacity": 0.9 }} />
      </Source>
      <Source id="transit-stations" type="geojson" data={stations}>
        <Layer id="transit-station" type="circle" minzoom={11}
          paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 1.5, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 6] }} />
      </Source>
      <Source id="transit-entrances" type="geojson" data={walking ? entrances : EMPTY}>
        <Layer id="transit-entrance" type="circle"
          paint={{ "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-radius": 7, "circle-pitch-alignment": "viewport" }} />
      </Source>
      <Source id="transit-work-points" type="geojson" data={work.points}>
        <Layer id="transit-work" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-wrench", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [18, -18], "icon-allow-overlap": true }} />
      </Source>
      <Source id="transit-skips" type="geojson" data={work.skips}>
        <Layer id="transit-skip" type="circle" minzoom={11}
          paint={{ "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#f59e0b", "circle-stroke-width": 2.5, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 11] }} />
      </Source>
      <Source id="transit-access" type="geojson" data={work.access}>
        <Layer id="transit-access" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-access", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [-18, -18], "icon-allow-overlap": true }} />
      </Source>
      <Source id="transit-vehicles" type="geojson" data={hide2d ? EMPTY : vehicleFc}>
        <Layer id="transit-vehicle-2d" type="symbol"
          layout={{ "icon-image": "transit-arrow", "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 16, 0.6] }}
          paint={{ "icon-color": ["get", "color"], "icon-halo-color": "#111827", "icon-halo-width": 1, "icon-opacity": ["case", ["==", ["get", "grade"], "underground"], 0.55, 1] }} />
      </Source>
      <Source id="transit-bodies" type="geojson" data={bodies}>
        <Layer id="transit-vehicle-3d" type="fill-extrusion" filter={["!=", ["get", "grade"], "underground"]}
          paint={{ "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.95 }} />
        <Layer id="transit-vehicle-xray" type="fill-extrusion" filter={walking ? ["==", ["get", "grade"], "__never"] : ["==", ["get", "grade"], "underground"]}
          paint={{ "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": 0, "fill-extrusion-height": 1.2, "fill-extrusion-opacity": 0.35 }} />
      </Source>
    </>
  );
}
