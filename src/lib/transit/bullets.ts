/**
 * MTA route bullets, shared by the 2D map and the 3D entrance signs: the official line colours and
 * one canvas drawing function. A filled circle in the line colour with the route in bold white
 * (black on the yellow N Q R W), a diamond for express-only service (route ids ending in X).
 */
export const ROUTE_COLORS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
  G: "#6CBE45",
  J: "#996633", Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  S: "#808183", GS: "#808183", FS: "#808183", H: "#808183",
  SI: "#1D2F6F", SIR: "#1D2F6F",
};
export const BULLET_FONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';

/** Label, shape and text colour for a GTFS route id. Pure. */
export function routeFace(route: string): { text: string; express: boolean; darkText: boolean; color: string } {
  const express = /^[0-9A-Z]X$/.test(route);
  const base = express ? route.slice(0, 1) : route;
  const text = base === "GS" || base === "FS" || base === "H" ? "S" : base === "SIR" ? "SIR" : base;
  return { text, express, darkText: ["N", "Q", "R", "W"].includes(text), color: ROUTE_COLORS[base] ?? "#808183" };
}

/** Draws one bullet centred at (cx, cy) with radius r. `color` overrides the table (e.g. a GTFS colour). */
export function drawRouteBullet(ctx: CanvasRenderingContext2D, route: string, cx: number, cy: number, r: number, color?: string): void {
  const f = routeFace(route);
  ctx.beginPath();
  if (f.express) { const d = r * 1.12; ctx.moveTo(cx, cy - d); ctx.lineTo(cx + d, cy); ctx.lineTo(cx, cy + d); ctx.lineTo(cx - d, cy); ctx.closePath(); }
  else ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color ?? f.color;
  ctx.fill();
  ctx.fillStyle = f.darkText ? "#111111" : "#ffffff";
  ctx.font = `bold ${Math.round(r * (f.text.length > 1 ? 1.05 : 1.45))}px ${BULLET_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(f.text, cx, cy + r * 0.07);
}
