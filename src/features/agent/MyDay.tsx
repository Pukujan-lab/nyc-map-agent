import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, TrainFront, TriangleAlert } from "lucide-react";
import { useMenuT } from "@/lib/i18n/menuText";
import { useState, type ReactNode } from "react";
import { useLookedUp, useMemoryPrefs, type LookedUp } from "@/lib/memory/memory";
import { useMapState } from "@/lib/store/MapStateContext";
import { setSelectedLine } from "@/lib/transit/selectedLine";
import { commutePrompt, readUsual, useHomeWork, type CommuteTo, type UsualTrip } from "./commute";
import { openCommuteNotice } from "./commuteFocus";
import { Bullet, fetchAlerts } from "./HomeTasks";
import { lookedUpWhen, rideChips, todayNotices, type DayNotice } from "./myDayModel";
import { routeColor } from "./tripLayer";

/**
 * "My day" (frame 13): Today’s notices on the usual lines, chips for the usual
 * rides, and the last trips looked up on this phone. One section open at a time.
 */
type SectionId = "today" | "rides" | "looked";

function Section({ id, icon, label, badge, open, onToggle, children }: { id: SectionId; icon: ReactNode; label: string; badge?: number; open: boolean; onToggle: (id: SectionId) => void; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <button type="button" aria-expanded={open} onClick={() => onToggle(id)}
        className="flex min-h-12 items-center gap-2.5 px-2.5 text-left text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
        {icon}
        <span className="flex-1">{label}</span>
        {badge ? <span className="rounded-full bg-[rgba(245,158,11,0.2)] px-2 py-0.5 text-[12px] font-medium text-[#fcd34d]">{badge}</span> : null}
        <span aria-hidden className="text-[#a5b4cb]">{open ? "▴" : "▾"}</span>
      </button>
      {open ? <div className="flex flex-col gap-1 px-1 pb-1.5">{children}</div> : null}
    </section>
  );
}

const ROW = "flex min-h-11 w-full items-center gap-2.5 rounded-[12px] bg-[rgba(31,23,8,0.55)] px-2 text-left text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const EMPTY = "px-2 py-1 text-[13px] text-[#a5b4cb]";
const RULE = "mx-2.5 h-px bg-[rgba(148,163,184,0.16)]";

const at = (e: LookedUp["from"]) => (e.at ? ` (${e.at[1].toFixed(4)}, ${e.at[0].toFixed(4)})` : "");

export default function MyDay({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<SectionId | null>("today");
  const t = useMenuT();
  const toggle = (id: SectionId) => setOpen(open === id ? null : id);
  const memory = useMemoryPrefs();
  const places = useHomeWork();
  const looked = useLookedUp();
  const { seedChat } = useMapState();
  const usual: Array<[CommuteTo, UsualTrip]> = (["work", "home"] as const).flatMap((to) => {
    const u = readUsual(to);
    return u ? [[to, u] as [CommuteTo, UsualTrip]] : [];
  });
  const lines = [...new Map(usual.map(([, u]) => [u.route, { route: u.route, color: u.color, board: u.board }])).values()];
  const { data: alerts } = useQuery({ queryKey: ["agent", "commute-alerts"], queryFn: fetchAlerts, enabled: lines.length > 0, staleTime: 30_000, refetchInterval: 60_000 });
  const notices: DayNotice[] | null = alerts ? todayNotices(alerts, lines) : null;
  const chips = rideChips(usual);

  const ask = (q: string | null) => {
    if (!q) return;
    seedChat(q);
    onClose();
  };
  const openNotice = (row: DayNotice) => {
    if (row.open === "commute") openCommuteNotice(row.route);
    else setSelectedLine(row.route);
    onClose();
  };

  return (
    <div className="flex flex-col" data-testid="my-day">
      <Section id="today" icon={<TriangleAlert className="h-5 w-5 text-[#fcd34d]" aria-hidden />} label={t("today")} badge={notices?.length || undefined} open={open === "today"} onToggle={toggle}>
        {notices?.length ? notices.map((row) => (
          <button key={row.id} type="button" className={ROW} onClick={() => openNotice(row)} data-testid="my-day-line" data-open={row.open}>
            {row.elevator ? <TriangleAlert className="h-6 w-6 shrink-0 text-[#fcd34d]" aria-hidden /> : <Bullet ride={{ route: row.route, color: row.color ?? routeColor(row.route) }} size="xs" />}
            <span className="min-w-0 flex-1 truncate">
              {row.label}
              {row.detail ? <span>{" · "}<span className="text-[#fcd34d]">{row.detail}</span></span> : null}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a5b4cb]" aria-hidden />
          </button>
        )) : <p className={EMPTY}>{!memory.rides ? t("ridesPaused") : !lines.length ? t("noUsualLine") : notices ? t("noNotices") : t("checking")}</p>}
      </Section>
      <div className={RULE} />
      <Section id="rides" icon={<TrainFront className="h-5 w-5 text-[#93c5fd]" aria-hidden />} label={t("yourRides")} open={open === "rides"} onToggle={toggle}>
        {chips.length && places.home && places.work ? (
          <div className="flex flex-wrap gap-1.5 px-2 pb-1">
            {chips.map((c) => (
              <button key={c.id} type="button" data-testid="ride-chip" aria-label={c.via ? `Take the ${c.route}` : c.label} onClick={() => ask(commutePrompt(c.to, places, c.via ? { via: c.via } : {}))}
                className="flex h-9 items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.25)] bg-transparent pl-1.5 pr-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
                <Bullet ride={{ route: c.route, color: c.color ?? routeColor(c.route) }} size="xs" />
                {c.label === c.route ? null : c.label}
              </button>
            ))}
          </div>
        ) : <p className={EMPTY}>{places.home && places.work ? t("planHomeWork") : t("saveHomeWork")}</p>}
      </Section>
      <div className={RULE} />
      <Section id="looked" icon={<Search className="h-5 w-5 text-[#93c5fd]" aria-hidden />} label={t("lookedUp")} open={open === "looked"} onToggle={toggle}>
        {looked.length ? looked.map((t) => (
          <button key={`${t.t}:${t.from.label}>${t.to.label}`} type="button" className={`${ROW} bg-[rgba(15,23,42,0.5)]`} data-testid="looked-up"
            onClick={() => ask(`Plan my trip from ${t.from.label}${at(t.from)} to ${t.to.label}${at(t.to)}, leaving now.`)}>
            <span className="flex shrink-0 gap-0.5">{t.routes.slice(0, 3).map((r) => <Bullet key={r} ride={{ route: r, color: routeColor(r) }} size="xs" />)}</span>
            <span className="min-w-0 flex-1 truncate">{lookedUpWhen(t.t, t.from.label, t.to.label)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a5b4cb]" aria-hidden />
          </button>
        )) : <p className={EMPTY}>{memory.trips ? t("tripsShowHere") : t("tripsPaused")}</p>}
      </Section>
    </div>
  );
}
