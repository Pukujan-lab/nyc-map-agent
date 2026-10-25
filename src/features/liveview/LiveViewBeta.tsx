import { ArrowUp, Camera, X } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { accuracyLine, accuracyTooLow, headingFromEvent, MAX_AR_ACCURACY_M, relativeBearing, smoothHeading } from "./heading";
import { fallbackReason, initialPermissions, modeOf, permissionReducer } from "./permission";

interface Props {
  /** GPS error in metres, null until the first fix. */
  accuracyM: number | null;
  /** Bearing from the walker to the next turn, degrees clockwise from north. */
  targetBearing: number;
  instruction: string;
  distanceLabel: string;
}

type IosOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Live View (Beta) scaffold: camera plus compass behind the `liveviewAr` flag.
 * Permissions are requested only on the tap. The camera stream never leaves
 * the page (no recording, no upload). The transparent street-pitch MapLibre
 * overlay is NOT built yet: in this slice the camera shows with the 2D arrow
 * on top, rotated by the smoothed compass heading. Without camera or compass,
 * or above 25 m of GPS error, only the 2D arrow is shown.
 */
export default function LiveViewBeta({ accuracyM, targetBearing, instruction, distanceLabel }: Props) {
  const [perm, dispatch] = useReducer(permissionReducer, initialPermissions);
  const [open, setOpen] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const headingRef = useRef<number | null>(null);
  const listenerRef = useRef<{ type: string; fn: (e: Event) => void } | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (listenerRef.current) window.removeEventListener(listenerRef.current.type, listenerRef.current.fn);
    listenerRef.current = null;
    headingRef.current = null;
    setHeading(null);
    setOpen(false);
    dispatch({ type: "stop" });
  }, []);

  // Stop the camera when the tab hides and on unmount.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [stop]);

  const start = () => {
    const cameraSupported = "mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices;
    const orientationSupported = typeof DeviceOrientationEvent !== "undefined";
    setOpen(true);
    dispatch({ type: "request", cameraSupported, orientationSupported });

    // iOS only allows this call synchronously inside the tap.
    const ios = orientationSupported ? (DeviceOrientationEvent as IosOrientation) : null;
    const orientationOk: Promise<"granted" | "denied" | "unsupported"> = !ios
      ? Promise.resolve("unsupported")
      : "requestPermission" in ios
        ? (ios as { requestPermission: () => Promise<"granted" | "denied"> }).requestPermission().then(
            (r) => r,
            () => "denied" as const,
          )
        : Promise.resolve("granted");
    void orientationOk.then((result) => {
      if (result === "granted") {
        const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        const fn = (e: Event) => {
          const h = headingFromEvent(e as DeviceOrientationEvent & { webkitCompassHeading?: number });
          if (h === null) return;
          headingRef.current = smoothHeading(headingRef.current, h);
          setHeading(headingRef.current);
        };
        window.addEventListener(type, fn);
        listenerRef.current = { type, fn };
      }
      dispatch({ type: "orientation", result });
    });

    if (!cameraSupported) {
      dispatch({ type: "camera", result: "unsupported" });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        dispatch({ type: "camera", result: "granted" });
      })
      .catch(() => dispatch({ type: "camera", result: "denied" }));
  };

  const mode = modeOf(perm);
  const lowAccuracy = accuracyTooLow(accuracyM);
  const showCamera = mode === "ar" && !lowAccuracy;
  const reason = fallbackReason(perm);
  const rotation = heading === null ? 0 : relativeBearing(targetBearing, heading);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={start}>
        <Camera className="h-4 w-4" /> Live View (Beta)
      </Button>
    );
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-end gap-3 bg-background p-4 pb-10" role="dialog" aria-label="Live View (Beta)">
      <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover ${showCamera ? "" : "hidden"}`} />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2">
        {mode === "requesting" ? <p className="rounded bg-background/90 px-3 py-1 text-sm">Waiting for camera and compass permission…</p> : null}
        {mode !== "requesting" ? (
          <>
            <ArrowUp className="h-32 w-32 text-primary drop-shadow-lg" style={{ transform: `rotate(${showCamera ? rotation : 0}deg)` }} aria-hidden />
            <p className="rounded bg-background/90 px-3 py-1 text-lg font-semibold" role="status">
              {instruction}, {distanceLabel}
            </p>
          </>
        ) : null}
      </div>
      <div className="relative flex flex-col items-center gap-1 text-[11px]">
        <span className="rounded bg-background/90 px-2 py-0.5 text-muted-foreground">{accuracyLine(accuracyM)}</span>
        {mode !== "requesting" && lowAccuracy ? (
          <span className="rounded bg-background/90 px-2 py-0.5 text-muted-foreground">
            {accuracyM === null ? "Waiting for location." : `Above ${MAX_AR_ACCURACY_M} m, so you get a plain arrow.`}
          </span>
        ) : null}
        {reason ? <span className="rounded bg-background/90 px-2 py-0.5 text-destructive">{reason} Showing the plain arrow.</span> : null}
        <span className="rounded bg-background/90 px-2 py-0.5 text-muted-foreground">Beta: the camera stays on this device.</span>
      </div>
      <Button type="button" size="sm" variant="outline" className="relative" onClick={stop}>
        <X className="h-4 w-4" /> Stop camera
      </Button>
    </div>
  );
}
