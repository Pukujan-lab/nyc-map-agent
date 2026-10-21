/**
 * Feature flags: one typed registry, so every module can be switched off.
 *
 * Resolution, last wins:
 *   1. `default` below
 *   2. build env  VITE_FLAGS="-restrooms,+feedHealth"
 *   3. URL        ?flags=-restrooms,+feedHealth   (QA / support links)
 * Then the tier gate: a flag with tier "advanced" is on only when the user's
 * persisted `advancedMode` setting is on (simple by default).
 */
export type FlagTier = "basic" | "advanced";

export interface FlagMeta {
  tier: FlagTier;
  default: boolean;
  label: string;
}

export const FLAGS = {
  search: { tier: "basic", default: true, label: "Search" },
  directions: { tier: "basic", default: true, label: "Walking directions" },
  transit: { tier: "basic", default: true, label: "Live transit" },
  places: { tier: "basic", default: true, label: "Places" },
  restrooms: { tier: "basic", default: true, label: "Public restrooms" },
  signs: { tier: "basic", default: true, label: "Street signs" },
  streetLevel: { tier: "basic", default: true, label: "Street level" },
  city3d: { tier: "basic", default: true, label: "Textured 3D city" },
  noise: { tier: "basic", default: true, label: "Noise layer" },
  blockDensity: { tier: "basic", default: true, label: "Shade blocks per hectare" },
  crashes: { tier: "advanced", default: true, label: "Classic crashes layer" },
  combined: { tier: "advanced", default: true, label: "Noise + crashes" },
  dataLayers: { tier: "advanced", default: true, label: "Data / analytics layers" },
  feedHealth: { tier: "advanced", default: true, label: "Feed health" },
} as const satisfies Record<string, FlagMeta>;

export type FlagId = keyof typeof FLAGS;

export function isFlagId(id: string): id is FlagId {
  return Object.prototype.hasOwnProperty.call(FLAGS, id);
}

/** Parse "-a,+b,c" into overrides; unknown ids are ignored. */
export function parseOverrides(spec: string | null | undefined): Partial<Record<FlagId, boolean>> {
  const out: Partial<Record<FlagId, boolean>> = {};
  for (const raw of (spec ?? "").split(",")) {
    const t = raw.trim();
    if (!t) continue;
    const id = t.replace(/^[+-]/, "");
    if (isFlagId(id)) out[id] = !t.startsWith("-");
  }
  return out;
}

export interface FlagInputs {
  env?: string;
  url?: string | null;
  advancedMode: boolean;
}

export function resolveFlags({ env, url, advancedMode }: FlagInputs): Record<FlagId, boolean> {
  const envO = parseOverrides(env);
  const urlO = parseOverrides(url);
  const out = {} as Record<FlagId, boolean>;
  for (const id of Object.keys(FLAGS) as FlagId[]) {
    const meta: FlagMeta = FLAGS[id];
    const on = urlO[id] ?? envO[id] ?? meta.default;
    out[id] = on && (meta.tier === "basic" || advancedMode);
  }
  return out;
}
