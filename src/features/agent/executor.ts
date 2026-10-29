import { command, type AgentCommand, type PlaybackSpeed, type Trip } from "./schema";

/** What the client can do for the agent. Injected, so the executor is pure. */
export interface ExecutorContext {
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  showTrip: (trip: Trip) => void;
  openTrip: (trip: Trip) => void;
  enterStreetView: (lon: number, lat: number) => void;
  /** Load the trip into the preview player. It waits for the person to press Play. */
  playFlythrough: (trip: Trip, speed: PlaybackSpeed) => void;
  setTime: (iso: string) => void;
}

export type ExecResult = { ok: true; type: AgentCommand["type"] } | { ok: false; error: string };

/** Validate an untrusted command from the stream, then run it. Never throws. */
export function executeCommand(raw: unknown, ctx: ExecutorContext): ExecResult {
  const parsed = command.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid command" };
  const c = parsed.data;
  try {
    switch (c.type) {
      case "flyTo": ctx.flyTo(c.lon, c.lat, c.zoom); break;
      case "showRoute": ctx.showTrip(c.trip); break;
      case "openPanel": ctx.openTrip(c.trip); break;
      case "enterStreetView": ctx.enterStreetView(c.lon, c.lat); break;
      case "playFlythrough": ctx.playFlythrough(c.trip, c.speed); break;
      case "setTime": ctx.setTime(c.iso); break;
    }
    return { ok: true, type: c.type };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "command failed" };
  }
}
