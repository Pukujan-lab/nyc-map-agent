import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Live subway trains as route bullets (#174): a filled circle in the line's
 * colour with the route in bold white (black on the yellow N/Q/R/W), a
 * diamond for express trips (route ids ending in X, e.g. 6X, 7X), drawn here
 * on a canvas — no MTA image files. A separate small notch icon, rotated to
 * the bearing, sits on the rim so the bullet text never rotates. An amber
 * '!' corner mark flags routes with an active delay or reroute alert.
 */
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
export function busBadgeId(text: string, color: string, alert = false): string {
  return `${BUS_PREFIX}${text}|${color.replace("#", "")}|${alert ? 1 : 0}`;
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
  const { text, express, darkText } = bulletFace(route);
  const c = SIZE / 2, r = SIZE / 2 - 5;
  ctx.beginPath();
  if (express) { ctx.moveTo(c, c - r - 2); ctx.lineTo(c + r + 2, c); ctx.lineTo(c, c + r + 2); ctx.lineTo(c - r - 2, c); ctx.closePath(); }
  else ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  ctx.fillStyle = darkText ? "#111111" : "#ffffff";
  ctx.font = `bold ${text.length > 1 ? 24 : 32}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c, c + 2);
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

/** A row of route bullets under a station name: "2:EE352E,3:EE352E,...". */
function drawStrip(spec: string): ImageData | null {
  const items = spec.split(",").filter(Boolean).map((x) => x.split(":"));
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx || !items.length) return null;
  const d = 30, gap = 3;
  ctx.canvas.width = items.length * (d + gap) + gap;
  ctx.canvas.height = d + gap * 2;
  items.forEach(([route, hex], i) => {
    const one = draw(route, `#${hex || "808183"}`, false);
    if (!one) return;
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = SIZE;
    tmp.getContext("2d")?.putImageData(one, 0, 0);
    ctx.drawImage(tmp, gap + i * (d + gap), gap, d, d);
  });
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** styleimagemissing handler: draws bullets on demand and the notch once. */
export function addBulletImage(map: MaplibreMap, id: string): void {
  if (map.hasImage(id)) return;
  if (id === NOTCH_ICON) { const n = notch(); if (n) map.addImage(id, n, { pixelRatio: 2 }); return; }
  if (id.startsWith("stnbullets|")) { const img = drawStrip(id.slice("stnbullets|".length)); if (img) map.addImage(id, img, { pixelRatio: 2 }); return; }
  const [kind, text = "", hex = "808080", alert] = id.split("|");
  const img = kind === "busbadge" ? drawBus(text, `#${hex}`, alert === "1") : kind === "bullet" ? draw(text, `#${hex}`, alert === "1") : null;
  if (img) map.addImage(id, img, { pixelRatio: 2 });
}
