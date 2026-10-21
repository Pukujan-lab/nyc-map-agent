import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import type { Map as MaplibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { Accessibility, Navigation2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  estimateTrain,
  stationOf,
  raisedTrack,
  viaductBays,
  entranceInstances,
  splitRaised,
  type StaticSystem,
  type SystemId,
  type Vehicle,
} from "./model";
import { alertedRoutes, useAlerts, useBusRoute, useBuses, useStarred, useTransitData, useTransitMeta, useTransitToggles, useXrayData } from "./hooks";
import { useXray, xrayPrims } from "./xray";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlag } from "@/lib/flags";
import { usePanel, usePanelChip, usePanelSearch, type SearchProvider } from "@/lib/store/PanelContext";
import { setFollowed, useFollowed } from "./follow";
import { SYSTEM_LABELS } from "./model";
import { StationDetails, VehicleDetails } from "./TransitCard";
import { TransitStatusDetails } from "./TransitStatus";
import { lineOpacity, useMapOptions } from "@/lib/map/mapOptions";
import { ALL_MINZOOM, MAJOR_MINZOOM, stationComplexes, stationLabelInk, type ComplexInfo } from "./stationLabels";
import { NOTCH_ICON, addBulletImage, stationRowId, bulletId, busBadgeId, busPrefix } from "@/lib/transit/bullets";
import { usePalette } from "@/lib/theme";
import { FOCUS_OPACITY, FOCUS_VEIL_ID, WORLD, useTransitFocus } from "@/lib/map/transitFocus";

/** Layers a click on the map should hand to transit instead of the area pick. */
/** CC BY 4.0 credits for the 3D vehicle models (public/models/LICENSE.md), shown while they can be on screen. */
const VEHICLE_CREDITS = "3D vehicles: R142 by yarankepang, XD40 by kieranfarr, P32 by Sharky (Sketchfab, CC BY 4.0)";
const TRANSIT_CLICK_LAYERS = ["transit-bullet", "transit-bus-badge", "transit-bus-badge-full", "transit-bus-badge-selected", "transit-vehicle-2d", "transit-vehicle-hit", "transit-access", "transit-entrance", "transit-station"];

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
  // Render the lucide icon once to SVG markup (no server renderer in the bundle).
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(def.node));
  const svg = host.innerHTML;
  root.unmount();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
