import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Live subway trains as route bullets (#174): a filled circle in the line's
 * colour with the route in bold white (black on the yellow N/Q/R/W), a
 * diamond for express trips (route ids ending in X, e.g. 6X, 7X), drawn here
 * on a canvas — no MTA image files. A separate small notch icon, rotated to
 * the bearing, sits on the rim so the bullet text never rotates. An amber
 * '!' corner mark flags routes with an active delay or reroute alert.
 */
/**
 * Shared, neutral module (#177): used by live-train bullets, station labels and
 * the 3D entrance signs. LINE_COLORS is the MTA line-colour table; routeBullet
 * draws one bullet on any canvas.
 */
export const LINE_COLORS: Record<string, string> = {
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", FX: "#FF6319", M: "#FF6319",
  G: "#6CBE45", J: "#996633", Z: "#996633", L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C", "6X": "#00933C",
  "7": "#B933AD", "7X": "#B933AD", GS: "#808183", FS: "#808183", H: "#808183", SI: "#0039A6",
};
export const lineColor = (route: string): string => LINE_COLORS[route] ?? "#808183";

/** Draw one MTA-style bullet (circle, or diamond for express) centred at (cx, cy) with radius r. */
export function routeBullet(ctx: CanvasRenderingContext2D, route: string, cx: number, cy: number, r: number, color = lineColor(route), ring = true): void {
  const { text, express, darkText } = bulletFace(route);
  ctx.beginPath();
  if (express) { ctx.moveTo(cx, cy - r - 2); ctx.lineTo(cx + r + 2, cy); ctx.lineTo(cx, cy + r + 2); ctx.lineTo(cx - r - 2, cy); ctx.closePath(); }
  else ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (ring) { ctx.lineWidth = Math.max(1.5, r / 9); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke(); }
  ctx.fillStyle = darkText ? "#111111" : "#ffffff";
  ctx.font = `bold ${Math.round(r * (text.length > 1 ? 0.9 : 1.2))}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + r * 0.08);
}

/** A compact row of bullets for a station's routes, as one map image id. */
export const STATION_ROW_PREFIX = "strow|";
export const stationRowId = (routes: string[]): string => `${STATION_ROW_PREFIX}${routes.join(",")}`;
function drawRow(routes: string[]): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx || !routes.length) return null;
  const r = 14, step = 2 * r + 4;
  ctx.canvas.width = routes.length * step + 4;
  ctx.canvas.height = 2 * r + 8;
  routes.forEach((rt, i) => routeBullet(ctx, rt, 2 + r + 2 + i * step, r + 4, r));
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export const BULLET_PREFIX = "bullet|";
export const NOTCH_ICON = "bullet-notch";
const SIZE = 64; // drawn at pixelRatio 2 -> 32 css px at icon-size 1

/** Route label and shape for a GTFS route id. Pure, for tests. */
export function bulletFace(route: string): { text: string; express: boolean; darkText: boolean } {
  const express = /^[0-9A-Z]X$/.test(route);
  const text = express ? route.slice(0, 1) : route === "GS" || route === "FS" || route === "H" ? "S" : route;
  return { text, express, darkText: ["N", "Q", "R", "W"].includes(text) };
}

export function bulletId(route: string, color: string, alert = false): string {
  return `${BULLET_PREFIX}${route}|${color.replace("#", "")}|${alert ? 1 : 0}`;
}

/**
 * Buses read like subway bullets but SQUARE (rounded corners), so they never
 * pass for a train. Zoomed out a badge shows only the borough prefix
 * (B, Bx, Q, M, S; BM/QM/BxM/X/SIM express); from z15 or when its route is
 * selected it widens to the full route (M42, Bx12, BM3).
 */
export const BUS_PREFIX = "busbadge|";
export function busPrefix(route: string): { text: string; express: boolean } {
  const m = /^(BXM|BM|QM|SIM|X|BX|B|Q|M|S)\d/i.exec(route);
  const raw = m ? m[1].toUpperCase() : route.replace(/\d.*$/, "").toUpperCase() || "BUS";
  const text = raw === "BX" ? "Bx" : raw === "BXM" ? "BxM" : raw;
  return { text, express: /M$|^X$|^SIM$/.test(raw) && raw !== "M" };
}
/** Which MTA paint a bus wears: local (2016 navy), Select Bus Service (white, light-blue wrap), express (white, blue stripe). */
export type BusLivery = "local" | "sbs" | "express";
/** SBS routes end in "+"; express are the QM, BM, BxM, X and SIM routes. */
export function busLivery(route: string): BusLivery {
  if (route.endsWith("+")) return "sbs";
  return busPrefix(route).express ? "express" : "local";
}
export function busBadgeId(text: string, color: string, alert = false): string {
  return `${BUS_PREFIX}${text}|${color.replace("#", "")}|${alert ? 1 : 0}`;
}

/**
 * Zoom stops for a bus badge, as [zoom, size, ...]. The image is about 28 css
 * px at size 1, and a subway bullet is 32. A borough filter keeps the count
 * down, so the badge can sit at that same size instead of a speck.
 */
export const BUS_ICON_STOPS = {
  prefix: [10, 0.58, 14, 0.92],
  full: [15, 1.05, 18, 1.35],
  selected: [10, 0.95, 16, 1.3],
  notch: [10, 0.55, 14, 0.9, 15, 1.05, 18, 1.35],
} as const;

export function busIconSize(kind: keyof typeof BUS_ICON_STOPS): number {
  return ["interpolate", ["linear"], ["zoom"], ...BUS_ICON_STOPS[kind]] as unknown as number;
}

function alertMark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#F2B100";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111111";
  ctx.stroke();
  ctx.fillStyle = "#111111";
  ctx.font = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + 1);
}

function drawBus(text: string, color: string, alert: boolean): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const font = `bold ${text.length > 3 ? 22 : 24}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const h = 44, pad = 10, m = 6; // margin leaves room for the stroke and the alert mark
  const w = Math.max(h, Math.ceil(ctx.measureText(text).width) + pad * 2);
  ctx.canvas.width = w + m * 2 + (alert ? 8 : 0);
  ctx.canvas.height = h + m * 2 + (alert ? 8 : 0);
  const x = m, y = m + (alert ? 8 : 0);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 2);
  if (alert) alertMark(ctx, x + w, y);
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function draw(route: string, color: string, alert: boolean): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.canvas.width = ctx.canvas.height = SIZE;
  routeBullet(ctx, route, SIZE / 2, SIZE / 2, SIZE / 2 - 5, color);
  if (alert) alertMark(ctx, SIZE - 10, 10);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

function notch(): ImageData | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.canvas.width = ctx.canvas.height = 24;
  ctx.beginPath();
  ctx.moveTo(12, 2); ctx.lineTo(21, 18); ctx.lineTo(3, 18); ctx.closePath();
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  return ctx.getImageData(0, 0, 24, 24);
}

/** styleimagemissing handler: draws bullets on demand and the notch once. */
export function addBulletImage(map: MaplibreMap, id: string): void {
  if (map.hasImage(id)) return;
  if (id === NOTCH_ICON) { const n = notch(); if (n) map.addImage(id, n, { pixelRatio: 2 }); return; }
  if (id.startsWith(STATION_ROW_PREFIX)) { const img = drawRow(id.slice(STATION_ROW_PREFIX.length).split(",").filter(Boolean)); if (img) map.addImage(id, img, { pixelRatio: 2 }); return; }
  const [kind, text = "", hex = "808080", alert] = id.split("|");
  const img = kind === "busbadge" ? drawBus(text, `#${hex}`, alert === "1") : kind === "bullet" ? draw(text, `#${hex}`, alert === "1") : null;
  if (img) map.addImage(id, img, { pixelRatio: 2 });
}
