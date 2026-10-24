import { useQuery } from "@tanstack/react-query";
import { Briefcase, ChevronDown, House, Route, TrainFront } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { alertsBody, commuteFor, commutePrompt, delayDetails, delayOn, readUsual, stationPoints, subwayStations, type HomeWork, type SavedSpot, type SubwayStations, type UsualRide } from "./commute";
import type { MapPoint } from "./schema";
import { ExitStairsIcon, RestroomIcon } from "./homeIcons";

export interface TaskHandlers {
  restroom: () => void;
  train: () => void;
  plan: () => void;
  exit: () => void;
}

const TASK = "h-[72px] flex-col gap-1.5 rounded-[18px] border border-slate-700 bg-slate-900/90 p-0 text-[13px] font-semibold text-slate-100 shadow-lg backdrop-blur-md hover:bg-slate-800/95 hover:text-white";

/** The four task buttons above the chat bar on the idle home (#370). */
export function TaskButtons({ on }: { on: TaskHandlers }) {
  const tasks: Array<[string, ReactNode, () => void]> = [
    ["Restroom", <RestroomIcon key="i" className="!h-6 !w-6" />, on.restroom],
    ["My train", <TrainFront key="i" className="!h-[22px] !w-[22px]" aria-hidden="true" />, on.train],
    ["Plan trip", <Route key="i" className="!h-[22px] !w-[22px]" aria-hidden="true" />, on.plan],
    ["Find exit", <ExitStairsIcon key="i" className="!h-[22px] !w-[22px]" />, on.exit],
  ];
  return (
    <div className="pointer-events-auto grid grid-cols-4 gap-2" data-testid="home-tasks">
      {tasks.map(([label, icon, run]) => (
        <Button key={label} type="button" variant="ghost" className={TASK} onClick={run}>
          {icon}
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}

/** A route bullet in the line's colour (MTA blue when the planner gave none). */
export function Bullet({ ride, size, lines }: { ride: Pick<UsualRide, "route" | "color">; size: "lg" | "sm"; lines?: SubwayStations["routes"] }) {
  const line = lines?.[ride.route];
  return (
    <span
      className={size === "lg" ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white" : "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white"}
      style={{ background: line?.color ?? ride.color ?? "#2563eb", ...(line?.text ? { color: line.text } : {}) }}
      aria-hidden="true"
    >
      {ride.route}
    </span>
  );
}

const GLASS = "pointer-events-auto rounded-[20px] border bg-[#0b1220]/50 backdrop-blur-[14px]";

export async function fetchAlerts() {
  const res = await fetch("/api/transit/alerts");
  if (!res.ok) throw new Error(`alerts ${res.status}`);
  return alertsBody.parse(await res.json()).alerts;
}

async function fetchStations(): Promise<SubwayStations> {
  const res = await fetch("/transit/subway.json");
  if (!res.ok) throw new Error(`subway.json ${res.status}`);
  return subwayStations.parse(await res.json());
}

/** The hour, re-read every few minutes so the card flips from Work to Home at noon. */
function useHour(): number {
  const [h, setH] = useState(() => new Date().getHours());
  useEffect(() => {
    const t = window.setInterval(() => setH(new Date().getHours()), 5 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  return h;
}

/**
 * The daily explorer (#370): with Home and Work saved, a "Right now" card for
 * the usual trip at this time of day and a Go button, then the Home and Work
 * pills. When the usual line has a delay alert the card becomes the commute
 * alert with two choices. Saved spots and the usual trip stay on this device.
 */
export function DailyCard({ places, onAsk, onFly, onShowStations }: { places: HomeWork; onAsk: (q: string) => void; onFly: (s: SavedSpot) => void; onShowStations: (points: MapPoint[]) => void }) {
  const to = commuteFor(useHour());
  const usual = readUsual(to);
  const both = !!places.home && !!places.work;
  const { data: alerts } = useQuery({ queryKey: ["agent", "commute-alerts"], queryFn: fetchAlerts, enabled: both && !!usual, staleTime: 30_000, refetchInterval: 60_000 });
  const delay = usual && alerts ? delayOn(alerts, usual.route) : null;
  const details = usual && alerts && delay ? delayDetails(alerts, usual.route) : null;
  // Station positions only once there is a delay to place.
  const { data: stations } = useQuery({ queryKey: ["agent", "subway-stations"], queryFn: fetchStations, enabled: !!delay, staleTime: Infinity });
  const alt = usual && alerts ? usual.alternatives.find((a) => !delayOn(alerts, a.route)) : undefined;
  const [open, setOpen] = useState<"notice" | "alt" | null>(null);
  const ask = (opts?: Parameters<typeof commutePrompt>[2]) => {
    const q = commutePrompt(to, places, opts);
    if (q) onAsk(q);
  };
  const dest = to === "work" ? "Work" : "Home";

  const pills = (
    <div className="pointer-events-auto flex gap-2 overflow-x-auto" data-testid="home-pills">
      {places.home ? (
        <Button type="button" variant="ghost" className="h-11 shrink-0 gap-1.5 rounded-full border border-slate-400/25 bg-slate-900/60 px-3.5 text-[13px] font-semibold text-slate-100 backdrop-blur-md hover:bg-slate-800/80 hover:text-white" onClick={() => onFly(places.home!)}>
          <House className="h-4 w-4" aria-hidden="true" /> Home
        </Button>
      ) : null}
      {places.work ? (
        <Button type="button" variant="ghost" className="h-11 shrink-0 gap-1.5 rounded-full border border-slate-400/25 bg-slate-900/60 px-3.5 text-[13px] font-semibold text-slate-100 backdrop-blur-md hover:bg-slate-800/80 hover:text-white" onClick={() => onFly(places.work!)}>
          <Briefcase className="h-4 w-4" aria-hidden="true" /> Work
        </Button>
      ) : null}
    </div>
  );
  if (!places.home && !places.work) return null;
  if (!both) return pills;

  if (usual && delay) {
    const toggleNotice = () => {
      const next = open === "notice" ? null : "notice";
      setOpen(next);
      // Opening the notice puts the problem station (and any skipped ones) on the map.
      if (next && details && stations) {
        const points = stationPoints(stations, details);
        if (points.length) onShowStations(points);
      }
    };
    return (
      <>
        <section aria-label="Commute alert" data-testid="commute-alert" className={`${GLASS} flex flex-col gap-3 border-amber-500/45 p-3.5`}>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open === "notice"}
            className="h-auto min-h-11 justify-start gap-3 whitespace-normal rounded-2xl p-0 text-left font-normal text-slate-50 hover:bg-transparent hover:text-white"
            onClick={toggleNotice}
          >
            <Bullet ride={usual} size="lg" lines={stations?.routes} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-bold">Your {usual.route} is delayed{delay.minutes ? ` ~${delay.minutes} min` : ""}</span>
              <span className="text-[13px] text-amber-300">{delay.cause}</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open === "notice" && "rotate-180")} aria-hidden="true" />
          </Button>
          {open === "notice" && details ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-slate-900/50 p-3 text-[13px] text-slate-200" data-testid="delay-details">
              {details.since || details.until ? (
                <p className="m-0">
                  {details.since ? `Since ${details.since}` : null}
                  {details.since && details.until ? " · " : null}
                  {details.until ? `Until ${details.until}` : null}
                </p>
              ) : null}
              {details.effects.length ? (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {details.effects.map((e) => (
                    <li key={`${e.route}:${e.how}`} className="flex items-center gap-2">
                      <Bullet ride={{ route: e.route, color: e.route === usual.route ? usual.color : undefined }} size="sm" lines={stations?.routes} />
                      <span>{e.how}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {details.stations.length ? <p className="m-0 text-slate-300">{details.stations.join(" · ")}</p> : null}
            </div>
          ) : null}
          {alt ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-blue-400/55 bg-blue-600/20">
              <Button
                type="button"
                variant="ghost"
                aria-expanded={open === "alt"}
                className="h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-2xl px-3 py-2 text-left font-normal text-slate-100 hover:bg-blue-600/30 hover:text-white"
                onClick={() => setOpen(open === "alt" ? null : "alt")}
              >
                <Bullet ride={alt} size="sm" lines={stations?.routes} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">Take the {alt.route} instead</span>
                  <span className="text-[13px] text-slate-300">About {alt.minutes} min door to door</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open === "alt" && "rotate-180")} aria-hidden="true" />
              </Button>
              {open === "alt" ? (
                <div className="flex flex-col gap-2 px-3 pb-3 text-[13px] text-slate-200" data-testid="alt-details">
                  {alt.board ? <p className="m-0">Board the {alt.route} at {alt.board}</p> : null}
                  <p className="m-0">{alt.transfers.length ? alt.transfers.join(" · ") : "No transfer"}</p>
                  <Button type="button" className="h-11 rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500" onClick={() => ask({ via: alt.route, showTransfer: true })}>
                    Show me on the map
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
        {pills}
      </>
    );
  }

  return (
    <>
      <section aria-label="Right now" data-testid="right-now" className={`${GLASS} flex items-center gap-3 border-slate-400/20 px-3.5 py-3`}>
        {usual ? (
          <Bullet ride={usual} size="lg" lines={stations?.routes} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white" aria-hidden="true">
            {to === "work" ? <Briefcase className="h-[18px] w-[18px]" /> : <House className="h-[18px] w-[18px]" />}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-slate-50">To {dest}{usual ? ` · ${usual.route} train` : ""}</span>
          {usual ? (
            <span className="text-[13px] text-green-300">{alerts ? "No delays · " : ""}{usual.minutes} min door to door</span>
          ) : (
            <span className="truncate text-[13px] text-slate-300">{(to === "work" ? places.work : places.home)!.label}</span>
          )}
        </span>
        <Button type="button" className="h-11 shrink-0 rounded-full bg-blue-600 px-[18px] text-sm font-semibold text-white hover:bg-blue-500" aria-label={`Go to ${dest}`} onClick={() => ask()}>
          Go
        </Button>
      </section>
      {pills}
    </>
  );
}
