import type { Precip } from "@/lib/weather/street";

/**
 * Rain, snow or sleet drawn on one 2D canvas over the street view. Cheap on
 * purpose: at most MAX particles (fewer on small screens and at low
 * intensity), one batched path per frame, the backing store capped at 1.5x
 * device pixels, and no frames at all while the tab is hidden.
 */
export const MAX_PARTICLES = 260;

interface P {
  x: number;
  y: number;
  z: number; // 0 far .. 1 near: speed, size, length
  w: number; // wobble phase (snow)
}

/** How many particles for this intensity and canvas area (CSS px). Pure. */
export function particleCount(intensity: number, w: number, h: number): number {
  const byArea = Math.min(1, (w * h) / (1280 * 800));
  return Math.round(MAX_PARTICLES * Math.min(1, Math.max(0, intensity)) * Math.max(0.35, byArea));
}

export interface PrecipHandle {
  set: (p: Precip) => void;
  stop: () => void;
  /** Smoothed frames per second over the last ~second (dev measurement). */
  fps: () => number;
}

export function startPrecip(canvas: HTMLCanvasElement, initial: Precip): PrecipHandle {
  const ctx = canvas.getContext("2d");
  let precip = initial;
  let parts: P[] = [];
  let raf = 0;
  let last = performance.now();
  let fps = 0;
  let w = 0;
  let h = 0;
  let scale = 1;

  const seed = (p: P) => {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    p.z = Math.random();
    p.w = Math.random() * Math.PI * 2;
    return p;
  };

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const n = particleCount(precip.intensity, w, h);
    parts = parts.slice(0, n);
    while (parts.length < n) parts.push(seed({ x: 0, y: 0, z: 0, w: 0 }));
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    if (dt > 0) fps = fps ? fps * 0.95 + (1 / dt) * 0.05 : 1 / dt;
    last = now;
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { type, intensity } = precip;
    const drift = 40 + 80 * intensity; // px/s sideways, wind-ish
    if (type === "rain" || type === "sleet") {
      // Streaks: one stroke for all of them.
      ctx.strokeStyle = type === "rain" ? "rgba(200,214,232,0.55)" : "rgba(225,232,240,0.6)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const step = type === "sleet" ? 2 : 1;
      for (let i = 0; i < parts.length; i += step) {
        const p = parts[i];
        const v = 700 + 600 * p.z;
        p.y += v * dt;
        p.x += drift * dt;
        if (p.y > h) { p.y -= h + 20; p.x = Math.random() * w; }
        if (p.x > w) p.x -= w;
        const len = (type === "sleet" ? 6 : 10) + 14 * p.z * (0.5 + intensity);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (drift / v) * len, p.y - len);
      }
      ctx.stroke();
    }
    if (type === "snow" || type === "sleet") {
      // Flakes (or pellets in sleet): one fill for all of them.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      for (let i = type === "sleet" ? 1 : 0; i < parts.length; i += type === "sleet" ? 2 : 1) {
        const p = parts[i];
        const v = type === "snow" ? 40 + 70 * p.z : 400 + 300 * p.z;
        p.w += dt * (1 + p.z);
        p.y += v * dt;
        p.x += (type === "snow" ? Math.sin(p.w) * 25 + drift * 0.25 : drift) * dt;
        if (p.y > h) { p.y -= h + 10; p.x = Math.random() * w; }
        if (p.x > w) p.x -= w;
        if (p.x < 0) p.x += w;
        const r = type === "snow" ? 1 + 2.2 * p.z : 0.8 + 1.2 * p.z;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  };

  const play = () => {
    if (raf || document.hidden || precip.type === "none") return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? pause() : play());

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  resize();
  play();

  return {
    set: (p) => {
      precip = p;
      resize();
      if (p.type === "none") {
        pause();
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      } else play();
    },
    stop: () => {
      pause();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
    fps: () => Math.round(fps),
  };
}
