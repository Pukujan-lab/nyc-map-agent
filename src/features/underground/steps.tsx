import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CALIBRATION_SAMPLE_MS, alongLabel, steadyHeading } from "./cues";

/** Shown with every platform calibration step and the pointer's first appearance. */
export const SAFETY_LINE = "Stay behind the yellow line. Never step onto or near the tracks — just point your phone while standing back.";

/** A 5-second progress ring. */
function Ring({ fraction }: { fraction: number }) {
  const c = 2 * Math.PI * 16;
  return (
    <svg viewBox="0 0 40 40" className="h-12 w-12" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label="Holding still">
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
      <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - fraction)} transform="rotate(-90 20 20)" />
    </svg>
  );
}

/**
 * The optional platform calibration. Option A (default): hold the phone flat,
 * pointing the way the train went, for 5 seconds. Option B: face the tracks and
 * tap which way the train left. Either way the person only points the phone;
 * they never walk. Samples the compass for 5 s; an unsteady run is rejected.
 */
export function CalibrationStep({ raw, onDone, onSkip, waiting }: { raw: number | null; onDone: (heading: number, trainWent: "front" | "left" | "right") => void; onSkip: () => void; waiting: boolean }) {
  const [facing, setFacing] = useState(false);
  const [went, setWent] = useState<"front" | "left" | "right">("front");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const samples = useRef<number[]>([]);
  const [result, setResult] = useState<ReturnType<typeof steadyHeading> | null>(null);

  const rawRef = useRef(raw);
  rawRef.current = raw;
  useEffect(() => {
    if (startedAt === null) return;
    // Sample every 100 ms (a steady phone repeats the same reading; that still counts).
    const t = setInterval(() => {
      const n = Date.now();
      setNowMs(n);
      if (rawRef.current !== null) samples.current.push(rawRef.current);
      if (n - startedAt >= CALIBRATION_SAMPLE_MS) {
        setResult(steadyHeading(samples.current));
        setStartedAt(null);
      }
    }, 100);
    return () => clearInterval(t);
  }, [startedAt]);
  const start = (w: "front" | "left" | "right") => {
    setWent(w);
    samples.current = [];
    setResult(null);
    setNowMs(Date.now());
    setStartedAt(Date.now());
  };
  const sampling = startedAt !== null;
  const fraction = sampling ? Math.min(1, (nowMs - startedAt) / CALIBRATION_SAMPLE_MS) : result?.ok ? 1 : 0;

  return (
    <div className="space-y-2" data-testid="calibration-step">
      {facing ? (
        <p className="font-medium">Stand where you are, facing the tracks, phone flat. Which way did the train leave? Then hold still for 5 seconds.</p>
      ) : (
        <p className="font-medium">Hold your phone flat, pointing the way the train went, for 5 seconds. Stand where you are.</p>
      )}
      <div className="flex items-center gap-3">
        <Ring fraction={fraction} />
        <div className="flex flex-1 flex-col gap-1">
          {result?.ok ? (
            <Button type="button" size="sm" onClick={() => onDone(result.heading, went)}>
              Done
            </Button>
          ) : facing ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" className="flex-1" disabled={waiting || sampling} onClick={() => start("left")}>
                ◀ Left
              </Button>
              <Button type="button" size="sm" className="flex-1" disabled={waiting || sampling} onClick={() => start("right")}>
                Right ▶
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" disabled={waiting || sampling} onClick={() => start("front")}>
              {waiting ? "Starting the compass…" : sampling ? "Hold still…" : result ? "Try again" : "Start"}
            </Button>
          )}
          {result && !result.ok && (
            <p className="text-xs">{result.reason === "unsteady" ? `The compass moved around too much (about ${result.spread}°). Hold still and try again.` : "No compass readings came in. Try again, or skip."}</p>
          )}
        </div>
      </div>
      <p role="note" className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-1.5 text-xs font-medium">
        {SAFETY_LINE}
      </p>
      <div className="flex gap-2 text-xs">
        {!facing && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setFacing(true)}>
            Or: I'm facing the tracks
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

/** The big pointer toward the chosen exit while a calibration is fresh. It fades when it stops being trustworthy. */
export function ExitPointer({ rotation, visible, distanceM, firstTime, hiddenReason }: { rotation: number; visible: boolean; distanceM: number | null; firstTime: boolean; hiddenReason: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2" data-testid="exit-pointer">
      <div className={`flex h-28 w-28 items-center justify-center rounded-full border-4 border-primary/40 transition-opacity duration-700 ${visible ? "opacity-100" : "opacity-15"}`}>
        <ArrowUp className="h-20 w-20 text-primary transition-transform duration-200" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden />
      </div>
      <p className="text-sm font-medium">{visible ? `Exit about ${distanceM ?? "?"} m that way` : hiddenReason}</p>
      <p className="text-xs text-muted-foreground">Approximate: measured from the middle of the station, not from where you stand.</p>
      {firstTime && visible && <p className="text-center text-xs font-medium">{SAFETY_LINE}</p>}
    </div>
  );
}

/**
 * A small platform sketch from static data: the platform as a line, the train
 * direction, and the exit's position along it from the station point. Works
 * offline and without a compass. Not to scale beyond "front / middle / back".
 */
export function PlatformMap({ alongM }: { alongM: number | null }) {
  const label = alongLabel(alongM);
  if (alongM === null || !label) return null;
  const half = 160; // metres shown either side of the middle
  const x = 150 + Math.max(-1, Math.min(1, alongM / half)) * 120;
  return (
    <figure className="space-y-1" aria-label="Platform sketch">
      <svg viewBox="0 0 300 70" className="w-full" role="img" aria-label={label}>
        <text x="20" y="14" fontSize="10" fill="currentColor" opacity="0.7">back</text>
        <text x="252" y="14" fontSize="10" fill="currentColor" opacity="0.7">front</text>
        <rect x="20" y="30" width="260" height="10" rx="3" fill="currentColor" opacity="0.15" />
        <line x1="150" y1="24" x2="150" y2="46" stroke="currentColor" strokeDasharray="2 2" opacity="0.6" />
        <path d="M120 58 H180 M172 53 L180 58 L172 63" stroke="currentColor" fill="none" strokeWidth="2" />
        <text x="190" y="62" fontSize="9" fill="currentColor">train went</text>
        <circle cx={x} cy="35" r="8" fill="#16a34a" stroke="#fff" strokeWidth="2" />
        <text x={x} y="38.5" fontSize="9" textAnchor="middle" fill="#fff" fontWeight="bold">E</text>
      </svg>
      <figcaption className="text-xs">{label}. The dashed line is the middle of the station.</figcaption>
    </figure>
  );
}
