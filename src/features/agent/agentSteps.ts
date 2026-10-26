import type { StreamEvent } from "./schema";
import { localStatus, statusKind } from "./statusLines";

/** One row of the "Agents working" list (#370). */
export interface AgentStep {
  id: string;
  name: string;
  status: "start" | "done" | "error";
}

/** Plain words for each tool's row in the list. */
const WORDS: Record<string, string> = {
  transit_plan: "Planning the transit trip",
  route_walk: "Planning the walk",
  drive_plan: "Planning the drive",
  geocode: "Finding the place",
  nearest_restroom: "Finding restrooms nearby",
  weather_forecast: "Checking the weather",
  hazards: "Checking weather alerts",
  elevator_status: "Checking elevators",
  station_exit: "Finding your exit",
  flyTo: "Moving the map",
  showRoute: "Drawing the route",
  openPanel: "Opening the trip card",
  enterStreetView: "Going to street level",
  playFlythrough: "Preparing the preview",
  setTime: "Setting the map time",
};

/** A tool we have no words for still gets a readable label ("data_query" → "Data query"). */
function fallback(name: string): string {
  const s = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "Working";
}

export const stepLabel = (name: string): string => WORDS[name] ?? fallback(name);

/** The short line spoken when a voice question takes a while, from the step still running, in `lang`. */
export function statusLine(steps: AgentStep[], lang = "en"): string {
  const running = [...steps].reverse().find((s) => s.status === "start");
  return localStatus(statusKind(running?.name), lang);
}

/**
 * Fold one stream event into the step list. `step` lines win; an older server
 * sends only `tool` lines, which still show as rows (each one ends the last).
 */
export function applyStep(steps: AgentStep[], ev: StreamEvent): AgentStep[] {
  if (ev.type === "step") {
    // The `tool` line arrives just before its step; once steps flow, drop those stand-ins.
    const real = steps.filter((s) => !s.id.startsWith("tool:"));
    const i = real.findIndex((s) => s.id === ev.id);
    if (i < 0) return [...real, { id: ev.id, name: ev.name, status: ev.status }];
    return real.map((s, j) => (j === i ? { ...s, status: ev.status } : s));
  }
  if (ev.type === "tool") {
    if (steps.some((s) => !s.id.startsWith("tool:"))) return steps; // the server sends real steps
    const closed = steps.map((s) => (s.status === "start" ? { ...s, status: "done" as const } : s));
    return [...closed, { id: `tool:${steps.length}`, name: ev.name, status: "start" }];
  }
  if (ev.type === "done" || ev.type === "error") return steps.map((s) => (s.status === "start" ? { ...s, status: ev.type === "done" ? "done" : "error" } : s));
  return steps;
}
