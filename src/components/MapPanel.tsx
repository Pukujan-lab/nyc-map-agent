import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { isFlagId, useFlags } from "@/lib/flags";
import { Suspense, useEffect, type ReactNode } from "react";
import { Drawer } from "vaul";
import { Button } from "@/components/ui/button";
import type { NtaBoundary } from "@/lib/api/nta";
import { useDataView } from "@/lib/store/DataViewContext";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type PanelChip, type SheetSnap } from "@/lib/store/PanelContext";
import { cn } from "@/lib/utils";
import { PanelSearch } from "./PanelSearch";
import { ViewModeMenu } from "./ViewModeMenu";
import { FEATURES } from "@/features";
import { useFeatureToggles } from "@/lib/featureToggles";
import { setPlacesShown, usePlacesShown } from "@/lib/map/places";

/** Mobile snap points: peek shows the summary only. */
/** One row (title + number) plus the grab handle. */
const PEEK = "92px";
const SNAPS: Array<string | number> = [PEEK, 0.5, 1];
const SNAP_BY_NAME: Record<SheetSnap, string | number> = { peek: PEEK, half: 0.5, full: 1 };
const nameOf = (point: string | number | null): SheetSnap =>
  point === 1 ? "full" : point === 0.5 ? "half" : "peek";


/** Feature top-bar lines (hazard notice, weather) in one quiet row under the search bar. */
function FeatureTopBar() {
  const flags = useFlags();
  const bars = FEATURES.filter((f) => f.TopBar && flags[f.id]);
  if (!bars.length) return null;
  return (
    <div className="flex min-h-0 items-center justify-between gap-3 px-1 empty:hidden">
      {bars.map((f) => {
        const Bar = f.TopBar!;
        return <Bar key={f.id} />;
      })}
    </div>
  );
}

/** Always-visible chips; everything else is one level down in "More layers". */
const PRIMARY = ["transit", "transitFocus", "places", "restrooms", "weather"];

function Chips() {
  const { restrooms, setRestrooms } = useMapState();
  const { chips } = usePanel();
  const flags = useFlags();
  const placesShown = usePlacesShown();
  const builtIn: PanelChip[] = [
    { id: "places", label: "Places", active: placesShown, onToggle: () => setPlacesShown(!placesShown) },
    { id: "restrooms", label: "Restrooms", active: restrooms, onToggle: () => setRestrooms(!restrooms) },
  ];
  const [toggledOn, toggle] = useFeatureToggles();
  const featureChips: PanelChip[] = FEATURES.filter((f) => f.chip && flags[f.id]).map((f) => ({
    id: f.chip!.id,
    label: f.chip!.label,
    active: toggledOn.has(f.chip!.id),
    onToggle: () => toggle(f.chip!.id),
  }));
  // Registered chips (Transit, Schools) win over built-ins; flags gate them all.
  const byId = new Map<string, PanelChip>();
  for (const chip of [...builtIn, ...featureChips, ...chips]) {
    if (!isFlagId(chip.id) || flags[chip.id]) byId.set(chip.id, chip);
  }
  const primary = PRIMARY.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const secondary = [...byId.values()].filter((c) => !PRIMARY.includes(c.id));
  return (
    <div className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-1.5 overflow-x-auto px-3 pb-0.5 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-24px),transparent)] [scrollbar-width:none]">
      {primary.map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={chip.active}
          onClick={chip.onToggle}
          className={cn(
            "h-7 shrink-0 snap-start rounded-full border px-2.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            chip.active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {chip.label}
        </button>
      ))}
      <ViewModeMenu chip toggles={secondary} />
    </div>
  );
}

function Home() {
  const flags = useFlags();
  const { routeStart, setRoutePicking } = useDataView();
  return (
    <div className="space-y-3 overflow-y-auto px-4 py-3">
      {flags.directions ? (
        <Button
          type="button"
          className="h-11 w-full justify-start rounded-xl text-sm"
          onClick={() => setRoutePicking(routeStart ? "end" : "start")}
        >
          Where to?
        </Button>
      ) : null}
      {FEATURES.filter((f) => f.HomeSection && flags[f.id]).map((f) => {
        const Section = f.HomeSection!;
        return (
          <Suspense key={f.id} fallback={null}>
            <Section />
          </Suspense>
        );
      })}
    </div>
  );
}

/**
 * The one map panel, Google Maps style: a collapsible left panel on desktop,
 * a bottom sheet with peek / half / full snap points (vaul) on mobile. Shows
 * pushed content (`usePanel().showPanel`), else the selected place, else home.
 */
export function MapPanel({
  isDesktop,
  boundaries,
  place,
  status,
}: {
  isDesktop: boolean;
  boundaries: NtaBoundary[] | null;
  /** The selected neighborhood / block (rendered by `PlaceDetails`), or null. */
  place: ReactNode;
  /** Thin loading line drawn under the search bar. */
  status?: ReactNode;
}) {
  const { walking, selectedNtaCode, selectedBlockKey } = useMapState();
  const { content, closePanel, snap, setSnap, collapsed, setCollapsed } = usePanel();

  // A map pick replaces pushed content; it never stacks on it.
  useEffect(() => {
    if (selectedNtaCode || selectedBlockKey) {
      closePanel();
      setCollapsed(false);
    }
  }, [selectedNtaCode, selectedBlockKey, closePanel, setCollapsed]);

  if (walking) return null;

  const body = content ? (
    <>
      <div className="flex items-start gap-2 border-b border-border/60 p-4 pb-3">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Back"
          className="-ml-2 h-7 w-7 shrink-0"
          onClick={() => {
            content.onBack?.();
            closePanel();
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSnap("half")}>
          <div className="truncate text-sm font-semibold">{content.title}</div>
          {content.subtitle ? (
            <div className="truncate text-[11px] text-muted-foreground">{content.subtitle}</div>
          ) : null}
          {content.summary}
        </button>
      </div>
      {content.details ? <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">{content.details}</div> : null}
    </>
  ) : (
    (place ?? <Home />)
  );

  if (isDesktop) {
    return (
      <>
        <div
          className={cn(
            "absolute left-0 top-0 z-30 flex h-full w-[380px] flex-col border-r border-border bg-card shadow-xl transition-transform",
            collapsed && "-translate-x-full",
          )}
        >
          <div className="space-y-2 p-3 pb-2">
            <div className="relative">
              <PanelSearch boundaries={boundaries} />
              {status}
            </div>
            <FeatureTopBar />
        <Chips />
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border/60">{body}</div>
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Show panel" : "Hide panel"}
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute top-1/2 z-30 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card shadow-md transition-[left] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "left-0" : "left-[380px]",
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 space-y-2">
        <div className="relative">
          <PanelSearch boundaries={boundaries} />
          {status}
        </div>
        <FeatureTopBar />
        <Chips />
      </div>
      <Drawer.Root
        open
        modal={false}
        dismissible={false}
        snapPoints={SNAPS}
        activeSnapPoint={SNAP_BY_NAME[snap]}
        setActiveSnapPoint={(point) => setSnap(nameOf(point))}
      >
        <Drawer.Portal>
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[97%] flex-col rounded-t-2xl pb-[env(safe-area-inset-bottom)] border border-border bg-card shadow-2xl outline-none"
          >
            <Drawer.Title className="sr-only">Map panel</Drawer.Title>
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/40" />
            <div
              className={cn("flex min-h-0 flex-1 flex-col", snap === "full" ? "overflow-y-auto" : "overflow-hidden")}
            >
              {body}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
