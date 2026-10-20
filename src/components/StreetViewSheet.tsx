import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  KeyRound,
  Play,
  Square,
  TriangleAlert,
} from "lucide-react";
import type { Viewer as MapillaryViewer } from "mapillary-js";
import "mapillary-js/dist/mapillary.css";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  findNearestImage,
  hasMapillaryToken,
  MAPILLARY_TOKEN,
  mapillaryImageLink,
  metresBetween,
} from "@/lib/api/mapillary";
import { formatCount, formatDate } from "@/lib/format";
import type { BlockDatum } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { cn } from "@/lib/utils";

interface StreetViewSheetProps {
  /** The block whose surroundings we photograph. */
  block: BlockDatum | null;
  ntaName: string | null;
  /** The block's numbers, e.g. "1,204 noise complaints". */
  caption: string;
  isDesktop: boolean;
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 p-6">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="text-xs font-semibold">{title}</div>
        <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export function StreetViewSheet({
  block,
  ntaName,
  caption,
  isDesktop,
}: StreetViewSheetProps) {
  const { streetViewOpen, setStreetViewOpen } = useMapState();
  const open = streetViewOpen && block !== null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<MapillaryViewer | null>(null);

  const [ready, setReady] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [driving, setDriving] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [atSequenceEnd, setAtSequenceEnd] = useState(false);
  const [distanceFromBlock, setDistanceFromBlock] = useState<number | null>(
    null,
  );

  // The nearest photo is a real API lookup, so it is server state like any
  // other: cached per block, and skipped entirely without a token.
  const query = useQuery({
    queryKey: ["mapillary", "nearest", block?.key ?? "none"],
    queryFn: async () => (block ? findNearestImage(block.center) : null),
    enabled: open && hasMapillaryToken && block !== null,
    staleTime: 10 * 60_000,
    gcTime: 10 * 60_000,
    retry: false,
  });

  const image = query.data ?? null;

  useEffect(() => {
    setDistanceFromBlock(image ? image.distance : null);
  }, [image]);

  useEffect(() => {
    if (!open) setDriving(false);
  }, [open]);

  // Mount the panorama viewer once we know which photo to show. MapillaryJS
  // owns everything inside the container, so React renders it empty and never
  // touches it again.
  useEffect(() => {
    if (!open || !image) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let viewer: MapillaryViewer | null = null;

    const boot = async () => {
      const { Viewer } = await import("mapillary-js");
      if (cancelled || !containerRef.current) return;

      const instance = new Viewer({
        accessToken: MAPILLARY_TOKEN,
        container,
        // Arrow keys belong to the sheet's own sequence stepping, not to the
        // viewer's pan controls.
        component: { keyboard: false },
      });
      viewer = instance;
      viewerRef.current = instance;

      instance.on("load", () => {
        // The sheet slides in, so measure again once the canvas has a size.
        instance.resize();
        if (!cancelled) setReady(true);
      });

      // Walking the sequence moves away from the block, and the footer says so
      // rather than pretending the photos still describe this square.
      instance.on("image", () => {
        const origin = { lon: image.lon, lat: image.lat };
        void instance
          .getPosition()
          .then((position) => {
            if (cancelled) return;
            setDistanceFromBlock(
              metresBetween(origin, { lon: position.lng, lat: position.lat }),
            );
          })
          .catch(() => undefined);
      });

      try {
        await instance.moveTo(image.id);
      } catch {
        if (!cancelled) {
          setViewerError("Mapillary could not load this photo.");
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      viewerRef.current = null;
      setReady(false);
      setViewerError(null);
      setAtSequenceEnd(false);
      if (viewer) viewer.remove();
    };
  }, [open, image]);

  const step = useCallback(
    async (direction: "next" | "prev"): Promise<boolean> => {
      const viewer = viewerRef.current;
      if (!viewer) return false;

      setNavigating(true);
      setAtSequenceEnd(false);

      const advance = async () => {
        const { NavigationDirection } = await import("mapillary-js");
        return viewer.moveDir(
          direction === "next"
            ? NavigationDirection.Next
            : NavigationDirection.Prev,
        );
      };

      try {
        try {
          await advance();
        } catch {
          // `moveDir` throws while the sequence edges of a freshly loaded image
          // are still being fetched, which is not the end of the street.
          await new Promise((resolve) => setTimeout(resolve, 600));
          await advance();
        }
        return true;
      } catch {
        // Running out of sequence is the normal end of a street, not a fault.
        setAtSequenceEnd(true);
        return false;
      } finally {
        setNavigating(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!driving) return;

    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        const moved = await step("next");
        if (!moved || cancelled) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelled) setDriving(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [driving, step]);

  const close = () => setStreetViewOpen(false);

  const footerNote = atSequenceEnd
    ? "End of this sequence — try another block"
    : distanceFromBlock === null
      ? ""
      : distanceFromBlock < 15
        ? "At this block"
        : `${formatCount(Math.round(distanceFromBlock))} m from this block`;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-border/60 p-4 pb-3 pr-10">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            Street view · {ntaName ?? "this block"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {caption} in this ~300 m block
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div ref={containerRef} className="absolute inset-0" />

        {!hasMapillaryToken ? (
          <Notice icon={<KeyRound className="h-4 w-4" />} title="No Mapillary token">
            Add <code className="font-mono">VITE_MAPILLARY_TOKEN</code> to{" "}
            <code className="font-mono">.env</code> — a free client token from{" "}
            <a
              className="underline"
              href="https://www.mapillary.com/dashboard/developers"
              target="_blank"
              rel="noreferrer"
            >
              mapillary.com
            </a>{" "}
            — then restart the dev server.
          </Notice>
        ) : query.isPending ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/90">
            <Skeleton className="h-2 w-40" />
            <div className="text-[11px] text-muted-foreground">
              Looking for photos near this block…
            </div>
          </div>
        ) : query.isError ? (
          <Notice
            icon={<TriangleAlert className="h-4 w-4" />}
            title="Could not reach Mapillary"
          >
            <p>{query.error instanceof Error ? query.error.message : "Unknown error."}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </Notice>
        ) : image === null ? (
          <Notice
            icon={<ImageOff className="h-4 w-4" />}
            title="No photos within 250 m"
          >
            Mapillary coverage in New York is patchy — try a block near an
            avenue.
          </Notice>
        ) : viewerError ? (
          <Notice
            icon={<TriangleAlert className="h-4 w-4" />}
            title="Photo unavailable"
          >
            {viewerError}
          </Notice>
        ) : !ready ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90">
            <div className="text-[11px] text-muted-foreground">
              Loading photo…
            </div>
          </div>
        ) : null}

        {image ? (
          <a
            href={mapillaryImageLink(image.id)}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-2 right-2 z-20 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur hover:text-foreground"
          >
            Imagery © Mapillary
            {image.capturedAt ? ` · ${formatDate(image.capturedAt)}` : ""}
          </a>
        ) : null}
      </div>

      {image ? (
        <div className="flex items-center gap-2 border-t border-border/60 p-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            aria-label="Previous photo"
            disabled={!ready || navigating}
            onClick={() => void step("prev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={driving ? "default" : "outline"}
            className="h-8 text-[11px]"
            aria-pressed={driving}
            disabled={!ready}
            onClick={() => setDriving((value) => !value)}
          >
            {driving ? (
              <Square className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {driving ? "Stop" : "Drive"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            aria-label="Next photo"
            disabled={!ready || navigating}
            onClick={() => void step("next")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-auto text-right text-[10px] leading-tight text-muted-foreground">
            {footerNote}
          </span>
        </div>
      ) : null}
    </>
  );

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isDesktop ? "w-full sm:max-w-xl" : "h-[85vh]",
        )}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            void step("next");
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            void step("prev");
          }
        }}
      >
        <SheetTitle className="sr-only">
          Street-level photos near {ntaName ?? "the selected block"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Mapillary panoramas near the selected block. Arrow keys step along the
          photo sequence; the block numbers stay visible above the photo.
        </SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}
