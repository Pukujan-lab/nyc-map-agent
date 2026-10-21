/**
 * First-person navigation for the map. There is no terrain and no game engine:
 * walking is just a steeply pitched camera that you drive with the keyboard, so
 * the arithmetic lives here and can be tested without a WebGL context.
 */

/**
 * Street-level pitch. 85° (MapLibre's ceiling) at zoom 21 put the eye ~7 m up
 * but rendered the vector tiles ~6 zooms past their native maximum (OpenFreeMap
 * tops out at z14 vector data), so roads, labels and building edges turned to
 * blur. 75° keeps a horizon in frame while leaving the ground readable.
 */
export const WALK_PITCH = 75;
/**
 * Camera zoom while walking, capped at 18.5. Camera height is roughly
 * `1.5 × viewport px × metres-per-pixel × cos(pitch)`; at 75° and z18.5 that is
 * ~60 m for a 900 px viewport — a low-flying drone rather than eye level, but
 * the tiles and 3D buildings stay sharp, which is what made the old camera
 * unusable. Scroll-zoom is allowed inside `[WALK_MIN_ZOOM, WALK_MAX_ZOOM]`.
 */
export const WALK_ZOOM = 18.5;
export const WALK_MIN_ZOOM = 16.5;
export const WALK_MAX_ZOOM = 19;

export function clampWalkZoom(zoom: number): number {
  return Math.min(WALK_MAX_ZOOM, Math.max(WALK_MIN_ZOOM, zoom));
}

/** Metres per second, before sprinting. */
export const WALK_SPEED = 12;
/** Shift multiplier. A run, not a teleport. */
export const WALK_SPRINT = 3;
/** Degrees per second while a turn key is held. */
export const WALK_TURN_RATE = 80;
/** One frame at 30fps, so a stalled tab cannot fling the camera across the city. */
const MAX_STEP_SECONDS = 0.2;

const METERS_PER_DEGREE = 111320;

export interface WalkPose {
  lon: number;
  lat: number;
  /** Degrees clockwise from north, as MapLibre reports it. */
  bearing: number;
  zoom: number;
}

export interface WalkInput {
  /** +1 forward, -1 back, 0 still. */
  forward: number;
  /** +1 turn right, -1 turn left, 0 still. */
  turn: number;
  sprint: boolean;
}

export const WALK_IDLE: WalkInput = { forward: 0, turn: 0, sprint: false };

export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

/**
 * Advances the camera by one frame. Movement is in ground metres, so walking
 * speed stays constant no matter what zoom the user has scrolled to.
 */
export function stepPose(
  pose: WalkPose,
  input: WalkInput,
  dt: number,
): WalkPose {
  const seconds = Math.max(0, Math.min(dt, MAX_STEP_SECONDS));
  const bearing = normalizeBearing(
    pose.bearing + input.turn * WALK_TURN_RATE * seconds,
  );
  const distance =
    input.forward * WALK_SPEED * (input.sprint ? WALK_SPRINT : 1) * seconds;
  const radians = (bearing * Math.PI) / 180;
  const north = distance * Math.cos(radians);
  const east = distance * Math.sin(radians);
  // Longitude degrees shrink towards the poles; latitude degrees do not.
  const cosLat = Math.max(Math.cos((pose.lat * Math.PI) / 180), 0.01);

  return {
    lon: pose.lon + east / (METERS_PER_DEGREE * cosLat),
    lat: pose.lat + north / METERS_PER_DEGREE,
    bearing,
    zoom: pose.zoom,
  };
}

/**
 * Physical key codes rather than characters, so WASD lands where the player's
 * hand already is on an AZERTY or Dvorak keyboard.
 */
export const WALK_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

/** Keyboard state plus the on-screen pad, resolved into one input. */
export function resolveWalkInput(
  keys: Set<string>,
  pad: WalkInput,
): WalkInput {
  const held = (names: string[]): boolean => names.some((name) => keys.has(name));
  const keyForward =
    (held(["KeyW", "ArrowUp"]) ? 1 : 0) - (held(["KeyS", "ArrowDown"]) ? 1 : 0);
  const keyTurn =
    (held(["KeyD", "ArrowRight"]) ? 1 : 0) - (held(["KeyA", "ArrowLeft"]) ? 1 : 0);
  return {
    forward: keyForward !== 0 ? keyForward : pad.forward,
    turn: keyTurn !== 0 ? keyTurn : pad.turn,
    sprint: held(["ShiftLeft", "ShiftRight"]) || pad.sprint,
  };
}

/** Flat-earth metres between two lon/lat points (fine over a city walk). */
export function metresBetween(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const east = (b[0] - a[0]) * METERS_PER_DEGREE * cosLat;
  const north = (b[1] - a[1]) * METERS_PER_DEGREE;
  return Math.hypot(east, north);
}

export function routeLength(coords: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += metresBetween(coords[i - 1], coords[i]);
  return total;
}

/**
 * Camera pose `distance` metres along a route: position interpolated on the
 * current segment, bearing pointing down that segment. Past the end it stays
 * on the last vertex with `done: true`.
 */
export function poseAlongRoute(
  coords: Array<[number, number]>,
  distance: number,
): { lon: number; lat: number; bearing: number; done: boolean } | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    return { lon: coords[0][0], lat: coords[0][1], bearing: 0, done: true };
  }
  let remaining = Math.max(0, distance);
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const length = metresBetween(a, b);
    const cosLat = Math.cos((a[1] * Math.PI) / 180);
    const bearing = normalizeBearing(
      (Math.atan2((b[0] - a[0]) * cosLat, b[1] - a[1]) * 180) / Math.PI,
    );
    if (remaining <= length || i === coords.length - 1) {
      const t = length > 0 ? Math.min(1, remaining / length) : 1;
      return {
        lon: a[0] + (b[0] - a[0]) * t,
        lat: a[1] + (b[1] - a[1]) * t,
        bearing,
        done: i === coords.length - 1 && remaining >= length,
      };
    }
    remaining -= length;
  }
  return null;
}
