/**
 * First-person navigation for the map. There is no terrain and no game engine:
 * walking is just a steeply pitched camera that you drive with the keyboard, so
 * the arithmetic lives here and can be tested without a WebGL context.
 */

/**
 * Eye level: MapLibre's hard pitch ceiling is 85°, and that is what it takes.
 * At 78° the camera still sits well above the rooftops, which reads as an
 * aerial shot however much the horizon shows.
 */
export const WALK_PITCH = 85;
/**
 * Street level, and it is the zoom that does all of the work. MapLibre has no
 * altitude control — no free camera, no eye-height property — so the camera
 * height is `1.5 × viewport height in px × metres-per-pixel × cos(pitch)`, and
 * at 85° that last term is only 0.087. Metres-per-pixel at this latitude is
 * `118,700 / 2^zoom`:
 *
 * | zoom | height (900 px viewport) |
 * | ---- | ------------------------ |
 * | 17   | ~110 m — a rooftop       |
 * | 19.5 | ~19 m — above the lights |
 * | 21   | ~7 m — a second-floor sill |
 *
 * 21 is the stop where the street fills the frame without pushing the vector
 * tiles so far past their native zoom that the road geometry turns to mush.
 */
export const WALK_ZOOM = 21;
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
