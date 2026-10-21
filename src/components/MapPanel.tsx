import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Drawer } from "vaul";
import { Button } from "@/components/ui/button";
import type { NtaBoundary } from "@/lib/api/nta";
import { useMapState } from "@/lib/store/MapStateContext";
import { usePanel, type PanelChip, type SheetSnap } from "@/lib/store/PanelContext";
import { cn } from "@/lib/utils";
import { PanelSearch } from "./PanelSearch";

/** Mobile snap points: peek shows the summary only. */
const PEEK = "168px";
const SNAPS: Array<string | number> = [PEEK, 0.5, 1];
const SNAP_BY_NAME: Record<SheetSnap, string | number> = { peek: PEEK, half: 0.5, full: 1 };
const nameOf = (point: string | number | null): SheetSnap =>
  point === 1 ? "full" : point === 0.5 ? "half" : "peek";

/** Chips that later features (transit, schools) take over by registering the same id. */
const PLACEHOLDER_CHIPS = [
  { id: "transit", label: "Transit" },
  { id: "schools", label: "Schools" },
];

function Chips() {
  const { layer, setLayer, restrooms, setRestrooms } = useMapState();
  const { chips } = usePanel();
  const builtIn: PanelChip[] = [
    { id: "noise", label: "Noise", active: layer === "noise", onToggle: () => setLayer(layer === "noise" ? "combined" : "noise") },
    { id: "crashes", label: "Crashes", active: layer === "crashes", onToggle: () => setLayer(layer === "crashes" ? "combined" : "crashes") },
    { id: "restrooms", label: "Restrooms", active: restrooms, onToggle: () => setRestrooms(!restrooms) },
  ];
  const registered = new Map(chips.map((chip) => [chip.id, chip]));
  const order = ["noise", "crashes", "transit", "restrooms", "schools"];
  const all = order.map(
    (id) =>
      registered.get(id) ??
      builtIn.find((c) => c.id === id) ??
      ({ ...PLACEHOLDER_CHIPS.find((c) => c.id === id)!, active: false, onToggle: undefined } as const),
  );
  const extra = chips.filter((c) => !order.includes(c.id));
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
      {[...all, ...extra].map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={chip.active}
          disabled={!chip.onToggle}
          onClick={chip.onToggle}
          className={cn(
            "h-8 shrink-0 rounded-full border px-3 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
            chip.active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function Home() {
  return (
    <div className="p-4">
      <div className="text-sm font-semibold">Explore NYC</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Search, or tap a neighborhood or block on the map.
      </div>
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
}: {
  isDesktop: boolean;
  boundaries: NtaBoundary[] | null;
  /** The selected neighborhood / block (rendered by `PlaceDetails`), or null. */
  place: ReactNode;
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
            <PanelSearch boundaries={boundaries} />
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
      <div className="absolute inset-x-3 top-3 z-30 space-y-2">
        <PanelSearch boundaries={boundaries} />
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
            className="fixed inset-x-0 bottom-0 z-40 flex h-full max-h-[97%] flex-col rounded-t-2xl border border-border bg-card shadow-2xl outline-none"
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
