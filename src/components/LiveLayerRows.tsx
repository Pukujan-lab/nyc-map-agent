import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BusFront, ChevronRight, TrainFront } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useFlags } from "@/lib/flags";
import { useMenuT } from "@/lib/i18n/menuText";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type PanelChip } from "@/lib/store/PanelContext";
import { EXPRESS_GROUPS, groupBusRoutes } from "@/lib/transit/busGroups";
import { MAX_PICKED_LINES } from "@/lib/transit/busReveal";

const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const SWITCH = "data-[state=checked]:bg-[#2563eb] data-[state=unchecked]:bg-[#334155]";
const LAYER_ICON = "h-[22px] w-[22px] shrink-0";
const LAYER_ROW = "min-h-[52px] text-[15px]";

export function SwitchRow({ icon, label, on, onChange, disabled, testId, className }: { icon: ReactNode; label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; testId?: string; className?: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-2 text-[14px] font-medium ${disabled ? "opacity-50" : ""} ${className ?? ""}`} data-testid={testId}>
      {icon}
      <span className="flex-1">{label}</span>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} aria-label={label} className={SWITCH} />
    </label>
  );
}

export const RestroomIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <circle cx="7" cy="4" r="2" /><path d="M5 7h4l1 7H8.5v7h-3v-7H4l1-7Z" /><circle cx="17" cy="4" r="2" /><path d="M15.2 7h3.6l2.2 8h-2.5v6h-3v-6H13l2.2-8Z" />
  </svg>
);

function RouteChip({ route, on, onClick }: { route: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`h-8 min-w-[52px] rounded-full border px-3 text-[13px] font-semibold ${on ? "border-[#2563eb] bg-[#2563eb] text-white" : "border-[#334155] bg-transparent text-[#f1f5f9] hover:bg-white/5"} ${RING}`}>
      {route}
    </button>
  );
}

/** Every route by prefix: tap M, Bx … SIM, then tap routes on and off (owner, 2026-10-27: choose, don't type). */
function RouteGroups({ catalog, routes, toggle }: { catalog: () => Promise<string[]>; routes: string[]; toggle: (r: string) => void }) {
  const [all, setAll] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    catalog().then((r) => { if (live) setAll(r); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [catalog]);
  const groups = useMemo(() => groupBusRoutes(all ?? []), [all]);
  if (failed) return null;
  if (!all) return <p className="text-[12px] text-[#a5b4cb]">Loading all routes…</p>;
  const express = new Set<string>(EXPRESS_GROUPS);
  const list = group ? groups.get(group) ?? [] : [];
  return (
    <div className="flex flex-col gap-1.5" data-testid="bus-route-groups">
      <p className="text-[12px] text-[#a5b4cb]">All routes</p>
      <div role="group" aria-label="Route groups" className="flex flex-wrap items-center gap-1.5">
        {[...groups.keys()].map((g) => (
          <button key={g} type="button" aria-expanded={g === group} onClick={() => setGroup(g === group ? null : g)}
            className={`h-8 min-w-[44px] rounded-[8px] border px-2.5 text-[13px] font-semibold ${g === group ? "border-[#60a5fa] bg-[#60a5fa]/15 text-white" : "border-[#334155] text-[#cbd5e1] hover:bg-white/5"} ${express.has(g) ? "italic" : ""} ${RING}`}>
            {g}
          </button>
        ))}
      </div>
      {group ? (
        <div role="group" aria-label={`${group} routes`} className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto py-0.5">
          {list.map((r) => <RouteChip key={r} route={r} on={routes.includes(r)} onClick={() => toggle(r)} />)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Under Live buses: which routes show, and a dropdown to change them, with the routes near
 * the map to tap, every route by group, and a box for any other (owner, 2026-10-27: no way to choose buses).
 */
function BusRoutePicker({ chip }: { chip: PanelChip }) {
  const [open, setOpen] = useState(false);
  const [near, setNear] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const { note, suggest, catalog, setRoutes } = chip;
  const routes = chip.routes ?? [];
  // The switch found nothing: open the choices so the next step is right there.
  useEffect(() => { if (note) setOpen(true); }, [note]);
  useEffect(() => {
    if (!open || !suggest) return;
    let live = true;
    setNear(null);
    suggest().then((r) => { if (live) setNear(r); }, () => { if (live) setNear([]); });
    return () => { live = false; };
  }, [open, suggest]);
  if (!setRoutes) return null;
  const full = routes.length >= MAX_PICKED_LINES;
  const toggle = (r: string) => { if (routes.includes(r)) setRoutes(routes.filter((x) => x !== r)); else if (!full) setRoutes([...routes, r]); };
  const options = [...new Set([...routes, ...(near ?? [])])];
  return (
    <div data-testid="bus-routes" className="pb-1 pl-[46px] pr-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`flex min-h-9 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[13px] text-[#cbd5e1] hover:bg-white/5 ${RING}`}>
        <span className="min-w-0 flex-1 truncate">{routes.length ? `Showing ${routes.join(", ")}` : "No routes chosen"}</span>
        <span className="font-semibold text-[#60a5fa]">{routes.length ? "Change" : "Choose"}</span>
        <ChevronRight className={`h-4 w-4 text-[#a5b4cb] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-2 pb-1 pt-1.5">
          {note ? <p role="status" className="text-[12px] text-[#fbbf24]">{note}</p> : null}
          {near === null && !options.length ? <p className="text-[12px] text-[#a5b4cb]">Looking for routes near the map…</p>
            : options.length ? (
              <div role="group" aria-label="Bus routes" className="flex flex-wrap gap-1.5">
                {options.map((r) => <RouteChip key={r} route={r} on={routes.includes(r)} onClick={() => toggle(r)} />)}
              </div>
            ) : <p className="text-[12px] text-[#a5b4cb]">No routes near the map. Pick a group below.</p>}
          {catalog ? <RouteGroups catalog={catalog} routes={routes} toggle={toggle} /> : null}
          {full ? <p className="text-[12px] text-[#a5b4cb]">That is the {MAX_PICKED_LINES}-route limit. Remove one to add another.</p> : null}
          <form className="flex gap-1.5" onSubmit={(e) => {
            e.preventDefault();
            const r = typed.trim().toUpperCase();
            if (r && (routes.includes(r) || !full)) { setRoutes([...routes.filter((x) => x !== r), r]); setTyped(""); }
          }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Add a bus route" placeholder="Or type a route, like Q58"
              className={`h-9 min-w-0 flex-1 rounded-full border border-[#334155] bg-[rgba(15,23,42,0.9)] px-3 text-[13px] text-[#f1f5f9] placeholder:text-[#64748b] ${RING}`} />
            <button type="submit" className={`h-9 shrink-0 rounded-full bg-[#2563eb] px-3.5 text-[13px] font-semibold text-white ${RING}`}>Add</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Live trains, Live buses with its route chooser, and Restrooms: the Layers menu on wide screens, the Settings sheet on a phone. */
export function LiveLayerRows() {
  const { chips } = usePanel();
  const { restrooms, setRestrooms } = useMapState();
  const flags = useFlags();
  const trains = chips.find((c) => c.id === "liveTrains");
  const buses = chips.find((c) => c.id === "liveBuses");
  const t = useMenuT();
  return (
    <>
      {trains ? <SwitchRow className={LAYER_ROW} icon={<TrainFront className={LAYER_ICON} aria-hidden />} label={t("liveTrains")} on={trains.active} onChange={trains.onToggle} /> : null}
      {buses ? <SwitchRow className={LAYER_ROW} icon={<BusFront className={LAYER_ICON} aria-hidden />} label={t("liveBuses")} on={buses.active} onChange={buses.onToggle} /> : null}
      {buses ? <BusRoutePicker chip={buses} /> : null}
      {flags.restrooms ? <SwitchRow className={LAYER_ROW} icon={<RestroomIcon />} label={t("restrooms")} on={restrooms} onChange={() => setRestrooms(!restrooms)} /> : null}
    </>
  );
}
