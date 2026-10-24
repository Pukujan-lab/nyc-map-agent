import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History, Route, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLookedUp, useMemoryPrefs, type LookedUp } from "@/lib/memory/memory";
import { useMapState } from "@/lib/store/MapStateContext";
import { setSelectedLine } from "@/lib/transit/selectedLine";
import { commutePrompt, delayOn, readUsual, useHomeWork, type CommuteTo, type UsualTrip } from "./commute";
import { Bullet, fetchAlerts } from "./HomeTasks";
import { routeColor } from "./tripLayer";

/**
 * "My day" (#370): the daily explorer's own trips, in the menu row's first
 * dropdown. Today: notices on the usual lines (tap opens the line panel).
 * Your rides: the usual trips between Home and Work. Looked up: the last
 * trips planned on this device. Nothing else: no food, shops or time advice.
 */
type SectionId = "today" | "rides" | "looked";

function Section({ id, icon, label, open, onToggle, children }: { id: SectionId; icon: ReactNode; label: string; open: boolean; onToggle: (id: SectionId) => void; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <button type="button" aria-expanded={open} onClick={() => onToggle(id)}
        className="flex min-h-11 items-center gap-2.5 rounded-[12px] px-2 text-left text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronDown className={`h-4 w-4 text-[#a5b4cb] transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? <div className="flex flex-col gap-1 px-1 pb-2">{children}</div> : null}
    </section>
  );
}

const ROW = "flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left text-[13px] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const EMPTY = "px-2 py-1 text-[13px] text-[#a5b4cb]";

const at = (e: LookedUp["from"]) => (e.at ? ` (${e.at[1].toFixed(4)}, ${e.at[0].toFixed(4)})` : "");

export default function MyDay({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<SectionId | null>("today");
  const toggle = (id: SectionId) => setOpen(open === id ? null : id);
  const memory = useMemoryPrefs();
  const places = useHomeWork();
  const looked = useLookedUp();
  const { seedChat } = useMapState();
  const usual: Array<[CommuteTo, UsualTrip]> = (["work", "home"] as const).flatMap((to) => {
    const u = readUsual(to);
    return u ? [[to, u] as [CommuteTo, UsualTrip]] : [];
  });
  const lines = [...new Map(usual.map(([, u]) => [u.route, u])).values()];
  const { data: alerts } = useQuery({ queryKey: ["agent", "commute-alerts"], queryFn: fetchAlerts, enabled: lines.length > 0, staleTime: 30_000, refetchInterval: 60_000 });

  const ask = (q: string | null) => {
    if (!q) return;
    seedChat(q);
    onClose();
  };
  const openLine = (route: string) => {
    setSelectedLine(route);
    onClose();
  };

  return (
    <div className="flex flex-col" data-testid="my-day">
      <Section id="today" icon={<Sun className="h-[18px] w-[18px]" aria-hidden />} label="Today" open={open === "today"} onToggle={toggle}>
        {lines.length ? lines.map((u) => {
          const delay = alerts ? delayOn(alerts, u.route) : null;
          const n = alerts?.filter((a) => a.routes.includes(u.route)).length ?? 0;
          return (
            <button key={u.route} type="button" className={ROW} onClick={() => openLine(u.route)} data-testid="my-day-line">
              <Bullet ride={{ route: u.route, color: u.color ?? routeColor(u.route) }} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{delay ? `Delayed${delay.minutes ? ` ~${delay.minutes} min` : ""}` : n ? (n === 1 ? "1 notice" : `${n} notices`) : alerts ? "No notices" : "Checking…"}</span>
                {delay ? <span className="truncate text-[12px] text-amber-300">{delay.cause}</span> : null}
              </span>
            </button>
          );
        }) : <p className={EMPTY}>{memory.rides ? "No usual line yet" : "Daily rides are paused"}</p>}
      </Section>
      <Section id="rides" icon={<Route className="h-[18px] w-[18px]" aria-hidden />} label="Your rides" open={open === "rides"} onToggle={toggle}>
        {usual.length && places.home && places.work ? (
          <div className="flex flex-wrap gap-2 px-1">
            {usual.map(([to, u]) => (
              <button key={to} type="button" onClick={() => ask(commutePrompt(to, places))}
                className="flex h-11 items-center gap-2 rounded-full border border-[#263449] bg-[rgba(15,23,42,0.6)] pl-1.5 pr-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
                <Bullet ride={{ route: u.route, color: u.color ?? routeColor(u.route) }} size="sm" />
                To {to === "work" ? "Work" : "Home"}
              </button>
            ))}
          </div>
        ) : <p className={EMPTY}>{places.home && places.work ? "Plan a trip between Home and Work" : "Save Home and Work to see them here"}</p>}
      </Section>
      <Section id="looked" icon={<History className="h-[18px] w-[18px]" aria-hidden />} label="Looked up" open={open === "looked"} onToggle={toggle}>
        {looked.length ? looked.map((t) => (
          <button key={`${t.from.label}>${t.to.label}`} type="button" className={ROW} data-testid="looked-up"
            onClick={() => ask(`Plan my trip from ${t.from.label}${at(t.from)} to ${t.to.label}${at(t.to)}, leaving now.`)}>
            <span className="flex shrink-0 gap-0.5">{t.routes.slice(0, 3).map((r) => <Bullet key={r} ride={{ route: r, color: routeColor(r) }} size="sm" />)}</span>
            <span className="min-w-0 flex-1 truncate">{t.from.label} → {t.to.label}</span>
          </button>
        )) : <p className={EMPTY}>{memory.trips ? "Trips you plan show here" : "Trips looked up are paused"}</p>}
      </Section>
    </div>
  );
}
