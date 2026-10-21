/**
 * First-person navigation for the map. There is no terrain and no game engine:
 * walking is a camera placed 1.7 m above the street that you drive with the keyboard, so
 * the arithmetic lives here and can be tested without a WebGL context.
 */

/**
 * Eye height in metres. MapLibre 5 can place the camera itself
 * (`calculateCameraOptionsFromCameraLngLatAltRotation`), so street level is a
 * real pedestrian eye 1.7 m above the pavement, not a pitch/zoom compromise.
 */
export const EYE_HEIGHT_M = 1.7;
/**
 * Default look angle: 90° is level with the horizon, so 86° looks a touch
 * down the street — the horizon sits in the upper third and buildings rise.
 */
export const WALK_PITCH = 86;
/** Drag-to-look range: from the kerb at your feet up to the rooftops. */
export const LOOK_MIN_PITCH = 55;
export const LOOK_MAX_PITCH = 115;
/** The map's pitch ceiling while walking (MapLibre 5 allows up to 180). */
export const WALK_MAX_PITCH = 120;
/** Zoom ceiling while walking; an eye 1.7 m up lands around z21.5–22.5. */
export const WALK_MAX_ZOOM = 24;
/** Distance to the point the camera aims at; it becomes the map centre. */
export const LOOK_AHEAD_M = 30;
/** Degrees of look per dragged pixel. */
export const LOOK_DEG_PER_PX = 0.25;

export function clampLookPitch(pitch: number): number {
  return Math.min(LOOK_MAX_PITCH, Math.max(LOOK_MIN_PITCH, pitch));
}

/**
 * Eases a bearing towards a target along the short way round, so following a
 * route turns corners like a walker rather than snapping 90°.
 */
export function approachBearing(current: number, target: number, dt: number, rate = 6): number {
  const delta = ((target - current + 540) % 360) - 180;
  const t = 1 - Math.exp(-rate * Math.max(0, dt));
  return normalizeBearing(current + delta * t);
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

/**
 * Snaps a point to the nearest street centreline so the eye never spawns
 * inside a building footprint or against a wall: the middle of the street is
 * the one place guaranteed to be clear on both sides. Returns the snapped
 * point and the street's direction, picking whichever way along the street
 * is closer to `preferBearing`. `maxMetres` bounds the search.
 */
export function snapToStreet(
  point: [number, number],
  lines: Array<Array<[number, number]>>,
  preferBearing: number,
  maxMetres = 250,
): { lon: number; lat: number; bearing: number; distance: number } | null {
  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [
    (p[0] - point[0]) * METERS_PER_DEGREE * cosLat,
    (p[1] - point[1]) * METERS_PER_DEGREE,
  ];
  let best: { x: number; y: number; d: number; dx: number; dy: number } | null = null;
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) {
      const [ax, ay] = toXY(line[i - 1]);
      const [bx, by] = toXY(line[i]);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const x = ax + t * dx;
      const y = ay + t * dy;
      const d = Math.hypot(x, y);
      if (d <= maxMetres && (!best || d < best.d)) best = { x, y, d, dx, dy };
    }
  }
  if (!best) return null;
  const along = normalizeBearing((Math.atan2(best.dx, best.dy) * 180) / Math.PI);
  const diff = (b: number) => Math.abs(((b - preferBearing + 540) % 360) - 180);
  const bearing = diff(along) <= diff(along + 180) ? along : normalizeBearing(along + 180);
  return {
    lon: point[0] + best.x / (METERS_PER_DEGREE * cosLat),
    lat: point[1] + best.y / METERS_PER_DEGREE,
    bearing,
    distance: best.d,
  };
}
