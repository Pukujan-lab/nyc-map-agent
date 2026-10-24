import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3, BusFront, Building2, CalendarDays, ChevronRight, CircleDot, Database, Ear, History, House, Info, Layers,
  Leaf, Lightbulb, LocateFixed, Lock, MessageSquare, Box, Palette, Settings, Shield, Signpost, SlidersHorizontal, Sun, TrainFront, Trash2, Volume2, Gauge, CloudSun, type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { FEATURES } from "@/features";
import { setAmbient, useAmbient, type LightingMode, type WeatherMode } from "@/lib/ambient";
import { useAdvancedMode, useFlags } from "@/lib/flags";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import {
  MEMORY_KINDS, MEMORY_LABELS, forgetEverything, listStored, rememberedCount, setRemembering, useMemoryPrefs, type MemoryKind, type StoredItem,
} from "@/lib/memory/memory";
import { useMapState } from "@/lib/store/MapStateContext";
import { setOpenMenu, useOpenMenu, type OpenMenu } from "@/lib/store/openMenu";
import { usePanel } from "@/lib/store/PanelContext";
import { CHOICES, THEMES, setTheme, useTheme } from "@/lib/theme";
import { useFollowed } from "@/lib/transit/follow";
import { useSelectedLine } from "@/lib/transit/selectedLine";
import { setVoicePrefs, useVoicePrefs } from "@/lib/voice/voicePrefs";

/**
 * The agent-first home's top-left menu row (#370, docs/DESIGN_RULES.md): six
 * menus in a fixed order that loops round. The active one sits leftmost as a
 * pill with its icon and label; the rest follow as bare icons, each smaller
 * and fainter, and the row fades out at its right edge and scrolls sideways.
 * Each opens one floating, see-through dropdown; only one is open at a time.
 */
export type MenuId = Exclude<OpenMenu, "view" | null>;
const ITEMS: Array<{ id: MenuId; label: string; Icon: LucideIcon }> = [
  { id: "myDay", label: "My day", Icon: CalendarDays },
  { id: "layers", label: "Layers", Icon: Layers },
  { id: "filters", label: "Filters", Icon: SlidersHorizontal },
  { id: "data", label: "Data", Icon: Lock },
  { id: "cityData", label: "City data", Icon: BarChart3 },
  { id: "settings", label: "Settings", Icon: Settings },
];
export const MENU_IDS: MenuId[] = ITEMS.map((i) => i.id);
const IDS = new Set<OpenMenu>(MENU_IDS);
/**
 * Size (px) and opacity by place in the row. The pill is first (44, full);
 * the rest are bare icons, each smaller and fainter (docs/design/frames/MyDay.dc.html).
 */
export const MENU_SIZE = [44, 40, 34, 28, 24, 20];
export const MENU_ALPHA = [1, 0.8, 0.5, 0.28, 0.14, 0.06];

/** Tap an icon: it becomes the active pill and its dropdown opens. Tap the pill again: it closes. */
export function pressMenu(active: MenuId, open: MenuId | null, id: MenuId): { active: MenuId; open: MenuId | null } {
  if (id === active) return { active, open: open === id ? null : id };
  return { active: id, open: id };
}

const FLOAT = "rounded-[20px] border border-[#263449] bg-[rgba(11,18,32,0.82)] p-2 text-[#f1f5f9] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-[14px]";
const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const ROW = `flex min-h-12 w-full items-center gap-3 rounded-[12px] px-2 text-left text-[14px] font-medium hover:bg-white/5 disabled:opacity-50 ${RING}`;
const SWITCH = "data-[state=checked]:bg-[#2563eb] data-[state=unchecked]:bg-[#334155]";
const ICON = "h-5 w-5 shrink-0";

/** The items in row order starting at the active one, wrapping round. */
export function rowOrder<T extends { id: string }>(items: T[], active: string): T[] {
  const i = Math.max(0, items.findIndex((x) => x.id === active));
  return [...items.slice(i), ...items.slice(0, i)];
}

