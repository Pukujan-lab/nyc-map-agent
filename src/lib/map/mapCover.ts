import type { Map as MapLibreMap } from "maplibre-gl";

/** Pixels to keep clear on each edge of the map. */
export interface Insets { top: number; bottom: number; left: number; right: number }

/**
 * Panels and menus that sit over the map. While one is open the map's centre
 * moves into the part you can still see, so a followed train or your own dot
 * is not hidden under it. Phones: a panel across the top or bottom pads that
 * edge. Tablets and desktops: a panel docked to one side pads that side.
 */
export const COVER_SELECTOR = "[data-map-cover], .task-top, .task-bottom";

const GAP = 12;
const NONE: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

interface Box { left: number; top: number; right: number; bottom: number }

/**
 * The padding each edge needs to clear the covers, in map pixels. A strip of map always stays
 * clear for the focus (you, a followed train, the answer's place): at least a quarter of the map
 * and 160 px each way, so on a small phone the focus sits in the gap rather than under a panel.
 */
export function coverInsets(map: Box, covers: Box[]): Insets {
  const w = map.right - map.left, h = map.bottom - map.top;
  const pad = { ...NONE };
  for (const c of covers) {
    const l = Math.max(c.left, map.left) - map.left, r = Math.min(c.right, map.right) - map.left;
    const t = Math.max(c.top, map.top) - map.top, b = Math.min(c.bottom, map.bottom) - map.top;
    if (r - l < 1 || b - t < 1) continue;
    if (r - l > w * 0.6) {
      // Across the map: it covers the top or the bottom.
      if ((t + b) / 2 < h / 2) pad.top = Math.max(pad.top, b + GAP);
      else pad.bottom = Math.max(pad.bottom, h - t + GAP);
    } else if ((l + r) / 2 < w / 2) pad.left = Math.max(pad.left, r + GAP);
    else pad.right = Math.max(pad.right, w - l + GAP);
  }
  const [top, bottom] = fit(pad.top, pad.bottom, h);
  const [left, right] = fit(pad.left, pad.right, w);
  return { top, bottom, left, right };
}

/** Shrink two opposite paddings by the same share until the clear strip between them is big enough. */
function fit(a: number, b: number, size: number): [number, number] {
  const room = Math.max(0, size - Math.max(160, size * 0.25));
  const k = a + b > room ? room / (a + b) : 1;
  return [Math.round(a * k), Math.round(b * k)];
}

/** What the open panels and menus cover on this map right now. */
export function measureCover(map: MapLibreMap): Insets {
  const covers = [...document.querySelectorAll<HTMLElement>(COVER_SELECTOR)].map((el) => el.getBoundingClientRect());
  return coverInsets(map.getContainer().getBoundingClientRect(), covers);
}

const same = (a: Insets, b: { top?: number; bottom?: number; left?: number; right?: number }) =>
  Math.abs(a.top - (b.top ?? 0)) < 2 && Math.abs(a.bottom - (b.bottom ?? 0)) < 2 && Math.abs(a.left - (b.left ?? 0)) < 2 && Math.abs(a.right - (b.right ?? 0)) < 2;

/**
 * Padding for a fitBounds while panels are open: the map's own padding already
 * clears them, so only the part of `want` beyond it is added (fitBounds adds the two).
 */
export function framePadding(map: MapLibreMap, want: Insets, margin = 16): Insets {
  const cover = measureCover(map);
  if (!same(cover, map.getPadding())) map.setPadding(cover);
  return {
    top: Math.max(margin, want.top - cover.top),
    bottom: Math.max(margin, want.bottom - cover.bottom),
    left: Math.max(margin, want.left - cover.left),
    right: Math.max(margin, want.right - cover.right),
  };
}

/**
 * Keep the map's padding in step with the open panels and menus. A camera move
 * already under way finishes first, so a panel opening never cuts off its fly-to.
 */
export function watchMapCovers(map: MapLibreMap): () => void {
  let timer = 0;
  let waiting = false;
  const sizes = new ResizeObserver(() => schedule());
  const apply = () => {
    const want = measureCover(map);
    if (same(want, map.getPadding())) return;
    if (map.isMoving()) {
      if (!waiting) { waiting = true; void map.once("moveend", () => { waiting = false; schedule(); }); }
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ padding: want, duration: reduce ? 0 : 350 });
    // Following a train or playing a trip moves the camera every frame, which stops the glide part-way: finish it at once.
    void map.once("moveend", () => {
      if (!same(want, map.getPadding()) && same(want, measureCover(map))) map.setPadding(want);
    });
  };
  function schedule() {
    window.clearTimeout(timer);
    // Menus open with a short grow animation; measure once they have settled.
    timer = window.setTimeout(() => {
      sizes.disconnect();
      document.querySelectorAll(COVER_SELECTOR).forEach((el) => sizes.observe(el));
      apply();
    }, 160);
  }
  const added = new MutationObserver(schedule);
  added.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  schedule();
  const stop = () => {
    window.clearTimeout(timer);
    added.disconnect();
    sizes.disconnect();
    window.removeEventListener("resize", schedule);
  };
  void map.once("remove", stop);
  return stop;
}
