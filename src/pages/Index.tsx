import { useMemo, useState } from "react";
import { CaveatsSheet } from "@/components/CaveatsSheet";
import { ChatPanel } from "@/components/ChatPanel";
import { ControlDrawer } from "@/components/ControlDrawer";
import { DetailsSheet } from "@/components/DetailsSheet";
import { MapHud } from "@/components/MapHud";
import { MapStatusChip } from "@/components/MapStatusChip";
import { MapView } from "@/components/MapView";
import { StreetViewSheet } from "@/components/StreetViewSheet";
import { formatCount } from "@/lib/format";
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
  } = useMapState();
  const [controlsOpen, setControlsOpen] = useState(false);
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

  // The street-view sheet repeats the block's numbers over the photo, so the
  // panorama can never be read as a different square's evidence.
  const blockCaption = useMemo(() => {
    if (!selectedBlock) return "";
    if (layer === "noise") {
      return `${formatCount(selectedBlock.noiseCount)} noise complaints`;
    }
    if (layer === "crashes") {
      return `${formatCount(selectedBlock.crashCount)} crashes`;
    }
    return `${formatCount(selectedBlock.noiseCount)} noise · ${formatCount(
      selectedBlock.crashCount,
    )} crashes`;
  }, [selectedBlock, layer]);

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
      <MapView model={model} boundaries={data.boundaries} />

      <MapStatusChip
        windowId={windowId}
        progress={data.progress}
        isLoading={data.isLoading}
        isError={data.isError}
        errorMessage={data.error?.message ?? null}
        onRetry={data.retry}
      />

      <MapHud
        buckets={model.buckets}
        maxValue={model.maxValue}
        onOpenControls={() => setControlsOpen(true)}
      />

      <ControlDrawer
        open={controlsOpen}
        onOpenChange={setControlsOpen}
        progress={data.progress}
        isLoading={data.isLoading}
        isError={data.isError}
        errorMessage={data.error?.message ?? null}
        neighborhoods={neighborhoods}
        onRetry={data.retry}
        buckets={model.buckets}
        maxValue={model.maxValue}
      />

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

      <StreetViewSheet
        block={selectedBlock}
        ntaName={selectedBoundary?.ntaName ?? null}
        caption={blockCaption}
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
