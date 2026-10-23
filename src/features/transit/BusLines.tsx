import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_BUSES_PER_LINE, MAX_PICKED_LINES, useBusPins } from "@/lib/transit/busReveal";
import { routesForPage, useBusLines, useTransitToggles } from "./hooks";

function Pill({ on, onClick, children, label }: { on?: boolean; onClick?: () => void; children: string; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-[var(--sp-4)] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Bus lines inside Layers & filters: pick any lines (up to 20) and how many
 * buses to show per line. Nothing draws until a line, a trip, or a
 * replacement shuttle asks for it.
 */
export function BusLines() {
  const { busPage, busLines, setBusLines, busCap, setBusCap } = useTransitToggles();
  const pins = useBusPins();
  const lines = useBusLines(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const groups = lines.data?.groups;
  // An old ?busPage= link counts as that page's lines until the first edit.
  const picked = busLines.length ? busLines : routesForPage(groups, busPage);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const byGroup = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g.pages.flatMap((p) => p.routes)] as const)), [groups]);
  const all = useMemo(() => [...new Set([...byGroup.values()].flat())], [byGroup]);
  const needle = query.trim().toUpperCase();
  const openId = groupId ?? groups?.[0]?.id ?? null;
  const visible = needle ? all.filter((r) => r.toUpperCase().includes(needle)) : (byGroup.get(openId ?? "") ?? []);
  const full = picked.length >= MAX_PICKED_LINES;
  const toggle = (route: string) => {
    if (pickedSet.has(route)) setBusLines(picked.filter((r) => r !== route));
    else if (!full) setBusLines([...picked, route]);
  };
  const note = pins.shuttle?.length
    ? `Showing shuttle ${pins.shuttle.join(", ")}. Your lines come back when it ends.`
    : pins.trip?.length
      ? `Showing ${pins.trip.join(", ")} for this trip. Your lines come back when it ends.`
      : picked.length
        ? `${picked.length} of ${MAX_PICKED_LINES} lines on, up to ${busCap} ${busCap === 1 ? "bus" : "buses"} each, nearest to the map.`
        : "Buses stay off until you pick a line.";
  return (
    <section className="space-y-[var(--sp-3)]" aria-label="Bus lines" data-testid="bus-lines">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Bus lines</h3>
      <p className="text-[13px] text-muted-foreground">{note}</p>
      {picked.length ? (
        <div className="flex flex-wrap gap-[var(--sp-2)]" data-testid="bus-picked">
          {picked.map((r) => (
            <button key={r} type="button" onClick={() => toggle(r)} aria-label={`Remove ${r}`} className="flex h-8 items-center gap-1 rounded-full bg-primary px-[var(--sp-3)] text-[12px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {r}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button type="button" onClick={() => setBusLines([])} className="h-8 rounded-full border border-border px-[var(--sp-3)] text-[12px] font-medium text-muted-foreground hover:bg-muted">
            Clear all
          </button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-[var(--sp-3)] text-[13px] font-medium">
        <span id="bus-cap-label">Buses per line</span>
        <div className="flex items-center gap-[var(--sp-2)]" role="group" aria-labelledby="bus-cap-label">
          <button type="button" aria-label="Fewer buses per line" disabled={busCap <= 1} onClick={() => setBusCap(busCap - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border disabled:opacity-40">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span data-testid="bus-cap" className="w-6 text-center tabular-nums">{busCap}</span>
          <button type="button" aria-label="More buses per line" disabled={busCap >= MAX_BUSES_PER_LINE} onClick={() => setBusCap(busCap + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-border disabled:opacity-40">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {groups ? (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a line, like B41"
            aria-label="Find a bus line"
            className="h-9 w-full rounded-full border border-border bg-card px-[var(--sp-4)] text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {needle ? null : (
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              {groups.map((g) => (
                <Pill key={g.id} on={g.id === openId} onClick={() => setGroupId(g.id)}>{g.label}</Pill>
              ))}
            </div>
          )}
          <div className="flex max-h-56 flex-wrap gap-[var(--sp-2)] overflow-y-auto" data-testid="bus-line-list">
            {visible.length ? (
              visible.map((r) => (
                <Pill key={r} on={pickedSet.has(r)} label={`Bus ${r}`} onClick={() => toggle(r)}>{r}</Pill>
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">No line matches.</p>
            )}
          </div>
          {full ? <p className="text-[12px] text-muted-foreground">That is the {MAX_PICKED_LINES}-line limit. Remove one to add another.</p> : null}
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">{lines.isError ? "Bus lines did not load." : "Loading bus lines…"}</p>
      )}
    </section>
  );
}
