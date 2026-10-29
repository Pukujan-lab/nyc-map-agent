import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatStreetName } from "@/lib/streetName";
import { steadyHeading } from "./cues";
import type { Pt } from "./exits";
import { headingFromLandmark, headingFromStreetTap, landmarkToAsk, streetOptions, type LandmarkAnswer, type Line } from "./surface";

const SAMPLE_MS = 3000;

/**
 * Fix the phone's direction above ground, without the train: point it along
 * the street and tap which way, or say where a landmark is, or just walk a
 * few steps. Sensors start only from these taps.
 */
export function SurfaceCalibration(p: {
  at: Pt | null;
  lines: Line[];
  landmarks: Array<{ name: string; at: Pt }>;
  raw: number | null;
  startCompass: () => Promise<boolean>;
  /** Phone pointed `expected` while the compass averaged `mean`. */
  onCalibrated: (expected: number, mean: number) => void;
  /** The person's facing, known without the compass (landmark, or street with no compass). */
  onFacing: (heading: number) => void;
  onShareLocation: () => void;
  onClose: () => void;
}) {
  const opts = p.at ? streetOptions(p.lines, p.at) : null;
  const mark = p.at ? landmarkToAsk(p.at, p.landmarks) : null;
  const [sampling, setSampling] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const samples = useRef<number[]>([]);
  const rawRef = useRef(p.raw);
  rawRef.current = p.raw;
  const target = useRef(0);

  useEffect(() => {
    if (sampling === null) return;
    const t = setInterval(() => {
      if (rawRef.current !== null) samples.current.push(rawRef.current);
      if (Date.now() - sampling >= SAMPLE_MS) {
        setSampling(null);
        const r = steadyHeading(samples.current);
        if (r.ok) {
          p.onCalibrated(target.current, r.heading);
          setMsg("Direction fixed for the next few minutes (approximate).");
        } else setMsg(r.reason === "unsteady" ? "The compass moved around too much. Hold still and tap again." : "No compass readings came in.");
      }
    }, 100);
    return () => clearInterval(t);
    // p.onCalibrated is stable enough for one 3 s run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampling]);

  const tapStreet = async (i: 0 | 1) => {
    if (!opts) return;
    const heading = headingFromStreetTap(opts.options[0].bearing, i);
    target.current = heading;
    setMsg(null);
    if (await p.startCompass()) {
      samples.current = [];
      setSampling(Date.now());
    } else {
      // No compass: the tap itself says which way the phone points.
      p.onFacing(heading);
      setMsg("No compass here, so the map now faces the way you pointed.");
    }
  };

  return (
    <div className="space-y-2" aria-label="Fix my direction">
      {!p.at ? (
        <>
          <p>To fix the direction, the map needs your location once.</p>
          <Button type="button" size="sm" onClick={p.onShareLocation}>
            Use my location
          </Button>
        </>
      ) : (
        <>
          {opts ? (
            <div className="space-y-1">
              <p className="font-medium">Point the top of your phone along {formatStreetName(opts.street)}, then tap which way it points:</p>
              <div className="flex gap-2">
                {opts.options.map((o, i) => (
                  <Button key={o.label} type="button" size="sm" variant="outline" className="h-auto flex-1 whitespace-normal py-1.5" disabled={sampling !== null} onClick={() => void tapStreet(i as 0 | 1)}>
                    {o.label.replace(/^toward (.+)$/, (_, n: string) => `toward ${formatStreetName(n)}`)}
                  </Button>
                ))}
              </div>
              {sampling !== null && <p className="text-xs">Hold still for 3 seconds…</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No street found right where you are on the map.</p>
          )}
          {mark && (
            <div className="space-y-1">
              <p className="font-medium">Is the {mark.name} in front of you?</p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["front", "Yes"],
                    ["behind", "No, it's behind me"],
                    ["left", "On my left"],
                    ["right", "On my right"],
                  ] as Array<[LandmarkAnswer, string]>
                ).map(([a, label]) => (
                  <Button key={a} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => p.onFacing(headingFromLandmark(mark.bearing, a))}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Or just walk 10–15 m: once GPS is good, your steps set the direction.</p>
        </>
      )}
      {msg && <p className="text-xs">{msg}</p>}
      <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={p.onClose}>
        Close
      </Button>
    </div>
  );
}
