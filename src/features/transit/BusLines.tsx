import { useState } from "react";
import { cn } from "@/lib/utils";
import { useBusPins } from "@/lib/transit/busReveal";
import { useBusLines, useTransitToggles } from "./hooks";

function Pill({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
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
 * Borough pages inside Layers & filters. One group opens at a time, and one
 * page of 20 routes replaces the previous page. Nothing draws until a page,
 * a trip, or a replacement shuttle asks for it.
 */
export function BusLines() {
  const { busPage, setBusPage } = useTransitToggles();
  const pins = useBusPins();
  const lines = useBusLines(true);
  const [groupId, setGroupId] = useState<string | null>(null);
  const groups = lines.data?.groups;
  const selected = groups?.find((g) => g.pages.some((p) => p.id === busPage));
  const openId = groupId ?? selected?.id ?? null;
  const group = groups?.find((g) => g.id === openId);
  const pinned = Boolean(pins.shuttle?.length || pins.trip?.length);
  const pickPage = (id: string) => {
    if (pinned) return;
    setBusPage(busPage === id ? null : id);
  };
  const note = pins.shuttle?.length
    ? `Showing shuttle ${pins.shuttle.join(", ")}. Other buses stay hidden.`
    : pins.trip?.length
      ? `Showing ${pins.trip.join(", ")} for this trip.`
      : busPage
        ? "One page is on. Choosing another page replaces it."
        : "Buses stay off until you pick one page.";
  return (
    <section className="space-y-[var(--sp-3)]" aria-label="Bus lines">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        Bus lines
        <span className="ml-1 font-normal normal-case tracking-normal">· one page at a time</span>
      </h3>
      <p className="text-[13px] text-muted-foreground">{note}</p>
      {groups ? (
        <>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {groups.map((g) => (
              <Pill key={g.id} on={g.id === openId} onClick={() => setGroupId(g.id)}>{g.label}</Pill>
            ))}
          </div>
          {group ? (
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              {group.pages.map((p) => (
                <Pill key={p.id} on={p.id === busPage} onClick={() => pickPage(p.id)}>{p.label}</Pill>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Pick a borough to see its pages.</p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">{lines.isError ? "Bus lines did not load." : "Loading bus lines…"}</p>
      )}
    </section>
  );
}
