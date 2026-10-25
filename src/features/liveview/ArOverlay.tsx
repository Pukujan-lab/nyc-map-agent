import { useEffect, useRef } from "react";
import { Map as MapLibreMapCtor, type Map as MapLibreMap } from "maplibre-gl";
import { installNavLayers, readNavColors, updateNavLayers, type NavFrame } from "./layers";

/** A phone held at chest height, tipped a little toward the pavement. */
export const AR_EYE_M = 1.4;
export const AR_PITCH = 82;

interface Props {
  /** The route, how far along it the walker is and the next turn. */
  frame: Omit<NavFrame, "puck">;
  /** Walker's position from GPS. */
  at: { lon: number; lat: number };
  /** Smoothed compass heading, degrees clockwise from north. */
  heading: number;
}

/**
 * The route ribbon, chevrons and turn arrow drawn over the camera picture:
 * a second, transparent MapLibre map with no basemap, holding only the
 * navigation layers, posed as an eye at the walker's position looking along
 * the compass heading. Nothing is fetched; the camera picture never reaches
 * the map.
 */
export default function ArOverlay({ frame, at, heading }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef({ frame, at, heading });
  latest.current = { frame, at, heading };

  const pose = (map: MapLibreMap) => {
    const { at: p, heading: h } = latest.current;
    map.jumpTo(map.calculateCameraOptionsFromCameraLngLatAltRotation([p.lon, p.lat], AR_EYE_M, h, AR_PITCH));
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new MapLibreMapCtor({
      container: box.current,
      // No background layer, so the canvas stays clear and the camera shows through.
      style: { version: 8, sources: {}, layers: [] },
      interactive: false,
      attributionControl: false,
      maxPitch: 89,
      maxZoom: 24,
      center: [at.lon, at.lat],
      zoom: 20,
    });
    mapRef.current = map;
    map.on("load", () => {
      installNavLayers(map, readNavColors());
      pose(map);
      updateNavLayers(map, { ...latest.current.frame, puck: null });
    });
    return () => {
      mapRef.current = null;
      map.remove();
    };
    // The map is made once; later props move it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    pose(map);
  }, [at.lon, at.lat, heading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    updateNavLayers(map, { ...frame, puck: null });
  }, [frame]);

  return <div ref={box} data-testid="ar-overlay" aria-hidden="true" className="pointer-events-none absolute inset-0" />;
}
