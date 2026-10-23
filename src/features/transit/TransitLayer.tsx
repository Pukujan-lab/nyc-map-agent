import { formatStreetText } from "@/lib/streetName";
import { liveProgress } from "./monotonic";
import { BusEstimator } from "./busEstimate";
import { labelledStationIds } from "./stationLabels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { LngLat, type Map as MaplibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import { Accessibility, Navigation2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  estimateTrain,
  stationOf,
  raisedTrack,
  viaductBays,
  entranceInstances,
  dedupeTrackLines,
  splitRaised,
  type StaticSystem,
  type SystemId,
  type Vehicle,
} from "./model";
import { alertedRoutes, routesForPage, useAlerts, useBusLines, useBusRoute, useBusSegmentHistory, useBusShapes, useBuses, useStarred, useTransitData, useTransitMeta, useTransitToggles, useXrayData, useSegmentHistory } from "./hooks";
import { useXray, xrayPrims } from "./xray";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlag } from "@/lib/flags";
import { usePanel, usePanelChip, usePanelMode, usePanelSearch, type SearchProvider } from "@/lib/store/PanelContext";
import { followRig, rememberFollowOrigin, setFollowMode, setFollowed, stableHeading, takeFollowRestore, useFollowMode, useFollowed } from "./follow";
import { publishSubway } from "@/lib/agent/streetContext";
import { busesToShow, capPerLine, holdShuttle, registerBusToggle, setShuttleBuses, shownVehicles, useBusPins } from "@/lib/transit/busReveal";
import { publishLiveDots } from "@/lib/transit/liveVehicles";
import { setLinesControl } from "@/lib/transit/linesControl";
import { XRAY_VEIL_M, setStreetXray, useStreetXray, xrayForFollow, xrayVeilDisc } from "@/lib/transit/streetXray";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const stopFollow = () => setFollowed(null);
import { SYSTEM_LABELS, cellKey } from "./model";
import { FollowCard, StationDetails } from "./TransitCard";
import { TransitStatusDetails } from "./TransitStatus";
import { alertGeometry, setAlertFocus, stationChanges, useAlertFocus } from "./alertFocus";
import { LinesDrawer } from "./LinesDrawer";
import { lineOpacity, useMapOptions } from "@/lib/map/mapOptions";
import { NOTCH_ICON, addBulletImage, lineColor as lineColorOf, stationRowId, bulletId, busBadgeId, busIconSize, busPrefix } from "@/lib/transit/bullets";
import { usePalette } from "@/lib/theme";
import { FOCUS_OPACITY, FOCUS_VEIL_ID, WORLD, focusVeil, useTransitFocus } from "@/lib/map/transitFocus";

/** Layers a click on the map should hand to transit instead of the area pick. */
/** CC BY 4.0 credits for the 3D vehicle models (public/models/LICENSE.md), shown while they can be on screen. */
const VEHICLE_CREDITS = "3D vehicles: R142 by yarankepang, XD40 by kieranfarr, P32 by Sharky (Sketchfab, CC BY 4.0)";
const TRANSIT_CLICK_LAYERS = ["transit-bullet", "transit-bus-badge", "transit-bus-badge-full", "transit-bus-badge-selected", "transit-vehicle-2d", "transit-vehicle-hit", "transit-access", "transit-entrance", "transit-station-label", "transit-station-raised", "transit-station"];

const MAX_VEHICLES = 400;
/** In 3D, labels and bullets on raised track lift by about a viaduct's height on screen. */
const RAISED_LIFT_PX = 26;
const RAISED_LIFT_EM = 2.8;
/** True when a point sits on (or right beside) raised subway track. */
function onRaisedTrack(cells: Set<string>, p: GeoJSON.Position): boolean {
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (cells.has(cellKey([p[0] + dx / 2400, p[1] + dy / 2400]))) return true;
  return false;
}
/** Street level: live vehicles within this distance of the walker. */
const STREET_RADIUS_M = 600;
/** X-ray draws underground trains this far below the ground plane. */
const XRAY_DEPTH_M = -12;
/** Where the walker stands: at street level the map centre sits at most ~10 m ahead of the eye. */
function streetEye(map: MaplibreMap): { lon: number; lat: number } {
  const c = map.getCenter();
  return { lon: c.lng, lat: c.lat };
}
function metresApart(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const k = 111_320;
  return Math.hypot((a.lon - b.lon) * k * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * k);
}
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** Stable "no buses" result so the draw loop does not restart every render. */
const BUS_OFF = { why: "off" as const, routes: [] as string[] };
const ICONS: Record<string, { node: JSX.Element; sdf: boolean }> = {
  "transit-arrow": { node: <Navigation2 fill="#fff" color="#fff" strokeWidth={1.5} size={48} />, sdf: true },
  "transit-access": { node: <Accessibility color="#2563eb" strokeWidth={2.5} size={40} />, sdf: false },
  "transit-wrench": { node: <Wrench color="#f59e0b" strokeWidth={2.5} size={40} />, sdf: false },
};