export default function TransitLayer() {
  const enabled = useFlag("transit");
  const { current } = useMap();
  const map = current?.getMap();
  const { tilted, walking, startWalk } = useMapState();
  const three = tilted || walking;
  // Dev-only: lets headless QA enter street level at a point.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __walk?: unknown }).__walk = startWalk;
  }, [startWalk]);
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
    else { set("subway", true); set("bus", true); }
  }, [anyOn, set]);
  usePanelChip({ id: "transit", label: "Transit", active: anyOn, onToggle: toggleChip });
  const [focus, setFocus] = useTransitFocus();
  const toggleFocus = useCallback(() => {
    if (!focus && !anyOn) { set("subway", true); set("bus", true); }
    setFocus(!focus);
  }, [focus, anyOn, set, setFocus]);
  const opts = useMapOptions();
  const lineAlpha = lineOpacity(opts.routes, focus) as number;
  const toggleTrains = useCallback(() => set("subway", !on.has("subway")), [on, set]);
  const toggleBuses = useCallback(() => set("bus", !on.has("bus")), [on, set]);
  usePanelChip({ id: "liveTrains", label: "Live trains", active: on.has("subway"), onToggle: toggleTrains });
  usePanelChip(meta.data?.bus === true ? { id: "liveBuses", label: "Live buses", active: on.has("bus"), onToggle: toggleBuses } : null);
  usePanelChip({ id: "transitFocus", label: "Transit Focus", active: focus && anyOn, onToggle: toggleFocus });

  // Icons, including after a style swap.
  useEffect(() => {
    if (!map) return;
    const missing = (e: { id: string }) => { addIcon(map, e.id); addBulletImage(map, e.id); };
    Object.keys(ICONS).forEach((id) => addIcon(map, id));
    map.on("styleimagemissing", missing);
    return () => { map.off("styleimagemissing", missing); };
  }, [map]);

  const statics = rail.map((s) => data[s]?.stat).filter((s): s is StaticSystem => Boolean(s));
  const staticKey = statics.map((s) => s.system).join(",");
  // Raised subway track (viaducts, portal ramps, bridge decks) from the height profiles.
  const raised = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    return sub ? raisedTrack(sub) : { decks: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, piers: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, raisedCells: new Set<string>() };
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    // Commuter rail is drawn at grade; subway ground lines step aside under raised track.
    features: statics.flatMap((s) => {
      const fs = s.lines.features.map((f) => ({ ...f, properties: { ...f.properties, system: s.system, grade: s.system !== "subway" ? ("grade" as const) : f.properties.grade } }));
      return s.system === "subway" ? splitRaised(fs, raised.raisedCells) : fs;
    }),
  }), [staticKey, raised]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: statics.flatMap((s) => {
      // Subway stations carry a compact row of route bullets for their label (#177),
      // one label per complex with every route, and a major flag for z14 (#186).
      const complexes = s.system === "subway" ? stationComplexes(s.stations.features) : new Map<string, ComplexInfo>();
      return s.stations.features.map((f) => {
        const c = complexes.get(String(f.properties.id));
        const routes = c?.routes ?? [];
        return { ...f, properties: { ...f.properties, system: s.system, major: c?.major ?? false, dup: c?.dup ?? false, row: routes.length ? stationRowId(routes) : "" } };
      });
    }),
  }), [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const viaduct = raised.decks;
  const piers = raised.piers;
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
          const est = estimateTrain(st, trip, now);
          const v = est && s !== "subway" ? { ...est, grade: "grade" as const } : est;
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
      if (t - last < 66) return;
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

  // 3D click targets only need ~1 Hz accuracy; re-tiling them every frame is wasted work.
  const [hitFc, setHitFc] = useState<GeoJSON.FeatureCollection>(EMPTY);
  useEffect(() => {
    if (!three) return;
    const id = window.setInterval(() => setHitFc({ type: "FeatureCollection", features: [...display.current.values()].map((v) => ({ type: "Feature", properties: { key: v.key, label: v.label }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })) }), 1000);
    return () => window.clearInterval(id);
  }, [three]);
  const theme = usePalette();
  const labelInk = stationLabelInk(theme);
  const [hoverStation, setHoverStation] = useState("");
  const openStationId = content?.id.startsWith("transit:station:") ? content.id.split(":").pop() ?? "" : "";
  useEffect(() => {
    if (!map) return;
    const move = (e: MapLayerMouseEvent) => {
      const f = map.getLayer("transit-station") ? map.queryRenderedFeatures(e.point, { layers: ["transit-station"] })[0] : undefined;
      setHoverStation(f?.properties?.system === "subway" ? String(f.properties.id) : "");
    };
    map.on("mousemove", move);
    return () => { map.off("mousemove", move); };
  }, [map]);
  const alerted = useMemo(() => alertedRoutes(alerts.data?.alerts), [alerts.data]);
  const vehicleFc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: vehicles.map((v) => {
      const alert = alerted.has(v.route);
      let bullet = "", badge = "", badgeFull = "";
      if (v.system === "subway") bullet = bulletId(v.route, v.color, alert);
      if (v.system === "bus") {
        const p = busPrefix(v.route);
        const c = p.express ? theme.busExpress : theme.bus;
        badge = busBadgeId(p.text, c); // the tiny prefix badge stays plain; the "!" rides the full badge
        badgeFull = busBadgeId(v.route, c, alert);
      }
      return { type: "Feature", properties: { key: v.key, color: v.color, bearing: v.bearing, grade: v.grade, label: v.label, system: v.system, route: v.route, bullet, badge, badgeFull }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } };
    }),
  }), [vehicles, alerted, theme]);
  const selBusRoute = (selectedKey?.startsWith("bus:") ? vehicles.find((v) => v.key === selectedKey)?.route : undefined) ?? "";
  const busRoute = useBusRoute(selBusRoute || undefined);
  const busRouteFc = useMemo<GeoJSON.FeatureCollection>(() => !selBusRoute || !busRoute.data ? EMPTY : ({
    type: "FeatureCollection",
    features: [
      ...busRoute.data.lines.map((l): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "line", route: busRoute.data.route }, geometry: { type: "LineString", coordinates: l } })),
      ...busRoute.data.stops.map((st): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "stop", name: st.name }, geometry: { type: "Point", coordinates: [st.lon, st.lat] } })),
    ],
  }), [busRoute.data, selBusRoute]);
  // 3D: one three.js custom layer in the map's canvas, loaded on first tilt.
  const entr = useRef<ReturnType<typeof entranceInstances>>([]);
  const bays = useRef<ReturnType<typeof viaductBays>>([]);
  useEffect(() => {
    const sub = statics.find((s) => s.system === "subway");
    bays.current = sub ? viaductBays(sub) : [];
    v3d.current?.setStructure(bays.current);
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const v3d = useRef<ReturnType<typeof import("@/lib/map/threeLayer").createVehicleLayer> | null>(null);
  useEffect(() => {
    if (!map || !three) return;
    let cancelled = false;
    const ensure = () => {
      if (cancelled || !v3d.current || map.getLayer(v3d.current.layer.id)) return;
      try { map.addLayer(v3d.current.layer); } catch { /* style mid-swap; retried on the next styledata */ }
    };
    void import("@/lib/map/threeLayer").then(({ createVehicleLayer }) => {
      v3d.current ??= createVehicleLayer();
      v3d.current.setStructure(bays.current);
      v3d.current.setEntrances(entr.current);
      if (import.meta.env.DEV) Object.assign(window, { __v3d: v3d.current, __entr: entr });
      ensure();
    });
    map.on("styledata", ensure);
    return () => {
      cancelled = true;
      map.off("styledata", ensure);
      if (v3d.current && map.getLayer(v3d.current.layer.id)) map.removeLayer(v3d.current.layer.id);
    };
  }, [map, three]);
  // Street level: the 3D entrance kit within ~300 m of the camera; elevator entrances gray when out.
  const outKey = work.access.features.map((f) => String(f.properties?.id)).sort().join(",");
  const outStations = useMemo(() => new Set(outKey ? outKey.split(",") : []), [outKey]);
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const sub = statics.find((s) => s.system === "subway");
      const c = map.getCenter();
      entr.current = walking && sub ? entranceInstances(sub, outStations, [c.lng, c.lat]) : [];
      v3d.current?.setEntrances(entr.current);
    };
    sync();
    map.on("moveend", sync);
    return () => { map.off("moveend", sync); };
  }, [map, walking, outStations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // X-ray: a station's insides through a dimmed ground; the camera tilts in so the 3D layer is on.
  const xrayId = useXray();
  const xrayData = useXrayData(Boolean(xrayId)).data;
  const xrayStation = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    const st = xrayId ? sub?.stations.features.find((f) => String(f.properties.id) === xrayId) : undefined;
    const inside = xrayId ? xrayData?.[xrayId] : undefined;
    if (!st || !inside) return null;
    const ents = (sub?.entrances?.features ?? []).filter((e) => String(e.properties.id) === xrayId).map((e) => e.geometry.coordinates as [number, number]);
    return { center: st.geometry.coordinates as [number, number], prims: xrayPrims(inside, ents, outStations.has(xrayId!)) };
  }, [xrayId, xrayData, outStations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!map || !xrayStation) return;
    map.easeTo({ center: xrayStation.center, zoom: Math.max(map.getZoom(), 17.3), pitch: Math.max(map.getPitch(), 55), duration: 800 });
  }, [map, xrayStation]);
  useEffect(() => {
    const push = () => v3d.current?.setXray(xrayStation?.center ?? null, xrayStation?.prims ?? []);
    push();
    const id = window.setTimeout(push, 1200); // the three layer loads on the first tilt
    return () => window.clearTimeout(id);
  }, [xrayStation, three]);
  useEffect(() => {
    if (!three) return;
    v3d.current?.update(
      vehicles
        .filter((v) => !(walking && v.grade === "underground")) // street level shows entrances instead
        .map((v) => ({ lon: v.lon, lat: v.lat, bearing: v.bearing, z: v.z ?? 0, color: v.system === "bus" ? "#f8fafc" : v.color, kind: v.system === "bus" ? "bus" : v.system === "subway" ? "subway" : "rail", ghost: v.grade === "underground" })),
    );
  }, [vehicles, three, walking]);

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
      if (f.layer.id.startsWith("transit-vehicle") || f.layer.id === "transit-bullet" || f.layer.id.startsWith("transit-bus-badge")) {
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

  if (!enabled || (!rail.length && !busOn)) return null;

  const hide2d = three;
  const bulletAlpha = (opts.routes.length ? ["case", ["in", ["get", "route"], ["literal", [...opts.routes]]], 1, 0.35] : 1) as number;
  return (
    <>
      <Source id="transit-lines" type="geojson" data={lines}>
        <Layer id="transit-line-under" type="line" filter={["==", ["get", "grade"], "underground"]}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.5], "line-opacity": 0.45, "line-dasharray": [2, 2] }} />
        <Layer id="transit-line" type="line" filter={three ? ["==", ["get", "grade"], "grade"] : ["!=", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 4], "line-opacity": lineAlpha }} />
      </Source>
      {focus ? (
        <Source id={FOCUS_VEIL_ID} type="geojson" data={WORLD}>
          <Layer id={FOCUS_VEIL_ID} type="fill" beforeId="transit-line-under"
            paint={{ "fill-color": "#f8fafc", "fill-opacity": FOCUS_OPACITY }} />
        </Source>
      ) : null}
      <Source id="transit-work-segs" type="geojson" data={work.segs}>
        <Layer id="transit-work-line" type="line" paint={{ "line-color": "#f59e0b", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6], "line-dasharray": [1, 1.5], "line-opacity": 0.85 }} />
      </Source>
      <Source id="transit-viaduct" type="geojson" data={three ? viaduct : EMPTY} attribution={three ? VEHICLE_CREDITS : undefined}>
        <Layer id="transit-viaduct" type="fill-extrusion" minzoom={13} filter={["any", ["get", "bridge"], ["<", ["zoom"], 15]]}
          paint={{ "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["-", ["get", "top"], 1.2], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.9 }} />
      </Source>
      <Source id="transit-piers" type="geojson" data={three ? piers : EMPTY}>
        <Layer id="transit-pier" type="fill-extrusion" minzoom={14} maxzoom={15}
          paint={{ "fill-extrusion-color": "#6b7280", "fill-extrusion-base": 0, "fill-extrusion-height": ["-", ["get", "top"], 1.2], "fill-extrusion-opacity": 0.9 }} />
      </Source>
      <Source id="transit-stations" type="geojson" data={stations}>
        <Layer id="transit-station" type="circle" minzoom={11}
          paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#6b6a66", "circle-stroke-width": 1, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 4] }} />
      </Source>
      <Source id="transit-entrances" type="geojson" data={entrances}>
        {/* Overhead: a small green dot. Street level: the 3D kit draws it; this stays as an invisible tap target. */}
        <Layer id="transit-entrance" type="circle" minzoom={16}
          paint={{ "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": walking ? 0 : 1, "circle-radius": walking ? 14 : 3.5, "circle-opacity": walking ? 0.01 : 1, "circle-stroke-opacity": walking ? 0 : 1 }} />
      </Source>
      <Source id="transit-work-points" type="geojson" data={work.points}>
        <Layer id="transit-work" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-wrench", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [18, -18], "icon-allow-overlap": true, "icon-ignore-placement": true }} />
      </Source>
      <Source id="transit-skips" type="geojson" data={work.skips}>
        <Layer id="transit-skip" type="circle" minzoom={11}
          paint={{ "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#f59e0b", "circle-stroke-width": 2.5, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 11] }} />
      </Source>
      <Source id="transit-access" type="geojson" data={work.access}>
        <Layer id="transit-access" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-access", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [-18, -18], "icon-allow-overlap": true, "icon-ignore-placement": true }} />
      </Source>
      <Source id="transit-vehicle-hits" type="geojson" data={hide2d ? hitFc : EMPTY}>
        <Layer id="transit-vehicle-hit" type="circle" paint={{ "circle-radius": 14, "circle-opacity": 0, "circle-pitch-alignment": "map" }} />
      </Source>
      <Source id="transit-bus-route" type="geojson" data={busRouteFc}>
        <Layer id="transit-bus-route-line" type="line" filter={["==", ["get", "kind"], "line"]} layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": theme.bus, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5], "line-opacity": 0.85 }} />
        <Layer id="transit-bus-route-stop" type="circle" filter={["==", ["get", "kind"], "stop"]}
          paint={{ "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4.5], "circle-color": "#ffffff", "circle-stroke-color": theme.bus, "circle-stroke-width": 1.5 }} />
        <Layer id="transit-bus-route-stop-name" type="symbol" minzoom={15} filter={["==", ["get", "kind"], "stop"]}
          layout={{ "text-field": ["get", "name"], "text-size": 10, "text-font": ["Noto Sans Regular"], "text-offset": [0, 1], "text-anchor": "top", "text-optional": true }}
          paint={{ "text-color": theme.label_, "text-halo-color": theme.land, "text-halo-width": 1.5 }} />
      </Source>
      <Source id="transit-vehicles" type="geojson" data={hide2d || opts.stationsOnly ? EMPTY : vehicleFc}>
        {/* Rail (LIRR, Metro-North) keeps heading arrows. */}
        <Layer id="transit-vehicle-2d" type="symbol"
          filter={["in", ["get", "system"], ["literal", ["lirr", "mnr"]]]}
          layout={{ "icon-image": "transit-arrow", "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 16, 0.9] }}
          paint={{ "icon-color": ["get", "color"], "icon-halo-color": "#111827", "icon-halo-width": 1, "icon-opacity": ["case", ["==", ["get", "grade"], "underground"], 0.55, 1] }} />
        {/* Subway trains: route bullets with a heading notch on the rim. */}
        <Layer id="transit-bullet-notch" type="symbol" filter={["==", ["get", "system"], "subway"]}
          layout={{ "icon-image": NOTCH_ICON, "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 0.8], "icon-offset": [0, -26] }}
          paint={{ "icon-opacity": bulletAlpha }} />
        <Layer id="transit-bullet" type="symbol" filter={["==", ["get", "system"], "subway"]}
          layout={{ "icon-image": ["get", "bullet"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 14, 0.75, 17, 0.95] }}
          paint={{ "icon-opacity": bulletAlpha }} />
        {/* Buses: SQUARE badges, so they never read as round subway bullets. Zoomed out
            only the borough prefix (all shown, so each heading notch has its badge); from z15 or for the
            selected route the badge widens to the full route, with collision detection. */}
        <Layer id="transit-bus-notch" type="symbol" filter={["==", ["get", "system"], "bus"]}
          layout={{ "icon-image": NOTCH_ICON, "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 0.45, 15, 0.55, 18, 0.75], "icon-offset": [0, -17] }}
          paint={{ "icon-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, 0.8] }} />
        <Layer id="transit-bus-badge" type="symbol" maxzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badge"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 0.45] }}
          paint={{ "icon-opacity": selBusRoute ? 0.4 : 0.85 }} />
        <Layer id="transit-bus-badge-full" type="symbol" minzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": false, "icon-padding": 1, "icon-size": ["interpolate", ["linear"], ["zoom"], 15, 0.55, 18, 0.75] }}
          paint={{ "icon-opacity": selBusRoute ? 0.45 : 1 }} />
        <Layer id="transit-bus-badge-selected" type="symbol" filter={["all", ["==", ["get", "system"], "bus"], ["==", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": true, "symbol-sort-key": 1, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 0.75] }} />
      </Source>
      {/* Name + route bullets (#177, #186): with Station names on, major complexes from z14 and every
          station from z15, one label per complex, bold ink beside the dot; the hovered / open one at any zoom.
          Collision detection still drops overlapping labels. Drawn last, above live buses and the basemap,
          so it is placed first: street names, places and moving bus badges give way to it. */}
      <Layer id="transit-station-label" source="transit-stations" type="symbol" minzoom={11}
        filter={["all", ["==", ["get", "system"], "subway"], ["any",
          ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId],
          ...(opts.stationNames ? [["all", ["!", ["get", "dup"]], ["any", [">=", ["zoom"], ALL_MINZOOM], ["all", ["get", "major"], [">=", ["zoom"], MAJOR_MINZOOM]]]]] : []),
        ]] as never}
        layout={{ "icon-image": ["get", "row"], "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 17, 1], "icon-anchor": "top-left", "icon-offset": [6, 1],
          "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 14, 12, 17, 15], "text-anchor": "bottom-left", "text-offset": [0.6, 0.1], "text-max-width": 9, "text-justify": "left",
          "symbol-sort-key": ["case", ["any", ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId]], 0, ["get", "major"], 1, 2] }}
        paint={{ "text-color": labelInk.ink, "text-halo-color": labelInk.halo, "text-halo-width": 2, "text-halo-blur": 0.5 }} />
    </>
  );
}
