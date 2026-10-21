/**
 * MapLibre <-> layer-local coordinates. Built on MapLibre's own
 * MercatorCoordinate (projection, metre scale) and LngLat.distanceTo (ground
 * distance) instead of hand-rolled maths.
 *
 * A layer's local frame is metres from an origin: x east, y north, z up. Its
 * matrix (`localMatrix`) maps that into MapLibre's mercator space, where +y points south.
 */
import * as THREE from "three";
import maplibregl, { type LngLatLike } from "maplibre-gl";
// Default import: also loads under Node (CJS) for scripts/make-landmarks.ts and the tests.
const { MercatorCoordinate, LngLat } = maplibregl;

export interface Frame {
  origin: InstanceType<typeof MercatorCoordinate>;
  /** Mercator units per metre at the origin. */
  s: number;
}

/** A local frame whose origin is `at` (on the ground). */
export function frameAt(at: LngLatLike): Frame {
  const origin = MercatorCoordinate.fromLngLat(at, 0);
  return { origin, s: origin.meterInMercatorCoordinateUnits() };
}

/** Metres [east, north] of `f`'s origin. */
export function toLocal(f: Frame, lon: number, lat: number): [number, number] {
  const mc = MercatorCoordinate.fromLngLat([lon, lat], 0);
  return [(mc.x - f.origin.x) / f.s, -(mc.y - f.origin.y) / f.s];
}

/** Local (x east, y north, z up, metres) to MapLibre mercator. */
export function localMatrix(f: Frame): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(f.origin.x, f.origin.y, f.origin.z).scale(new THREE.Vector3(f.s, -f.s, f.s));
}

/** Local y-up (x east, y up, z south, metres; glTF convention) to MapLibre mercator. */
export function localMatrixYUp(f: Frame): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(f.origin.x, f.origin.y, f.origin.z)
    .scale(new THREE.Vector3(f.s, f.s, f.s))
    .multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
}

/** Ground distance in metres (MapLibre's haversine). */
export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  return new LngLat(lon1, lat1).distanceTo(new LngLat(lon2, lat2));
}

/** Ground metres per CSS pixel at `lat` and `zoom` (512 px tiles). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (78_271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Bearing in degrees (clockwise from north) to a rotation about local +z. */
export function bearingToZ(bearing: number): number {
  return (-bearing * Math.PI) / 180;
}
