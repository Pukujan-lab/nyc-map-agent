import type { Trip } from "./schema";

/**
 * The four ways to ask again for the same trip (owner, 2026-10-26): the subway only, the bus only,
 * walking the whole way, or the least walking. Each is a plain question to the planner, with both ends
 * kept exact: "here" for your location, and the spot itself for a place. Pure.
 */
export type TripChoice = "subway" | "bus" | "walk" | "less-walking";
export const TRIP_CHOICES: TripChoice[] = ["subway", "bus", "walk", "less-walking"];

const placeText = (p: Trip["origin"]) => p.label === "your location" ? "here" : `${p.label} (${p.at[1].toFixed(5)}, ${p.at[0].toFixed(5)})`;

export function tripChoiceQuestion(trip: Pick<Trip, "origin" | "destination">, c: TripChoice): string {
  const span = `from ${placeText(trip.origin)} to ${placeText(trip.destination)}`;
  switch (c) {
    case "subway": return `By subway only, ${span}.`;
    case "bus": return `By bus only, ${span}.`;
    case "walk": return `Walking the whole way, ${span}.`;
    case "less-walking": return `The way with the least walking, ${span}.`;
  }
}