function SwitchRow({ icon, label, on, onChange, disabled, testId }: { icon: ReactNode; label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-2 text-[14px] font-medium ${disabled ? "opacity-50" : ""}`} data-testid={testId}>
      {icon}
      <span className="flex-1">{label}</span>
      <Switch checked={on} onCheckedChange={onChange} disabled={disabled} aria-label={label} className={SWITCH} />
    </label>
  );
}

function Divider() {
  return <div className="mx-2 my-1 h-px bg-[#263449]" />;
}

function Choice<T extends string>({ icon, label, value, options, onChange }: { icon: ReactNode; label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <label className="flex min-h-12 items-center gap-3 px-2 text-[14px] font-medium">
      {icon}
      <span className="flex-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}
        className={`h-9 rounded-full border border-[#263449] bg-[rgba(15,23,42,0.9)] px-3 text-[13px] text-[#f1f5f9] ${RING}`}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const MY_DAY = FEATURES.find((f) => f.myDay);
const MyDayBody = MY_DAY?.myDay ? lazy(MY_DAY.myDay.load) : null;

function LayersBody({ onClose }: { onClose: () => void }) {
  const { chips, setDrawerOpen } = usePanel();
  const { restrooms, setRestrooms } = useMapState();
  const flags = useFlags();
  const trains = chips.find((c) => c.id === "liveTrains");
  const buses = chips.find((c) => c.id === "liveBuses");
  return (
    <div data-testid="layers-panel">
      {trains ? <SwitchRow icon={<TrainFront className={ICON} aria-hidden />} label="Live trains" on={trains.active} onChange={trains.onToggle} /> : null}
      {buses ? <SwitchRow icon={<BusFront className={ICON} aria-hidden />} label="Live buses" on={buses.active} onChange={buses.onToggle} /> : null}
      {flags.restrooms ? <SwitchRow icon={<RestroomIcon />} label="Restrooms" on={restrooms} onChange={() => setRestrooms(!restrooms)} /> : null}
      <Divider />
      <button type="button" className={ROW} onClick={() => { onClose(); setDrawerOpen(true); }}>
        <Layers className={ICON} aria-hidden /><span className="flex-1">More layers</span><ChevronRight className="h-4 w-4 text-[#a5b4cb]" aria-hidden />
      </button>
    </div>
  );
}

const RestroomIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
    <circle cx="7" cy="4" r="2" /><path d="M5 7h4l1 7H8.5v7h-3v-7H4l1-7Z" /><circle cx="17" cy="4" r="2" /><path d="M15.2 7h3.6l2.2 8h-2.5v6h-3v-6H13l2.2-8Z" />
  </svg>
);

function FiltersBody({ onClose }: { onClose: () => void }) {
  const opts = useMapOptions();
  const { setDrawerOpen } = usePanel();
  return (
    <div data-testid="filters-panel">
      <SwitchRow icon={<CircleDot className={ICON} aria-hidden />} label="Stations only" on={opts.stationsOnly} onChange={(v) => setOptions({ stationsOnly: v })} />
      <SwitchRow icon={<BusFront className={ICON} aria-hidden />} label="Bus stops" on={opts.busStops} onChange={(v) => setOptions({ busStops: v })} />
      <SwitchRow icon={<Signpost className={ICON} aria-hidden />} label="Street names" on={opts.streetNames} onChange={(v) => setOptions({ streetNames: v })} />
      <SwitchRow icon={<Building2 className={ICON} aria-hidden />} label="3D buildings" on={opts.buildings === "3d"} onChange={(v) => setOptions({ buildings: v ? "3d" : "flat" })} />
      <Divider />
      <button type="button" className={ROW} onClick={() => { onClose(); setDrawerOpen(true); }}>
        <SlidersHorizontal className={ICON} aria-hidden /><span className="flex-1">More filters</span><ChevronRight className="h-4 w-4 text-[#a5b4cb]" aria-hidden />
      </button>
    </div>
  );
}

const KIND_ICON: Record<MemoryKind, LucideIcon> = { rides: TrainFront, homeWork: House, chats: MessageSquare, trips: History, exactLocation: LocateFixed };

type DataSection = "kept" | "yours";

function DataBody() {
  const prefs = useMemoryPrefs();
  const [section, setSection] = useState<DataSection | null>("kept");
  const [seeAll, setSeeAll] = useState<StoredItem[] | null>(null);
  const [policy, setPolicy] = useState(false);
  const [confirm, setConfirm] = useState<"ask" | "done" | null>(null);
  const toggle = (id: DataSection) => setSection(section === id ? null : id);
  const refresh = () => { if (seeAll) setSeeAll(listStored()); };
  const head = (id: DataSection, icon: ReactNode, label: string, extra?: ReactNode) => (
    <button type="button" aria-expanded={section === id} onClick={() => toggle(id)}
      className="flex min-h-12 w-full items-center gap-2.5 px-2.5 text-left text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
      {icon}
      <span className="flex-1">{label}</span>
      {extra}
      <span aria-hidden className="text-[#a5b4cb]">{section === id ? "▴" : "▾"}</span>
    </button>
  );
  return (
    <div data-testid="data-panel">
      {head("kept", <Lightbulb className="h-5 w-5 text-[#93c5fd]" aria-hidden />, "Remembered",
        <span className="text-[13px] font-medium text-[#a5b4cb]">{rememberedCount(prefs)} of {MEMORY_KINDS.length}</span>)}
      {section === "kept" ? (
        <div className="pb-1">
          {MEMORY_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return <SwitchRow key={k} testId={`memory-${k}`} icon={<Icon className={ICON} aria-hidden />} label={MEMORY_LABELS[k]} on={prefs[k]} onChange={(v) => { setRemembering(k, v); refresh(); }} />;
          })}
        </div>
      ) : null}
      <Divider />
      {head("yours", <Shield className="h-5 w-5 text-[#93c5fd]" aria-hidden />, "Your data")}
      {section === "yours" ? (
        <div className="flex flex-col gap-1 px-1 pb-1">
          <button type="button" className={ROW} aria-expanded={seeAll !== null} onClick={() => setSeeAll(seeAll ? null : listStored())}>
            <Database className={ICON} aria-hidden /><span className="flex-1">See all</span><ChevronRight className={`h-4 w-4 text-[#a5b4cb] transition-transform ${seeAll ? "rotate-90" : ""}`} aria-hidden />
          </button>
          {seeAll ? (
            <ul className="mx-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-[12px] bg-[rgba(15,23,42,0.55)] p-2 text-[13px] text-[#cbd5e1]" data-testid="memory-list">
              {seeAll.length ? seeAll.map((s, i) => <li key={i} className="truncate">{s.text}</li>) : <li>Nothing kept</li>}
            </ul>
          ) : null}
          <button type="button" className={ROW} aria-expanded={policy} onClick={() => setPolicy((v) => !v)}>
            <Info className={ICON} aria-hidden /><span className="flex-1">Data policy</span><ChevronRight className={`h-4 w-4 text-[#a5b4cb] transition-transform ${policy ? "rotate-90" : ""}`} aria-hidden />
          </button>
          {policy ? <p className="m-0 px-2 text-[13px] leading-snug text-[#a5b4cb]">Kept on this phone. A draft, not a published policy yet.</p> : null}
          <button type="button" data-testid="forget-everything" className={`${ROW} bg-[rgba(127,29,29,0.3)] font-semibold text-[#fca5a5]`}
            onClick={() => {
              if (confirm !== "ask") { setConfirm("ask"); return; }
              forgetEverything();
              setConfirm("done");
              refresh();
            }}>
            <Trash2 className={ICON} aria-hidden />
            <span className="flex-1">{confirm === "ask" ? "Tap again to delete everything" : confirm === "done" ? "Deleted" : "Delete everything"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CityDataBody({ onClose, onOpenDashboard, onOpenSources }: { onClose: () => void; onOpenDashboard: () => void; onOpenSources: () => void }) {
  const flags = useFlags();
  const { setCaveatsOpen } = useMapState();
  return (
    <div data-testid="city-data-panel">
      <button type="button" className={ROW} onClick={() => { onClose(); onOpenDashboard(); }}>
        <BarChart3 className={ICON} aria-hidden /><span className="flex-1">311 and crashes</span><ChevronRight className="h-4 w-4 text-[#a5b4cb]" aria-hidden />
      </button>
      {flags.dataLayers ? (
        <button type="button" className={ROW} onClick={() => { onClose(); onOpenSources(); }}>
          <Database className={ICON} aria-hidden /><span className="flex-1">Data layers</span><ChevronRight className="h-4 w-4 text-[#a5b4cb]" aria-hidden />
        </button>
      ) : null}
      <button type="button" className={ROW} onClick={() => { onClose(); setCaveatsOpen(true); }}>
        <Info className={ICON} aria-hidden /><span className="flex-1">About the data</span><ChevronRight className="h-4 w-4 text-[#a5b4cb]" aria-hidden />
      </button>
    </div>
  );
}

function SettingsBody() {
  const [advanced, setAdvanced] = useAdvancedMode();
  const voice = useVoicePrefs();
  const flags = useFlags();
  const ambient = useAmbient();
  const theme = useTheme();
  const { eco, setEco, city3d, setCity3d } = useMapState();
  return (
    <div data-testid="settings-panel">
      <SwitchRow icon={<Volume2 className={ICON} aria-hidden />} label="Speak answers" on={voice.speak} onChange={(v) => setVoicePrefs({ speak: v })} />
      <SwitchRow icon={<Ear className={ICON} aria-hidden />} label="Listen for “Hey map”" on={voice.wake} onChange={(v) => setVoicePrefs({ wake: v })} />
      <Divider />
      <Choice icon={<Palette className={ICON} aria-hidden />} label="Theme" value={theme} onChange={setTheme}
        options={CHOICES.map((c) => [c, c === "auto" ? "Auto" : THEMES[c].label])} />
      {flags.daylight ? <Choice icon={<Sun className={ICON} aria-hidden />} label="Lighting" value={ambient.lighting} onChange={(v: LightingMode) => setAmbient({ lighting: v })} options={[["auto", "Auto"], ["day", "Day"], ["night", "Night"]]} /> : null}
      {flags.weather ? <Choice icon={<CloudSun className={ICON} aria-hidden />} label="Weather" value={ambient.weatherMode} onChange={(v: WeatherMode) => setAmbient({ weatherMode: v })} options={[["live", "Live"], ["clear", "Clear"], ["off", "Off"]]} /> : null}
      <Divider />
      {flags.city3d ? <SwitchRow icon={<Box className={ICON} aria-hidden />} label="Textured 3D city" on={city3d} onChange={setCity3d} /> : null}
      <SwitchRow icon={<Leaf className={ICON} aria-hidden />} label="Eco mode" on={eco} onChange={setEco} />
      <SwitchRow icon={<Gauge className={ICON} aria-hidden />} label="Advanced" on={advanced} onChange={setAdvanced} />
    </div>
  );
}

export function MenuRow({ onOpenDashboard, onOpenSources }: { onOpenDashboard: () => void; onOpenSources: () => void }) {
  const openMenu = useOpenMenu();
  const open = IDS.has(openMenu) ? (openMenu as MenuId) : null;
  const [active, setActive] = useState<MenuId>("myDay");
  const line = useSelectedLine();
  const followed = useFollowed();
  const { walking, streetViewOpen } = useMapState();
  const { drawerOpen } = usePanel();
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const close = () => { if (IDS.has(openMenu)) setOpenMenu(null); };
  const hidden = walking || streetViewOpen || !!line || !!followed;

  // A tap anywhere else, or Escape, closes the dropdown. More layers, a line or Follow closes it too.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpenMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => { if (drawerOpen || hidden) close(); }, [drawerOpen, hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  // An open menu is always the active one.
  useEffect(() => { if (open && open !== active) setActive(open); }, [open, active]);
  // The new active menu moves to the left edge, so the row starts there again.
  useLayoutEffect(() => { scroller.current?.scrollTo({ left: 0 }); }, [active]);

  if (hidden) return null;

  const pick = (id: MenuId) => {
    const next = pressMenu(active, open, id);
    setActive(next.active);
    setOpenMenu(next.open);
  };
  const items = rowOrder(ITEMS, active);
  const top = "calc(env(safe-area-inset-top) + 16px)";
  const fade: CSSProperties = { maskImage: "linear-gradient(to right, #000 62%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, #000 62%, transparent 100%)" };

  return (
    <div ref={wrap} data-testid="menu-row" className="pointer-events-none absolute left-3 z-40 flex flex-col gap-2" style={{ top, width: "min(310px, calc(100vw - 80px))" }}>
      <nav aria-label="Menus" className="pointer-events-auto" data-active={active}>
        <div ref={scroller} className="-my-3 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={fade}>
          {items.map((it, i) => {
            const { Icon } = it;
            if (i === 0) {
              const on = open === it.id;
              return (
                <button key={it.id} type="button" aria-expanded={on} aria-haspopup="true" onClick={() => pick(it.id)} data-testid="menu-pill" data-menu={it.id}
                  className={`flex h-11 shrink-0 snap-start items-center gap-2 rounded-full pl-3 pr-3.5 text-[15px] font-semibold ${RING} ${on ? "border border-transparent bg-[#f8fafc] text-[#0f172a]" : "border border-[#263449] bg-[rgba(15,23,42,0.92)] text-[#f1f5f9]"}`}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                  {it.label}
                </button>
              );
            }
            const size = MENU_SIZE[i];
            const icon = Math.min(18, size - 4);
            return (
              <button key={it.id} type="button" aria-label={it.label} onClick={() => pick(it.id)} data-testid={`menu-${it.id}`} data-menu={it.id}
                className={`flex shrink-0 snap-start items-center justify-center rounded-full border-0 bg-transparent p-0 text-[#f1f5f9] ${RING}`}
                style={{ width: size, height: size, opacity: MENU_ALPHA[i] }}>
                <Icon aria-hidden style={{ width: icon, height: icon, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
              </button>
            );
          })}
          <span aria-hidden className="w-6 shrink-0" />
        </div>
      </nav>
      {open ? (
        <div role="region" aria-label={ITEMS.find((x) => x.id === open)!.label} data-testid="menu-dropdown"
          className={`pointer-events-auto w-[min(320px,calc(100vw-92px))] overflow-y-auto overscroll-contain ${FLOAT}`}
          style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top) - 84px - var(--chat-bar-h, 0px) - 12px)" }}>
          {open === "myDay" ? (MyDayBody ? <Suspense fallback={null}><MyDayBody onClose={close} /></Suspense> : null)
            : open === "layers" ? <LayersBody onClose={close} />
            : open === "filters" ? <FiltersBody onClose={close} />
            : open === "data" ? <DataBody />
            : open === "cityData" ? <CityDataBody onClose={close} onOpenDashboard={onOpenDashboard} onOpenSources={onOpenSources} />
            : <SettingsBody />}
        </div>
      ) : null}
    </div>
  );
}
