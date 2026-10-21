/**
 * Public entry point for the shared three.js MapLibre custom layers (3D
 * vehicles and elevated structure, hydrants, corner street-name signs,
 * storefront signboards, hero landmarks). Callers import only this file;
 * three.js itself lives behind it in ./three/ (pinned 0.186.1):
 *
 * - three/context.ts     one shared WebGLRenderer per GL context (#98), colour + light setup, drawScene
 * - three/projection.ts  layer-local metres <-> MapLibre mercator (MercatorCoordinate, LngLat)
 * - three/picking.ts     nearest hydrants / corner signs / storefronts from the loaded tiles
 * - three/assets.ts      glTF loaders (meshopt on demand), vehicle model fitting
 * - three/layers/*       one module per scene layer
 */
export { sharedRenderer } from "./three/context";
export { VEHICLE_MODELS, type VehicleMode } from "./three/assets";
export {
  SIGNS_MIN_ZOOM, STOREFRONT_MIN_ZOOM,
  hydrantFacing, nearbyHydrants, nearbyStorefronts, storefrontAt, directoryAt,
  type HydrantInstance, type StorefrontSign,
} from "./three/picking";
export { createVehicleLayer, VEHICLES_3D_LAYER, type VehicleInstance } from "./three/layers/vehicles";
export { STRUCTURE_MINZOOM, type BayInstance, type EntranceKitInstance } from "./three/layers/structure";
export { XRAY_GROUND_RADIUS, type XrayPrim } from "./three/layers/xray";
export { createHydrantLayer, HYDRANTS_3D_LAYER } from "./three/layers/hydrants";
export { createStreetSignsLayer, STREET_SIGNS_LAYER } from "./three/layers/streetSigns";
export { createStorefrontLayer, STOREFRONT_LAYER, SIGN_COLORS } from "./three/layers/storefronts";
export { createLandmarksLayer, LANDMARKS_3D_LAYER, LANDMARKS_MIN_ZOOM, landmarkGlbs } from "./three/layers/landmarks";