/** Skipped-station markers (#253): a full cross-out, or a half strike for one direction. */
function addSkipIcons(map: MaplibreMap) {
  for (const [id, half] of [["transit-skip-x", false], ["transit-skip-half", true]] as const) {
    if (map.hasImage(id)) continue;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.canvas.width = ctx.canvas.height = 40;
    ctx.beginPath(); ctx.arc(20, 20, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#111111"; ctx.stroke();
    ctx.lineCap = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "#d4183d";
    ctx.beginPath(); ctx.moveTo(9, 31); ctx.lineTo(31, 9); ctx.stroke();
    if (!half) { ctx.beginPath(); ctx.moveTo(9, 9); ctx.lineTo(31, 31); ctx.stroke(); }
    map.addImage(id, ctx.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
  }
}

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
  const { tilted, walking, startWalk, stopWalk, setTilted } = useMapState();
  const reducedMotion = usePrefersReducedMotion();
  const three = tilted || walking;
  // Dev-only: lets headless QA enter street level at a point.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __walk?: unknown }).__walk = startWalk;
  }, [startWalk]);
  const { on, set, panelOpen, setPanelOpen, busPage, busLines: pickedLines, busCap } = useTransitToggles();
  const { content, showPanel, setDrawerOpen, drawerOpen } = usePanel();
  const meta = useTransitMeta();
  const rail = (["subway", "lirr", "mnr"] as SystemId[]).filter((s) => on.has(s));
  const alertFocus = useAlertFocus();
  const pins = useBusPins();
  const busLines = useBusLines(Boolean(busPage) || drawerOpen);
  const lineList = useMemo(() => (pickedLines.length ? pickedLines : routesForPage(busLines.data?.groups, busPage)), [pickedLines, busLines.data, busPage]);
  // `on` is a new Set every render. The boolean and the pin snapshot are what actually change.
  const busWanted = on.has("bus");
  const show = useMemo(
    () => (busWanted ? busesToShow(lineList, pins) : BUS_OFF),
    [busWanted, lineList, pins],
  );
  const busOn = meta.data?.bus === true && show.routes.length > 0;
  // The draw loop reads this, so a stale timer cannot keep a bus after Live buses turns off.
  const busRoutesRef = useRef<string[]>([]);
  busRoutesRef.current = show.routes;
  const data = useTransitData(rail);
  const subwayRoutes = useMemo(() => [...new Set((data.subway?.live?.trips ?? []).map((t) => t.route))].sort(), [data.subway?.live]);
  const history = useSegmentHistory(subwayRoutes);
  const buses = useBuses(busOn, show.routes);
  const alerts = useAlerts(rail.length > 0 || panelOpen);
  const stars = useStarred();
  // The panel owns what is open; a vehicle stays "selected" while its panel is up.
  const selectedKey = content?.id.startsWith("transit:vehicle:") ? content.id.slice(16) : undefined;
  const followedKey = useFollowed();
  useEffect(() => {
    if (!show.routes.length && followedKey?.startsWith("bus:")) setFollowed(null);
  }, [show.routes.length, followedKey]);
  const display = useRef(new Map<string, Vehicle>());
  // Buses: snapped to their route shape and dead-reckoned between 30 s GPS reports.
  const busEst = useRef(new BusEstimator());
  const busShapes = useBusShapes(show.routes);
  const busHistory = useBusSegmentHistory(show.routes);
  useEffect(() => busEst.current.setHistory(busHistory), [busHistory]);
  useEffect(() => {
    for (const g of busShapes) busEst.current.setRoute(g);
    const allow = new Set(show.routes.map((r) => r.toUpperCase()));
    const inRoutes = (buses.data?.buses ?? []).filter((b) => allow.has(b.route.toUpperCase()));
    // Buses per line: the nearest to the map, plus the one being followed so Follow never loses its bus.
    const c = map?.getCenter();
    const kept = new Set(capPerLine(inRoutes, busCap, c ? { lon: c.lng, lat: c.lat } : null).map((b) => b.id));
    const list = inRoutes.filter((b) => kept.has(b.id) || `bus:${b.id}` === followedKey);
    for (const b of list) busEst.current.report(b);
    busEst.current.retain(new Set(list.map((b) => b.id)));
    // The map is read once per refresh, not on every move: re-running on `map` would reshuffle buses as you pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses.data, busShapes, show.routes, busCap]);
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
    if (anyOn) {
      holdShuttle(alertFocus?.id ?? null);
      (["subway", "lirr", "mnr", "bus"] as const).forEach((id) => set(id, false));
    } else set("subway", true);
  }, [anyOn, set, alertFocus]);
  usePanelChip({ id: "transit", label: "Transit", active: anyOn, onToggle: toggleChip });
  const [focus, setFocus] = useTransitFocus();
  const toggleFocus = useCallback(() => {
    if (!focus && !anyOn) set("subway", true);
    setFocus(!focus);
  }, [focus, anyOn, set, setFocus]);
  const opts = useMapOptions();
  const lineAlpha = lineOpacity(opts.routes, focus) as number;
  const toggleTrains = useCallback(() => set("subway", !on.has("subway")), [on, set]);
  const toggleBuses = useCallback(() => {
    if (show.routes.length > 0) { holdShuttle(alertFocus?.id ?? null); set("bus", false); return; }
    setDrawerOpen(true);
  }, [show.routes.length, alertFocus, set, setDrawerOpen]);
  usePanelChip({ id: "liveTrains", label: "Live trains", active: on.has("subway"), onToggle: toggleTrains });
  usePanelChip(meta.data?.bus === true ? { id: "liveBuses", label: "Live buses", active: show.routes.length > 0, onToggle: toggleBuses } : null);
  usePanelChip({ id: "transitFocus", label: "Transit Focus", active: focus && anyOn, onToggle: toggleFocus });

  // Icons, including after a style swap.
  useEffect(() => {
    if (!map) return;
    const missing = (e: { id: string }) => { addIcon(map, e.id); addBulletImage(map, e.id); };
    Object.keys(ICONS).forEach((id) => addIcon(map, id));
    const skipIcons = () => addSkipIcons(map);
    skipIcons();
    map.on("styleimagemissing", missing);
    map.on("styledata", skipIcons);
    return () => { map.off("styleimagemissing", missing); map.off("styledata", skipIcons); };
  }, [map]);

  const statics = rail.map((s) => data[s]?.stat).filter((s): s is StaticSystem => Boolean(s));
  const staticKey = statics.map((s) => s.system).join(",");
  publishSubway(statics.find((s) => s.system === "subway") ?? null);
  // Raised subway track (viaducts, portal ramps, bridge decks) from the height profiles.
  const raised = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    return sub ? raisedTrack(sub) : { decks: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, piers: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, raisedCells: new Set<string>() };
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    // Commuter rail is drawn at grade; subway ground lines step aside under raised track.
    // Branch shapes share a trunk, so collapse them before the dash can stack.
    features: statics.flatMap((s) => {
      const fs = dedupeTrackLines(s.lines.features.map((f) => ({ ...f, properties: { ...f.properties, system: s.system, grade: s.system !== "subway" ? ("grade" as const) : f.properties.grade } })));
      return s.system === "subway" ? splitRaised(fs, raised.raisedCells) : fs;
    }),
  }), [staticKey, raised]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = useMemo<GeoJSON.FeatureCollection>(() => {
    // One name per station complex: same-name neighbours would stack the label twice (#312).
    const labelled = labelledStationIds(statics.flatMap((s) => s.system !== "subway" ? [] : s.stations.features.map((f) => ({ id: String(f.properties.id), name: String(f.properties.name ?? ""), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))));
    return {
    type: "FeatureCollection",
    features: statics.flatMap((s) => s.stations.features.map((f) => {
      // Subway stations carry a compact row of route bullets for their label (#177).
      const routes = s.system === "subway" ? String(f.properties.routes ?? "").split(/[\s,]+/).filter((r) => r && !r.endsWith("X")) : [];
      // Raised (elevated / viaduct) stations: their labels float above the platform in 3D.
      const raisedSt = s.system === "subway" && onRaisedTrack(raised.raisedCells, f.geometry.coordinates);
      return { ...f, properties: { ...f.properties, system: s.system, raised: raisedSt, row: routes.length ? stationRowId([...new Set(routes)]) : "", labelled: s.system !== "subway" || labelled.has(String(f.properties.id)) } };
    })),
    };
  }, [staticKey, raised]); // eslint-disable-line react-hooks/exhaustive-deps
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
      }
      for (const r of a.routes) {
        const c = shapeSlice(sys, r, a.stops);
        if (c) segs.push({ type: "Feature", properties: { id: a.id }, geometry: { type: "LineString", coordinates: c } });
      }
    }
    // Skipped stations (direction-aware): full cross when skipped both ways, half strike + label for one direction.
    const sub = statics.find((s) => s.system === "subway");
    if (sub) {
      for (const [id, c] of stationChanges(alerts.data?.alerts ?? [], sub)) {
        const st = stationPos.get(`subway:${id}`);
        if (!st || !c.skips.length) continue;
        const both = c.skips.some((k) => k.end === null);
        skips.push({ type: "Feature", properties: { ...st.properties, icon: both ? "transit-skip-x" : "transit-skip-half", label: both ? "Skipped" : `Skipped ${c.skips[0].toward}-bound` }, geometry: st.geometry });
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

  // Alert focus (#253): fly to the affected stretch, dim the rest, Back restores the camera.
  // A shuttle named by the alert replaces every other bus on the map.
  useEffect(() => {
    const routes = alertFocus?.replacement ?? [];
    const applied = setShuttleBuses(alertFocus?.id ?? null, routes);
    if (applied && routes.length && !busWanted) set("bus", true);
  }, [alertFocus, busWanted, set]);
  const alertGeo = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    return alertFocus && sub ? alertGeometry(alertFocus, sub) : null;
  }, [alertFocus, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const alertFc = useMemo(() => {
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    const oneWay = alertFocus?.changes?.find((c) => c.kind === "skip" && c.toward)?.toward ?? null;
    const line = (coords: GeoJSON.Position[], route: string): GeoJSON.Feature => ({ type: "Feature", properties: { route, color: lineColorOf(route) }, geometry: { type: "LineString", coordinates: coords } });
    return {
      affected: fc((alertGeo?.affected ?? []).map((x) => line(x.coords, x.route))),
      reroute: fc((alertGeo?.reroute ?? []).map((x) => line(x.coords, alertFocus?.routes[0] ?? x.route))),
      skipped: fc((alertGeo?.skipped ?? []).map((x) => ({ type: "Feature", properties: { name: oneWay ? `${x.name} · ${oneWay}-bound skipped` : x.name, icon: oneWay ? "transit-skip-half" : "transit-skip-x" }, geometry: { type: "Point", coordinates: x.coord } }))),
    };
  }, [alertGeo, alertFocus]);  
  const savedCam = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  useEffect(() => {
    if (!map) return;
    if (alertGeo?.bounds) {
      if (!savedCam.current) { const c = map.getCenter(); savedCam.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; }
      const wide = window.innerWidth >= 768;
      map.fitBounds(alertGeo.bounds, { padding: wide ? { top: 90, bottom: 60, left: 440, right: 80 } : { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 }, maxZoom: 15.5, duration: 900, bearing: 0, pitch: 0 });
    } else if (!alertFocus && savedCam.current) {
      map.easeTo({ ...savedCam.current, duration: 700 });
      savedCam.current = null;
    }
  }, [map, alertGeo, alertFocus]);
  // The alert card owns the focus: once it leaves the panel (Back, Esc, another pick), clear it.
  const shownAlert = useRef<string | null>(null);
  useEffect(() => {
    if (!alertFocus) { shownAlert.current = null; return; }
    const want = `transit:alert:${alertFocus.id}`;
    if (content?.id === want) shownAlert.current = want;
    else if (shownAlert.current === want) setAlertFocus(null);
  }, [content?.id, alertFocus]);
  const openLines = useCallback(() => showPanel({ id: "transit:lines", title: "Lines", subtitle: "Tap lines to show only those", details: <LinesDrawer /> }), [showPanel]);
  useEffect(() => {
    if (!enabled) return;
    setLinesControl(openLines);
    return () => setLinesControl(null);
  }, [enabled, openLines]);
  useEffect(() => {
    registerBusToggle(() => set("bus", true));
    return () => registerBusToggle(null);
  }, [set]);

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
      // Street level: the viewport bounds at max zoom and pitch are a few metres
      // wide, so cull by distance from the walker instead.
      const eye = walking ? streetEye(map) : null;
      const b = map.getBounds();
      const padLon = (b.getEast() - b.getWest()) * 0.2, padLat = (b.getNorth() - b.getSouth()) * 0.2;
      const inView = eye
        ? (v: Vehicle) => metresApart(eye, v) <= STREET_RADIUS_M
        : (v: Vehicle) => v.lon > b.getWest() - padLon && v.lon < b.getEast() + padLon && v.lat > b.getSouth() - padLat && v.lat < b.getNorth() + padLat;
      const out: Vehicle[] = [];
      for (const s of rail) {
        const st = data[s]?.stat, lv = data[s]?.live;
        if (!st || !lv) continue;
        for (const trip of lv.trips) {
          const est = estimateTrain(st, trip, now, liveProgress, s === "subway" ? history : undefined);
          const v = est && s !== "subway" ? { ...est, grade: "grade" as const } : est;
          if (v && (inView(v) || v.key === selectedKey || v.key === followedKey)) out.push(v);
        }
      }
      const allow = new Set(busRoutesRef.current.map((r) => r.toUpperCase()));
      for (const bus of allow.size ? buses.data?.buses ?? [] : []) {
        if (!allow.has(bus.route.toUpperCase())) continue;
        const v: Vehicle = { key: `bus:${bus.id}`, system: "bus", route: bus.route, label: bus.route, color: "#0039A6", lon: bus.lon, lat: bus.lat, bearing: bus.bearing ?? 0, grade: "grade", dir: bus.dir, nextStop: bus.next ?? undefined };
        if (inView(v) || v.key === selectedKey || v.key === followedKey) out.push(v);
      }
      const c = eye ?? { lon: map.getCenter().lng, lat: map.getCenter().lat };
      out.sort((a, z) => Math.hypot(a.lon - c.lon, a.lat - c.lat) - Math.hypot(z.lon - c.lon, z.lat - c.lat));
      targets.current = out.slice(0, MAX_VEHICLES);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [map, rail.join(","), data, buses.data, selectedKey, followedKey, history, walking, show.routes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tween displayed positions and headings toward the targets (~20 fps).
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66) return;
      last = t;
      const next = new Map<string, Vehicle>();
      const nowS = Date.now() / 1000;
      if (!busRoutesRef.current.length) busEst.current.retain(new Set());
      for (const v of shownVehicles(targets.current, busRoutesRef.current)) {
        if (v.system === "bus") {
          const f = busEst.current.frame(v.key.slice(4), nowS);
          if (f) { next.set(v.key, { ...v, lon: f.lon, lat: f.lat, bearing: f.bearing, alpha: f.alpha }); continue; }
        }
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

  // Dev-only: lets headless QA read the drawn vehicles.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __vehicles: () => [...display.current.values()] });
  }, []);
  // 3D click targets only need ~1 Hz accuracy; re-tiling them every frame is wasted work.
  const [hitFc, setHitFc] = useState<GeoJSON.FeatureCollection>(EMPTY);
  useEffect(() => {
    if (!three) return;
    const id = window.setInterval(() => setHitFc({ type: "FeatureCollection", features: [...display.current.values()].map((v) => ({ type: "Feature", properties: { key: v.key, label: v.label }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })) }), 1000);
    return () => window.clearInterval(id);
  }, [three]);
  const theme = usePalette();
  // Street level: publish the drawn vehicles once a second for the mini map.
  useEffect(() => {
    if (!walking) { publishLiveDots([]); return; }
    const push = () => publishLiveDots(shownVehicles([...display.current.values()], busRoutesRef.current).map((v) => ({ key: v.key, lon: v.lon, lat: v.lat, color: v.system === "bus" ? theme.bus : v.color, bus: v.system === "bus", underground: v.grade === "underground" })));
    push();
    const id = window.setInterval(push, 1000);
    return () => { window.clearInterval(id); publishLiveDots([]); };
  }, [walking, theme.bus]);
  const [hoverStation, setHoverStation] = useState("");
  const openStationId = content?.id.startsWith("transit:station:") ? content.id.split(":").pop() ?? "" : "";
  useEffect(() => {
    if (!map) return;
    const move = (e: MapLayerMouseEvent) => {
      const stationLayers = ["transit-station-raised", "transit-station"].filter((id) => map.getLayer(id));
      const f = stationLayers.length ? map.queryRenderedFeatures(e.point, { layers: stationLayers })[0] : undefined;
      setHoverStation(f?.properties?.system === "subway" ? String(f.properties.id) : "");
    };
    map.on("mousemove", move);
    return () => { map.off("mousemove", move); };
  }, [map]);
  const alerted = useMemo(() => alertedRoutes(alerts.data?.alerts), [alerts.data]);
  const visible = useMemo(() => shownVehicles(vehicles, show.routes), [vehicles, show.routes]);
  const vehicleFc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: visible.map((v) => {
      const alert = alerted.has(v.route);
      let bullet = "", badge = "", badgeFull = "";
      if (v.system === "subway") bullet = bulletId(v.route, v.color, alert);
      if (v.system === "bus") {
        const p = busPrefix(v.route);
        const c = p.express ? theme.busExpress : theme.bus;
        badge = busBadgeId(p.text, c); // the tiny prefix badge stays plain; the "!" rides the full badge
        badgeFull = busBadgeId(v.route, c, alert);
      }
      return { type: "Feature", properties: { key: v.key, color: v.color, bearing: v.bearing, grade: v.grade, label: v.label, system: v.system, route: v.route, bullet, badge, badgeFull, alpha: v.alpha ?? 1 }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } };
    }),
  }), [visible, alerted, theme]);
  const selBusRoute = (show.routes.length && selectedKey?.startsWith("bus:") ? visible.find((v) => v.key === selectedKey)?.route : undefined) ?? "";
  const busRoute = useBusRoute(selBusRoute || undefined);
  const busRouteFc = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    if (!show.routes.length) return { type: "FeatureCollection", features };
    const drawn = selBusRoute ? busRoute.data : undefined;
    if (drawn) {
      features.push(
        ...drawn.lines.map((l): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "line", route: drawn.route }, geometry: { type: "LineString", coordinates: l } })),
        ...drawn.stops.map((st): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "stop", name: formatStreetText(st.name) }, geometry: { type: "Point", coordinates: [st.lon, st.lat] } })),
      );
    }
    // The replacement shuttle is drawn even before a bus is tapped, so the gap has a road.
    if (show.why === "shuttle") {
      for (const g of busShapes) {
        if (g.route === selBusRoute) continue;
        for (const l of g.lines) features.push({ type: "Feature", properties: { kind: "line", route: g.route }, geometry: { type: "LineString", coordinates: l } });
      }
    }
    return { type: "FeatureCollection", features };
  }, [busRoute.data, selBusRoute, show.why, show.routes.length, busShapes]);
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
  // Underground trains draw in 3D only with X-ray on (their route bullets always show);
  // then they glow below a see-through ground and buildings, at every level.
  const xrayOn = useStreetXray();
  const flatVeilKey = useRef("");
  const [flatVeil, setFlatVeil] = useState(EMPTY);
  useEffect(() => {
    if (!map || three || !xrayOn) return;
    const sync = () => {
      const e = streetEye(map);
      const key = `${e.lon.toFixed(3)},${e.lat.toFixed(3)}`;
      if (key === flatVeilKey.current) return;
      flatVeilKey.current = key;
      setFlatVeil(xrayVeilDisc(e.lon, e.lat));
    };
    sync();
    map.on("moveend", sync);
    return () => {
      map.off("moveend", sync);
    };
  }, [map, three, xrayOn]);
  useEffect(() => {
    if (!three) return;
    v3d.current?.update(
      visible
        // The followed (boarded) train always draws, whatever its grade.
        .filter((v) => v.key === followedKey || xrayOn || v.grade !== "underground")
        .map((v) => {
          const ghost = v.grade === "underground";
          return { lon: v.lon, lat: v.lat, bearing: v.bearing, z: ghost ? XRAY_DEPTH_M : v.z ?? 0, color: v.system === "bus" ? "#f8fafc" : v.color, kind: v.system === "bus" ? "bus" : v.system === "subway" ? "subway" : "rail", ghost };
        }),
    );
  }, [visible, three, xrayOn, followedKey]);
  useEffect(() => {
    if (!map || !three || !xrayOn) { v3d.current?.setGroundVeil(null); return; }
    const sync = () => {
      const v = v3d.current;
      if (!v) return;
      // Draw after the city layers, whose pavement and walls would otherwise paint over the glow.
      const ids = map.getLayersOrder();
      if (map.getLayer(v.layer.id) && ids[ids.length - 1] !== v.layer.id) map.moveLayer(v.layer.id);
      const e = streetEye(map);
      v.setGroundVeil([e.lon, e.lat], XRAY_VEIL_M);
    };
    sync();
    const late = window.setTimeout(sync, 1200); // the three layer loads on the first tilt
    map.on("move", sync);
    return () => { window.clearTimeout(late); map.off("move", sync); v3d.current?.setGroundVeil(null); };
  }, [map, three, walking, xrayOn]);

  // Follow mode: tap a train or bus (map or street level) and the camera rides along.
  const followMode = useFollowMode();
  const followed = followedKey ? vehicles.find((v) => v.key === followedKey) : undefined;
  const following = Boolean(followedKey);
  // X-ray matches the track under the train you boarded, and turns off when you step off.
  const followedUnder = followed ? followed.grade === "underground" : null;
  const wasFollowing = useRef(false);
  useEffect(() => {
    const next = xrayForFollow(wasFollowing.current, Boolean(followedKey), followedUnder);
    wasFollowing.current = Boolean(followedKey);
    if (next !== null) setStreetXray(next);
  }, [followedKey, followedUnder]);
  // Following needs the 3D scene: leave street level (one scene, the camera just moves) and tilt.
  useEffect(() => {
    if (!following) return;
    if (walking) stopWalk();
    setTilted(true);
  }, [following]); // eslint-disable-line react-hooks/exhaustive-deps
  // Snapshot the view before the chase camera moves it. Stop following eases back here.
  useEffect(() => {
    if (!map || !followedKey) return;
    const c = map.getCenter();
    rememberFollowOrigin({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  }, [map, followedKey]);
  // One pose per displayed vehicle. A fresh glide every update piled up and
  // fought the trip preview. A heading that flips almost backward waits out.
  const headingKey = useRef<string | null>(null);
  const headingHold = useRef({ bearing: 0, streak: 0 });
  useEffect(() => {
    if (!map || !followed) return;
    if (headingKey.current !== followed.key) {
      headingKey.current = followed.key;
      headingHold.current = stableHeading(null, followed.bearing, 0);
    } else {
      headingHold.current = stableHeading(headingHold.current.bearing, followed.bearing, headingHold.current.streak);
    }
    const { eye, look } = followRig(followMode, headingHold.current.bearing, followed.z ?? 0);
    const at = (dx: number, dy: number) => new LngLat(followed.lon + dx / (111_320 * Math.cos((followed.lat * Math.PI) / 180)), followed.lat + dy / 111_320);
    const cam = map.calculateCameraOptionsFromTo(at(eye[0], eye[1]), eye[2], at(look[0], look[1]), look[2]);
    map.jumpTo(cam);
  }, [map, followed, followMode]);
  useEffect(() => {
    if (!map || followedKey) return;
    const back = takeFollowRestore();
    if (!back.restore) return;
    const c = map.getCenter();
    const cam = back.cam ?? { center: [c.lng, c.lat] as [number, number], zoom: Math.min(map.getZoom(), 13), bearing: 0, pitch: 0 };
    map.easeTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch, duration: reducedMotion ? 0 : 700 });
  }, [map, followedKey, reducedMotion]);
  useEffect(() => {
    if (!map || !following) return;
    // Esc and Back go through the panel slot (top panel first, then Follow).
    const stop = () => setFollowed(null);
    map.on("dragstart", stop);
    return () => { map.off("dragstart", stop); };
  }, [map, following]);
  usePanelMode("follow", following ? stopFollow : null);

  // Clicks on transit features: a vehicle starts Follow straight away (no popup).
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapLayerMouseEvent) => {
      const layers = TRANSIT_CLICK_LAYERS.filter((id) => map.getLayer(id));
      const f = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : undefined;
      if (!f?.properties) return;
      if (f.layer.id.startsWith("transit-vehicle") || f.layer.id === "transit-bullet" || f.layer.id.startsWith("transit-bus-badge")) {
        setDrawerOpen(false);
        setFollowMode("chase");
        setFollowed(String(f.properties.key));
        return;
      }
      // Entrances carry the station's GTFS id, so they open the same card.
      const system = (f.layer.id === "transit-entrance" ? "subway" : f.properties.system) as SystemId;
      openStation(system, String(f.properties.id), String(f.properties.name));
      setFollowed(null);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, openStation, setDrawerOpen]);

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

  // Route bullets stay on in every view but street level: symbols draw above the 3D
  // buildings, so a train is never lost behind a tower or under the ground when tilted.
  const hide2d = walking;
  const bulletAlpha = (alertFocus ? ["case", ["in", ["get", "route"], ["literal", alertFocus.routes]], 1, 0.15] : opts.routes.length ? ["case", ["in", ["get", "route"], ["literal", [...opts.routes]]], 1, 0.15] : 1) as number;
  const dimLines = (alertFocus ? 0.12 : lineAlpha);
  // Isolated lines: their stations stay, the rest fade.
  const stationAlpha = (opts.routes.length ? ["case", ["any", ...opts.routes.map((r) => ["in", ` ${r} `, ["concat", " ", ["get", "routes"], " "]])], 1, 0.15] : 1) as number;
  return (
    <>
      {followed ? <FollowCard vehicle={followed} /> : null}
      <Source id="transit-lines" type="geojson" data={lines}>
        {/* X-ray: tunnels read as solid, glowing runs; otherwise a faint dashed hint. */}
        <Layer id="transit-line-under" type="line" filter={["==", ["get", "grade"], "underground"]}
          paint={xrayOn
            ? { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6], "line-opacity": 0.95, "line-blur": 1 }
            : { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.5], "line-opacity": 0.45, "line-dasharray": [2, 2] }} />
        <Layer id="transit-line" type="line" filter={three ? ["==", ["get", "grade"], "grade"] : ["!=", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, focus ? 1.8 : 1.5, 16, focus ? 4.8 : 4], "line-opacity": dimLines }} />
      </Source>
      {xrayOn && !three ? (
        // Top-down X-ray: the ground and buildings fade so the tunnels below read through.
        <Source id="transit-xray-veil" type="geojson" data={flatVeil}>
          <Layer id="transit-xray-veil" type="fill" beforeId="transit-line-under" paint={{ "fill-color": "#0b1220", "fill-opacity": 0.55 }} />
        </Source>
      ) : null}
      {focus ? (
        <Source id={FOCUS_VEIL_ID} type="geojson" data={WORLD}>
          <Layer id={FOCUS_VEIL_ID} type="fill" beforeId="transit-line-under"
            paint={{ "fill-color": focusVeil(theme), "fill-opacity": FOCUS_OPACITY }} />
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
          {...(three ? { filter: ["!=", ["get", "raised"], true] as ["!=", ["get", "raised"], true] } : {})}
          paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#6b6a66", "circle-stroke-width": 1, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 4], "circle-opacity": stationAlpha, "circle-stroke-opacity": stationAlpha }} />
        {three ? (
          // The white station dot is the click target. On a viaduct it has to sit with the label, or the tap lands on the street underneath.
          <Layer id="transit-station-raised" type="circle" minzoom={11}
            filter={["==", ["get", "raised"], true]}
            paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#6b6a66", "circle-stroke-width": 1, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 4], "circle-pitch-alignment": "viewport", "circle-translate-anchor": "viewport", "circle-translate": [0, -RAISED_LIFT_PX], "circle-opacity": stationAlpha, "circle-stroke-opacity": stationAlpha }} />
        ) : null}
        {/* Name + route bullets: every station from z15, or the hovered / open one at any zoom.
            Collision detection drops overlapping labels so they never pile up. */}
        <Layer id="transit-station-label" type="symbol" minzoom={11}
          filter={["all", ["==", ["get", "system"], "subway"], ["any", ["all", [">=", ["zoom"], 15], ["==", ["get", "labelled"], true]], ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId]]]}
          layout={{ "icon-image": ["get", "row"], "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.8, 17, 1], "icon-anchor": "top",
            "icon-offset": (three ? ["case", ["get", "raised"], ["literal", [0, -RAISED_LIFT_PX]], ["literal", [0, 6]]] : [0, 6]) as [number, number],
            "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "bottom",
            "text-offset": (three ? ["case", ["get", "raised"], ["literal", [0, -RAISED_LIFT_EM]], ["literal", [0, -0.6]]] : [0, -0.6]) as [number, number], "text-max-width": 9,
            "symbol-sort-key": ["case", ["any", ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId]], 0, 1] }}
          paint={{ "text-color": theme.dark ? "#f2f1ed" : "#111111", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
      </Source>
      <Source id="transit-entrances" type="geojson" data={entrances}>
        {/* Overhead: a small green dot. Street level: the 3D kit draws it; this stays as an invisible tap target. */}
        <Layer id="transit-entrance" type="circle" minzoom={16}
          paint={{ "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": walking ? 0 : 1, "circle-radius": walking ? 14 : 3.5, "circle-opacity": walking ? 0.01 : 1, "circle-stroke-opacity": walking ? 0 : 1 }} />
      </Source>
      <Source id="transit-work-points" type="geojson" data={work.points}>
        <Layer id="transit-work" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-wrench", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [18, -18], "icon-allow-overlap": true }} />
      </Source>
      <Source id="transit-skips" type="geojson" data={work.skips}>
        <Layer id="transit-skip" type="symbol" minzoom={11}
          layout={{ "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 0.9], "icon-allow-overlap": true,
            "text-field": ["step", ["zoom"], "", 13.5, ["get", "label"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1.1, 0], "text-optional": true }}
          paint={{ "text-color": "#d4183d", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
      </Source>
      {alertFocus ? (
        <>
          <Source id="transit-alert-veil" type="geojson" data={WORLD}>
            <Layer id="transit-alert-veil" type="fill" beforeId="transit-line-under" paint={{ "fill-color": focusVeil(theme), "fill-opacity": 0.55 }} />
          </Source>
          <Source id="transit-alert-affected" type="geojson" data={alertFc.affected}>
            <Layer id="transit-alert-affected" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 11], "line-opacity": 0.95 }} />
          </Source>
          <Source id="transit-alert-reroute" type="geojson" data={alertFc.reroute}>
            <Layer id="transit-alert-reroute" type="line" layout={{ "line-join": "round" }}
              paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 7], "line-dasharray": [1.4, 1.2] }} />
          </Source>
          <Source id="transit-alert-skipped" type="geojson" data={alertFc.skipped}>
            <Layer id="transit-alert-skipped" type="symbol"
              layout={{ "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 1], "icon-allow-overlap": true,
                "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1.2, 0], "text-optional": true }}
              paint={{ "text-color": theme.dark ? "#f2f1ed" : "#111111", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
          </Source>
        </>
      ) : null}
      <Source id="transit-access" type="geojson" data={work.access}>
        <Layer id="transit-access" type="symbol" minzoom={11}
          layout={{ "icon-image": "transit-access", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [-18, -18], "icon-allow-overlap": true }} />
      </Source>
      <Source id="transit-vehicle-hits" type="geojson" data={three ? hitFc : EMPTY}>
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
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 0.8],
            "icon-offset": (three ? ["case", ["==", ["get", "grade"], "elevated"], ["literal", [0, -26 - RAISED_LIFT_PX]], ["literal", [0, -26]]] : [0, -26]) as [number, number] }}
          paint={{ "icon-opacity": bulletAlpha }} />
        <Layer id="transit-bullet" type="symbol" filter={["==", ["get", "system"], "subway"]}
          layout={{ "icon-image": ["get", "bullet"], "icon-allow-overlap": true, "icon-ignore-placement": true,
            // Elevated trains: the bullet floats above the viaduct deck, not on the street below.
            "icon-offset": (three ? ["case", ["==", ["get", "grade"], "elevated"], ["literal", [0, -RAISED_LIFT_PX]], ["literal", [0, 0]]] : [0, 0]) as [number, number], "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 14, 0.75, 17, 0.95] }}
          paint={{ "icon-opacity": ["*", bulletAlpha, ["case", ["==", ["get", "grade"], "underground"], xrayOn ? 1 : 0.7, 1]] as unknown as number }} />
        {/* Buses: SQUARE badges, so they never read as round subway bullets. Zoomed out
            only the borough prefix (all shown, so each heading notch has its badge); from z15 or for the
            selected route the badge widens to the full route, with collision detection.
            A borough filter keeps the count down, so the badge matches a subway bullet. */}
        <Layer id="transit-bus-notch" type="symbol" filter={["==", ["get", "system"], "bus"]}
          layout={{ "icon-image": NOTCH_ICON, "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": busIconSize("notch"), "icon-offset": [0, -17] }}
          paint={{ "icon-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, ["*", 0.8, ["get", "alpha"]]] }} />
        <Layer id="transit-bus-badge" type="symbol" maxzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badge"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": busIconSize("prefix") }}
          paint={{ "icon-opacity": ["*", selBusRoute ? 0.4 : 0.85, ["get", "alpha"]] }} />
        <Layer id="transit-bus-badge-full" type="symbol" minzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": false, "icon-ignore-placement": true, "icon-padding": 1, "icon-size": busIconSize("full") }}
          paint={{ "icon-opacity": ["*", selBusRoute ? 0.45 : 1, ["get", "alpha"]] }} />
        <Layer id="transit-bus-badge-selected" type="symbol" filter={["all", ["==", ["get", "system"], "bus"], ["==", ["get", "route"], selBusRoute]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": true, "symbol-sort-key": 1, "icon-size": busIconSize("selected") }}
          paint={{ "icon-opacity": ["get", "alpha"] }} />
      </Source>
    </>
  );
}
