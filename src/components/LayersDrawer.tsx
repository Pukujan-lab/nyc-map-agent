import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { FEATURES } from "@/features";
import { useFeatureToggles } from "@/lib/featureToggles";
import { isFlagId, useFlags } from "@/lib/flags";
import type { NtaBoundary } from "@/lib/api/nta";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import { startSharing, stopSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { onMapInstance } from "@/lib/map/mapInstance";
import { SUBWAY_ROUTES, setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { PLACE_CATEGORIES, setPlaces, usePlaces } from "@/lib/map/places";
import { setTransitFocusOff } from "@/lib/map/transitFocus";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type PanelChip } from "@/lib/store/PanelContext";
import { CHOICES, THEMES, setTheme, useAutoPhase, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** A labelled filter chip: filled ink when on, outlined when off. No icons. */
export function Pill({ on, onClick, children, className }: { on?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-[var(--sp-4)] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, note, children, hidden }: { title: string; note?: string; children: ReactNode; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <section className="space-y-[var(--sp-3)]" aria-label={title}>
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        {note ? <span className="ml-1 font-normal normal-case tracking-normal">· {note}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/** The neighborhood under the map centre, for the "Exploring …" heading. */
function useNeighborhood(boundaries: NtaBoundary[] | null): string {
  const index = useMemo(() => (boundaries?.length ? new NtaIndex(boundaries) : null), [boundaries]);
  const [name, setName] = useState("New York");
  useEffect(() => {
    let off: (() => void) | null = null;
    const stop = onMapInstance((map) => {
      off?.();
      if (!map) return;
      const read = () => {
        const c = map.getCenter();
        const code = index?.assignCode(c.lat, c.lng);
        const b = code ? boundaries?.find((x) => x.ntaCode === code) : null;
        setName(b ? b.ntaName.split("-")[0].split(" (")[0] : "New York");
      };
      read();
      map.on("moveend", read);
      off = () => map.off("moveend", read);
    });
    return () => { off?.(); stop(); };
  }, [index, boundaries]);
  return name;
}

const GETTING_AROUND = ["liveTrains", "liveBuses", "transitFocus"];

/**
 * Layout A (#171): every control lives in this one drawer — a bottom sheet on
 * phones, a floating card on the left on desktop. Labelled sections, a search
 * box over every option, Clear all and Done. No icon-only controls, no tooltips.
 */
export function LayersDrawer({
  open,
  onOpenChange,
  isDesktop,
  hudActive,
  boundaries,
  onOpenControls,
  onOpenSources,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDesktop: boolean;
  /** Follow / Navigate HUD on top: the phone drawer must not cover it. */
  hudActive?: boolean;
  boundaries: NtaBoundary[] | null;
  onOpenControls: () => void;
  onOpenSources: () => void;
}) {
  const flags = useFlags();
  const { chips } = usePanel();
  const [toggledOn, toggle] = useFeatureToggles();
  const { restrooms, setRestrooms, city3d, setCity3d, eco, setEco, setCaveatsOpen, navigate, flyTo } = useMapState();
  const { routePicking, routeStart, setRoutePicking } = useDataView();
  const places = usePlaces();
  const opts = useMapOptions();
  const theme = useTheme();
  const phase = useAutoPhase();
  const shared = useSharedLocation();
  const hood = useNeighborhood(boundaries);
  const [q, setQ] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);
  const match = (label: string) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase());

  const registered = new Map<string, PanelChip>();
  for (const c of chips) registered.set(c.id, c);
  const layerChips: PanelChip[] = [];
  const seen = new Set<string>();
  const add = (c: PanelChip) => {
    if (seen.has(c.id) || GETTING_AROUND.includes(c.id) || (isFlagId(c.id) && !flags[c.id])) return;
    seen.add(c.id);
    layerChips.push(c);
  };
  if (registered.has("transit")) add(registered.get("transit")!);
  if (flags.restrooms) add({ id: "restrooms", label: "Restrooms", active: restrooms, onToggle: () => setRestrooms(!restrooms) });
  if (registered.has("restroomShops")) add(registered.get("restroomShops")!);
  for (const f of FEATURES) if (f.chip && flags[f.id]) add({ id: f.chip.id, label: f.chip.label, active: toggledOn.has(f.chip.id), onToggle: () => toggle(f.chip!.id) });
  for (const c of chips) add(c);

  const directing = routePicking !== null || routeStart !== null;
  const filtersOn = places.size + opts.routes.length + layerChips.filter((c) => c.active).length + (opts.stationsOnly ? 1 : 0) + (registered.get("liveBuses")?.active ? 1 : 0);
  const clearAll = () => {
    setPlaces(new Set());
    setOptions({ routes: [], stationsOnly: false });
    setTransitFocusOff();
    for (const c of layerChips) if (c.active && c.id !== "transit") c.onToggle();
    const buses = registered.get("liveBuses");
    if (buses?.active) buses.onToggle();
  };
  const togglePlace = (id: string) => {
    const next = new Set(places);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPlaces(next);
  };
  const toggleRoute = (r: string) => setOptions({ routes: opts.routes.includes(r) ? opts.routes.filter((x) => x !== r) : [...opts.routes, r] });

  const around: Array<{ id: string; label: string; on?: boolean; onClick: () => void; primary?: boolean }> = [];
  if (flags.directions) around.push({ id: "directions", label: "Directions", primary: true, on: directing, onClick: () => { setRoutePicking(routeStart ? "end" : "start"); onOpenChange(false); } });
  for (const id of GETTING_AROUND) {
    const c = registered.get(id);
    if (c) around.push({ id, label: c.label, on: c.active, onClick: c.onToggle });
  }
  around.push(
    shared.status === "on"
      ? { id: "loc", label: "Stop sharing location", on: true, onClick: () => stopSharing() }
      : { id: "loc", label: shared.status === "asking" ? "Finding you…" : "My location", onClick: () => void startSharing().then((c) => { if (c) flyTo({ lon: c.lon, lat: c.lat, zoom: 16 }); }) },
  );

  const placeItems = PLACE_CATEGORIES.filter((c) => match(c.label) || c.subs.some((s) => match(s.label)));
  const routeItems = SUBWAY_ROUTES.filter((r) => !q.trim() || match(`${r} train`) || match("subway") || match("lines"));
  const advanced = [
    { label: "Filters and settings…", onClick: () => { onOpenChange(false); onOpenControls(); } },
    ...(flags.dataLayers ? [{ label: "Data layers…", onClick: () => { onOpenChange(false); onOpenSources(); } }] : []),
    ...(flags.city3d ? [{ label: city3d ? "Textured 3D city: on" : "Textured 3D city: off", on: city3d, onClick: () => setCity3d(!city3d) }] : []),
    { label: eco ? "Eco mode: on" : "Eco mode: off", on: eco, onClick: () => setEco(!eco) },
    { label: "Face north", onClick: () => navigate("north") },
    { label: "About the data and credits", onClick: () => setCaveatsOpen(true) },
  ];

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-[var(--sp-3)] px-[var(--sp-4)] pt-[var(--sp-3)]">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-[26px] leading-tight">
            Exploring <em>{hood}</em>
          </h2>
          <p className="text-[13px] text-muted-foreground">Filters · {filtersOn} on</p>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} className="mt-2 text-[14px] font-semibold underline underline-offset-4">
          Done
        </button>
      </div>
      <div className="px-[var(--sp-4)] pb-[var(--sp-1)] pt-[var(--sp-3)]">
        <label className="sr-only" htmlFor="layers-search">Search filters</label>
        <input
          id="layers-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search filters (coffee, L train, buildings…)"
          className="h-10 w-full rounded-full border border-input bg-card px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-[var(--sp-5)] overflow-y-auto overscroll-contain px-[var(--sp-4)] pb-[var(--sp-6)] pt-[var(--sp-3)]">
        <Section title="Getting around" hidden={!around.some((a) => match(a.label))}>
          <div className="grid grid-cols-2 gap-[var(--sp-2)]">
            {around.filter((a) => match(a.label)).map((a) =>
              a.primary ? (
                <button key={a.id} type="button" onClick={a.onClick} className="h-11 rounded-full bg-acc text-[14px] font-semibold text-acc-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {a.label}
                </button>
              ) : (
                <Pill key={a.id} on={a.on} onClick={a.onClick} className="h-11 text-[14px]">{a.label}</Pill>
              ),
            )}
          </div>
        </Section>

        {q.trim() && !match("nearby stations arrivals") && !match("bus") && !match("queens") && !match("bronx") && !match("brooklyn") && !match("staten island") ? null : (
          <div>
          {FEATURES.filter((f) => f.HomeSection && flags[f.id]).map((f) => {
            const S = f.HomeSection!;
            return <Suspense key={f.id} fallback={null}><S /></Suspense>;
          })}
          </div>
        )}

        <Section title="Layers" hidden={!layerChips.some((c) => match(c.label))}>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {layerChips.filter((c) => match(c.label)).map((c) => <Pill key={c.id} on={c.active} onClick={c.onToggle}>{c.label}</Pill>)}
          </div>
        </Section>

        <Section title="Places" note="hidden until chosen" hidden={!placeItems.length}>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {placeItems.map((c) => {
              const n = c.subs.filter((s) => places.has(s.id)).length;
              return (
                <Pill key={c.id} on={n > 0} onClick={() => setOpenCat(openCat === c.id ? null : c.id)}>
                  {c.label}{n ? ` · ${n}` : ""} {openCat === c.id ? "▴" : "▾"}
                </Pill>
              );
            })}
            {places.size ? <Pill onClick={() => setPlaces(new Set())}>Hide all places</Pill> : null}
          </div>
          {placeItems.filter((c) => c.id === openCat || (q.trim() && c.subs.some((s) => match(s.label)))).map((c) => (
            <div key={c.id} className="space-y-2 border-l-2 border-border pl-3">
              <div className="flex items-center justify-between text-[13px] text-muted-foreground">
                <span>{c.label}</span>
                <button type="button" className="font-medium underline underline-offset-2" onClick={() => {
                  const all = c.subs.every((s) => places.has(s.id));
                  const next = new Set(places);
                  for (const s of c.subs) if (all) next.delete(s.id); else next.add(s.id);
                  setPlaces(next);
                }}>
                  {c.subs.every((s) => places.has(s.id)) ? "None" : "All"}
                </button>
              </div>
              <div className="flex flex-wrap gap-[var(--sp-2)]">
                {c.subs.filter((s) => !q.trim() || match(s.label) || match(c.label)).map((s) => (
                  <Pill key={s.id} on={places.has(s.id)} onClick={() => togglePlace(s.id)}>{s.label}</Pill>
                ))}
              </div>
              {c.id === "food" ? <p className="text-[12px] text-muted-foreground">Cuisine, price and opening hours are not in the open map data yet.</p> : null}
            </div>
          ))}
        </Section>

        <Section title="Transit lines" note={opts.routes.length ? `${opts.routes.length} picked` : "all, muted"} hidden={!routeItems.length && !match("stations only")}>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {routeItems.map((r) => (
              <Pill key={r} on={opts.routes.includes(r)} onClick={() => toggleRoute(r)} className="h-9 w-11 px-0">{r}</Pill>
            ))}
          </div>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            <Pill on={opts.stationsOnly} onClick={() => setOptions({ stationsOnly: !opts.stationsOnly })}>Stations only (hide vehicles)</Pill>
            {opts.routes.length ? <Pill onClick={() => setOptions({ routes: [] })}>Show all lines</Pill> : null}
          </div>
        </Section>

        <Section title="Map detail" hidden={!!q.trim() && !["streets", "street names", "buildings", "theme", "auto", "dusk", "night", "ivory", "ink", "mta", "neon", "map detail"].some(match)}>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            <Pill on={opts.streets === "simple"} onClick={() => setOptions({ streets: "simple" })}>Simple streets</Pill>
            <Pill on={opts.streets === "full"} onClick={() => setOptions({ streets: "full" })}>Detailed streets</Pill>
            <Pill on={opts.streetNames} onClick={() => setOptions({ streetNames: !opts.streetNames })}>Street names</Pill>
            <Pill on={opts.buildings === "flat"} onClick={() => setOptions({ buildings: "flat" })}>Flat buildings</Pill>
            <Pill on={opts.buildings === "3d"} onClick={() => setOptions({ buildings: "3d" })}>3D buildings</Pill>
          </div>
          <p className="text-[13px] text-muted-foreground">Rotate: right-drag or Ctrl+drag</p>
          <div className="text-[13px] text-muted-foreground">Theme</div>
          <div className="flex flex-wrap gap-[var(--sp-2)]" role="radiogroup" aria-label="Theme">
            {CHOICES.map((id) => (
              <Pill key={id} on={theme === id} onClick={() => setTheme(id)}>
                {id === "auto" ? `Auto${theme === "auto" && phase ? ` · ${phase[0].toUpperCase()}${phase.slice(1)}` : " (time of day)"}` : THEMES[id].label}
              </Pill>
            ))}
          </div>
        </Section>

        <Section title="Advanced" hidden={!advanced.some((a) => match(a.label)) && !match("advanced")}>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            {advanced.filter((a) => match(a.label) || match("advanced")).map((a) => <Pill key={a.label} on={a.on} onClick={a.onClick}>{a.label}</Pill>)}
          </div>
        </Section>
      </div>
      <div className="grid grid-cols-2 gap-[var(--sp-2)] border-t border-border px-[var(--sp-4)] py-[var(--sp-3)]">
        <button type="button" onClick={clearAll} className="h-11 rounded-full border border-border bg-card text-[14px] font-semibold">Clear all</button>
        <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-full bg-acc text-[14px] font-semibold text-acc-foreground">Show map</button>
      </div>
    </div>
  );

  if (isDesktop) {
    if (!open) return null;
    return (
      <div role="dialog" aria-label="Layers and filters" data-testid="layers-drawer" className="absolute left-[var(--edge)] top-[calc(var(--edge)+var(--topbar-h)+var(--sp-3))] z-40 flex max-h-[calc(100%-var(--edge)*2-var(--topbar-h)-var(--sp-3))] w-[360px] flex-col overflow-hidden rounded-[22px] border border-border bg-card text-card-foreground shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-8 shrink-0 rounded-full bg-muted-foreground/30" />
        {body}
      </div>
    );
  }
  return (
    // Non-modal bottom sheet: the map stays usable (and visible to screen
    // readers) behind it; an empty-map tap or a feature tap closes it. A plain
    // panel rather than vaul, whose Root always mounts a modal Radix dialog.
    open ? (
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Layers and filters"
        data-testid="layers-drawer"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] border border-border bg-card pb-[max(var(--sp-2),env(safe-area-inset-bottom))] text-card-foreground shadow-2xl outline-none",
          // Leaves the top of the map free to tap; with Follow / Navigate on,
          // it stops further short so it never covers their HUD.
          hudActive ? "max-h-[50%]" : "max-h-[60%]",
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        {body}
      </div>
    ) : null
  );
}
