import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { levelStyle, pickRow, StreetResponse, streetFromLabel } from "./levels";

async function fetchStreet(name: string, signal: AbortSignal) {
  const res = await fetch(`/api/street?name=${encodeURIComponent(name)}`, { signal });
  if (!res.ok) throw new Error(`Street stats failed (${res.status})`);
  return StreetResponse.parse(await res.json());
}

function Dot({ level }: { level: unknown }) {
  return <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", levelStyle(level).dot)} />;
}

/**
 * Noise and crash levels for the street underfoot while walking. Collapsed it is
 * two coloured dots; tap to see the 12-month counts. Reads /api/street.
 */
export function StreetBubble({ street }: { street: string | null }) {
  const name = streetFromLabel(street);
  const [open, setOpen] = useState(false);
  // The street label can flip several times a second while walking; wait for it to settle.
  const [settled, setSettled] = useState<string | null>(name);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(name), 400);
    return () => window.clearTimeout(id);
  }, [name]);

  const query = useQuery({
    queryKey: ["street-stats", settled],
    queryFn: ({ signal }) => fetchStreet(settled as string, signal),
    enabled: settled !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });

  if (!settled) return null;
  const row = query.data ? pickRow(query.data.rows) : null;
  if (query.isError || (query.isSuccess && !row)) return null;

  const noise = levelStyle(row?.noise_level);
  const crash = levelStyle(row?.crash_level);

  return (
    <div className="pointer-events-none absolute left-3 top-[4.75rem] z-30">
      <button
        type="button"
        data-testid="street-bubble"
        aria-expanded={open}
        aria-label={`Street noise and crash levels: ${row ? `noise ${noise.label}, crashes ${crash.label}` : "loading"}`}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-border/70 bg-card/90 px-2.5 py-1.5 text-left text-[11px] shadow-xl backdrop-blur-md"
      >
        <span className="flex items-center gap-2">
          <Dot level={row?.noise_level} />
          <span>Noise</span>
          <Dot level={row?.crash_level} />
          <span>Crashes</span>
          {open ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
        </span>
        {open && row ? (
          <span className="flex flex-col gap-0.5 text-muted-foreground" data-testid="street-bubble-detail">
            <span>
              <span className={cn("font-semibold", noise.text)}>{noise.label}</span> noise ·{" "}
              {formatCount(row.noise_12mo)} complaints in 12 mo
            </span>
            <span>
              <span className={cn("font-semibold", crash.text)}>{crash.label}</span> crashes ·{" "}
              {formatCount(row.crashes_12mo)} in 12 mo ({formatCount(row.injury_crashes_12mo)} injury,{" "}
              {formatCount(row.fatal_crashes_12mo)} fatal)
            </span>
            {row.borough ? <span className="capitalize">{row.borough.toLowerCase()} · levels are citywide quartiles</span> : null}
          </span>
        ) : null}
      </button>
    </div>
  );
}
