/** The standard restroom pictogram (never "WC"), in the 24-unit box of homeIcons' RestroomIcon. */
export const RESTROOM_PICTOGRAM = [
  "M7 2a2 2 0 1 0 0 4 2 2 0 1 0 0-4Z",
  "M5 7h4l1 7H8.5v7h-3v-7H4l1-7Z",
  "M17 2a2 2 0 1 0 0 4 2 2 0 1 0 0-4Z",
  "M15.2 7h3.6l2.2 8h-2.5v6h-3v-6H13l2.2-8Z",
];

/** Draw the pictogram centred on (cx, cy), `size` px tall. */
export function drawRestroomPictogram(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  for (const d of RESTROOM_PICTOGRAM) ctx.fill(new Path2D(d));
  ctx.restore();
}
