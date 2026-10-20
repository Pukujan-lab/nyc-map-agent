import { useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaveatsSheet } from "@/components/CaveatsSheet";
import { ChatPanel } from "@/components/ChatPanel";
import { DetailsSheet } from "@/components/DetailsSheet";
import { Legend } from "@/components/Legend";
import { MapControls } from "@/components/MapControls";
import { MapView } from "@/components/MapView";
import { useMapData } from "@/lib/geo/aggregate";
import type { NtaAggregate } from "@/lib/geo/types";
import { buildMapModel } from "@/lib/layers";
import { useMapState } from "@/lib/store/MapStateContext";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { windowBounds } from "@/lib/windows";

export default function Index() {
  const {
    layer,
    window: windowId,
    scale,
    selectedNtaCode,
    selectedBlockKey,
    setChatOpen,
  } = useMapState();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const data = useMapData(windowId);
  const { label: windowLabel } = windowBounds(windowId);
  const crashWindowLabel = data.crashes
    ? windowBounds(data.crashes.windowId).label
    : windowBounds("12mo").label;

  const model = useMemo(
    () =>
      buildMapModel({
        boundaries: data.boundaries,
        noise: data.noise,
        crashes: data.crashes,
        layer,
        scale,
      }),
    [data.boundaries, data.noise, data.crashes, layer, scale],
  );

  const noiseByCode = useMemo(() => {
    const map = new Map<string, NtaAggregate>();
    for (const nta of data.noise?.ntas ?? []) map.set(nta.ntaCode, nta);
    return map;
  }, [data.noise]);

  const crashByCode = useMemo(() => {
    const map = new Map<string, NtaAggregate>();
    for (const nta of data.crashes?.ntas ?? []) map.set(nta.ntaCode, nta);
    return map;
  }, [data.crashes]);

  const selectedBoundary = useMemo(
    () =>
      data.boundaries?.find(
        (boundary) => boundary.ntaCode === selectedNtaCode,
      ) ?? null,
    [data.boundaries, selectedNtaCode],
  );

  const selectedBlock = useMemo(
    () =>
      selectedBlockKey
        ? (model.blocks.find((block) => block.key === selectedBlockKey) ??
          null)
        : null,
    [model.blocks, selectedBlockKey],
  );

  const neighborhoods = useMemo(() => {
    if (!data.boundaries || !data.noise) return [];
    return data.boundaries
      .map((boundary) => ({
        code: boundary.ntaCode,
        name: boundary.ntaName,
        count: noiseByCode.get(boundary.ntaCode)?.count ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data.boundaries, data.noise, noiseByCode]);

  const detailSources = useMemo(() => {
    const sources = [];
    if (data.noise) sources.push(...data.noise.sources);
    if (data.crashes) sources.push(...data.crashes.sources);
    return sources;
  }, [data.noise, data.crashes]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <MapView model={model} />

      <div className="absolute left-3 top-3 z-20 max-w-[calc(100%-4.5rem)]">
        <MapControls
          progress={data.progress}
          isLoading={data.isLoading}
          isError={data.isError}
          errorMessage={data.error?.message ?? null}
          neighborhoods={neighborhoods}
          onRetry={data.retry}
        />
      </div>

      <div className="absolute bottom-3 left-3 z-20">
        <Legend
          layer={layer}
          scale={scale}
          buckets={model.buckets}
          maxValue={model.maxValue}
        />
      </div>

      {!isDesktop ? (
        <Button
          type="button"
          size="icon"
          aria-label="Open chat"
          className="absolute right-3 top-3 z-20 h-10 w-10 rounded-full shadow-lg"
          onClick={() => setChatOpen(true)}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      ) : null}

      <ChatPanel
        boundaries={data.boundaries}
        noise={data.noise}
        crashes={data.crashes}
        isDesktop={isDesktop}
      />

      <DetailsSheet
        boundary={selectedBoundary}
        block={selectedBlock}
        noise={
          selectedNtaCode ? noiseByCode.get(selectedNtaCode) ?? null : null
        }
        crashes={
          selectedNtaCode ? crashByCode.get(selectedNtaCode) ?? null : null
        }
        windowId={windowId}
        windowLabel={windowLabel}
        crashWindowLabel={crashWindowLabel}
        sources={detailSources}
        isDesktop={isDesktop}
      />

      <CaveatsSheet
        boundaries={data.boundaries}
        noise={data.noise}
        crashes={data.crashes}
      />
    </div>
  );
}
