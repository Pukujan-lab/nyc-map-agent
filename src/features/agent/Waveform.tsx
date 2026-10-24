import { useEffect, useRef, useState } from "react";

/** RMS of a time-domain frame, scaled to 0..1 for drawing (speech sits around 0.02-0.2). */
export function levelOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / (buf.length || 1));
  return Math.min(1, rms * 6);
}

/**
 * A Siri-style live waveform (#370) drawn from the microphone level through a
 * Web Audio AnalyserNode. The audio is analysed in memory only: never recorded,
 * stored or sent, and the mic is released when listening stops. If the mic
 * cannot be opened here (the recognizer may still work), it draws a calm idle wave.
 */
export function Waveform({ active, className }: { active: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let buf: Float32Array | null = null;
    let level = 0;
    let phase = 0;
    const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        buf = new Float32Array(analyser.fftSize);
        setLive(true);
      } catch {
        if (!stopped) setLive(false);
      }
    })();

    const draw = () => {
      const c = canvas.current;
      const g = c?.getContext("2d");
      if (c && g) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        let target = 0.08;
        if (analyser && buf) {
          analyser.getFloatTimeDomainData(buf);
          target = Math.max(0.04, levelOf(buf));
        }
        level += (target - level) * 0.25;
        if (!still) phase += 0.12;
        const color = getComputedStyle(c).color;
        const mid = h / 2;
        // Three soft waves, the loudest in front; each tapers to zero at the edges.
        [[1, 1, 2.2], [0.6, 0.45, 3.1], [0.35, 0.25, 1.4]].forEach(([amp, alpha, freq], k) => {
          g.beginPath();
          g.globalAlpha = alpha;
          g.lineWidth = k === 0 ? 2.5 : 1.5;
          g.strokeStyle = color;
          for (let x = 0; x <= w; x += 2) {
            const t = x / w;
            const taper = Math.sin(Math.PI * t);
            const y = mid + Math.sin(t * Math.PI * 2 * freq + phase * (k + 1) * 0.7) * taper * level * amp * (h * 0.45);
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        });
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [active]);

  return (
    <div className={className}>
      <canvas ref={canvas} className="h-full w-full text-primary" aria-hidden="true" data-testid="voice-waveform" data-live={live === null ? "pending" : String(live)} />
    </div>
  );
}
