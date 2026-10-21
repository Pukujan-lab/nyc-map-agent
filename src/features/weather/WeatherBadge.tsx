import { Cloud, CloudFog, CloudRain, CloudSnow, Sun } from "lucide-react";
import { useAmbient } from "@/lib/ambient";

const ICONS = { clear: Sun, cloudy: Cloud, fog: CloudFog, rain: CloudRain, snow: CloudSnow } as const;

/** Tiny condition icon + temperature; no tooltip, the label is the text. */
export function WeatherBadge() {
  const { weatherMode, weather, tempC } = useAmbient();
  if (weatherMode !== "live" || tempC === null) return null;
  const Icon = ICONS[weather];
  const f = Math.round((tempC * 9) / 5 + 32);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" aria-label={`${weather}, ${f} degrees`}>
      <Icon className="h-3.5 w-3.5" />
      {f}°
    </span>
  );
}
