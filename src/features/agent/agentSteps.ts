import type { StreamEvent } from "./schema";

/** One row of the "Agents working" list (#370). */
export interface AgentStep {
  id: string;
  name: string;
  status: "start" | "done" | "error";
}

/** Plain words for each tool: the row label and the line said aloud on a long wait. */
const WORDS: Record<string, { label: string; spoken: string }> = {
  transit_plan: { label: "Planning the transit trip", spoken: "Checking the trains" },
  route_walk: { label: "Planning the walk", spoken: "Working out the walk" },
  drive_plan: { label: "Planning the drive", spoken: "Checking the roads" },
  geocode: { label: "Finding the place", spoken: "Finding the place" },
  nearest_restroom: { label: "Finding restrooms nearby", spoken: "Looking for restrooms nearby" },
  weather_forecast: { label: "Checking the weather", spoken: "Checking the weather" },
  hazards: { label: "Checking weather alerts", spoken: "Checking weather alerts" },
  elevator_status: { label: "Checking elevators", spoken: "Checking the elevators" },
  flyTo: { label: "Moving the map", spoken: "Moving the map" },
  showRoute: { label: "Drawing the route", spoken: "Drawing the route" },
  openPanel: { label: "Opening the trip card", spoken: "Opening the trip card" },
  enterStreetView: { label: "Going to street level", spoken: "Going to street level" },
  playFlythrough: { label: "Preparing the preview", spoken: "Preparing the preview" },
  setTime: { label: "Setting the map time", spoken: "Setting the map time" },
};

/** A tool we have no words for still gets a readable label ("data_query" → "Data query"). */
function fallback(name: string): string {
  const s = name.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "Working";
}

export const stepLabel = (name: string): string => WORDS[name]?.label ?? fallback(name);

/** The short line spoken when a voice question takes a while, from the step still running. */
export function statusLine(steps: AgentStep[]): string {
  const running = [...steps].reverse().find((s) => s.status === "start");
  const words = running ? WORDS[running.name]?.spoken : undefined;
  return `${words ?? "One moment, I'm working on it"}…`;
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
