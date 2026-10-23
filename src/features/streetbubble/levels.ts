import { z } from "zod";

/** The four steps the street_stats mart assigns by citywide quartile. */
export const LEVELS = ["green", "yellow", "orange", "red"] as const;
export type Level = (typeof LEVELS)[number];

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

/** Tailwind classes per level (static strings so the compiler sees them). */
export const LEVEL_STYLE: Record<Level, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-green-500", text: "text-green-700 dark:text-green-400", label: "Low" },
  yellow: { dot: "bg-yellow-400", text: "text-yellow-700 dark:text-yellow-300", label: "Moderate" },
  orange: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", label: "High" },
  red: { dot: "bg-red-500", text: "text-red-700 dark:text-red-400", label: "Very high" },
};

/** Unknown or missing levels fall back to a neutral grey, never a misleading green. */
export function levelStyle(level: unknown): { dot: string; text: string; label: string } {
  return isLevel(level)
    ? LEVEL_STYLE[level]
    : { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "No data" };
}

const count = z.coerce.number().finite();

export const StreetRow = z.object({
  street: z.string(),
  borough: z.string().nullable(),
  noise_12mo: count,
  crashes_12mo: count,
  injury_crashes_12mo: count,
  fatal_crashes_12mo: count,
  noise_level: z.string().nullable(),
  crash_level: z.string().nullable(),
});
export type StreetRow = z.infer<typeof StreetRow>;

export const StreetResponse = z.object({ rows: z.array(StreetRow) });

/** "Grand Street & Essex Street" -> "Grand Street": the street underfoot. */
export function streetFromLabel(label: string | null | undefined): string | null {
  const name = (label ?? "").split(" & ")[0]?.trim() ?? "";
  return name.length >= 2 ? name : null;
}

/**
 * The walk header has no borough, and the API returns one row per borough
 * (busiest noise first). Take the first row with a borough, else the first row.
 */
export function pickRow(rows: StreetRow[]): StreetRow | null {
  return rows.find((r) => r.borough) ?? rows[0] ?? null;
}
