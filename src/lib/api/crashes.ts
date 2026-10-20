import { z } from "zod";
import { escapeSoqlString } from "./noise";

/** Motor Vehicle Collisions - Crashes (NYPD). */
export const CRASH_DATASET = "h9gi-nx95";

export const CRASH_FIELDS = [
  "latitude",
  "longitude",
  "crash_date",
  "crash_time",
  "on_street_name",
  "cross_street_name",
  "number_of_persons_injured",
  "number_of_persons_killed",
  "number_of_cyclist_injured",
  "number_of_pedestrians_injured",
  "contributing_factor_vehicle_1",
] as const;

export const CRASH_SELECT = CRASH_FIELDS.join(",");

export function crashWhere(startIso: string, endIso: string): string {
  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);
  return `crash_date > '${escapeSoqlString(
    startDate,
  )}' AND crash_date < '${escapeSoqlString(
    endDate,
  )}' AND latitude IS NOT NULL AND longitude IS NOT NULL`;
}

const coordinate = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return Number.NaN;
  return typeof value === "number" ? value : Number(value);
}, z.number().finite());

const personCount = z.preprocess((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}, z.number());

export const crashRowSchema = z.object({
  latitude: coordinate,
  longitude: coordinate,
  crash_date: z.string().min(10),
  crash_time: z.string().optional().default(""),
  on_street_name: z.string().optional().default(""),
  cross_street_name: z.string().optional().default(""),
  number_of_persons_injured: personCount,
  number_of_persons_killed: personCount,
  number_of_cyclist_injured: personCount,
  number_of_pedestrians_injured: personCount,
  contributing_factor_vehicle_1: z.string().optional().default(""),
});

export type CrashRow = z.infer<typeof crashRowSchema>;

export function isUnspecifiedFactor(factor: string): boolean {
  const normalized = factor.trim().toLowerCase();
  return normalized === "" || normalized === "unspecified";
}
