import { useFlag } from "@/lib/flags";
import { useMemo, useState } from "react";
import { CaveatsSheet } from "@/components/CaveatsSheet";
import { DataSourcesDrawer } from "@/components/DataSourcesDrawer";
import { RoutePanel } from "@/components/RoutePanel";
import { useWalkingRoute } from "@/lib/api/routing";
import { SOURCE_BY_ID } from "@/lib/datasets/registry";
import { useSourceCounts } from "@/lib/datasets/useSourceCounts";
import { applyView } from "@/lib/datasets/view";
import { useDataView } from "@/lib/store/DataViewContext";
import { ChatPanel } from "@/components/ChatPanel";
import { ControlDrawer } from "@/components/ControlDrawer";
import { useAreas } from "@/lib/geo/useAreas";
import { useFilters } from "@/lib/datasets/useFilters";
import { PlaceDetails } from "@/components/PlaceDetails";
import { MapPanel } from "@/components/MapPanel";
import { usePanel } from "@/lib/store/PanelContext";
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
  const { snap, setSnap } = usePanel();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const { enabledSources, viewMode, routeStart, routeEnd } = useDataView();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const data = useMapData(windowId);
  const { label: windowLabel } = windowBounds(windowId);
  const crashWindowLabel = data.crashes
    ? windowBounds(data.crashes.windowId).label
    : windowBounds("12mo").label;

  const { filters } = useFilters();
  const sourceState = useSourceCounts({
    enabled: enabledSources,
    windowId,
    boundaries: data.boundaries,
    noise: data.noise,
    crashes: data.crashes,
    filters,
  });

  const routeQuery = useWalkingRoute(routeStart, routeEnd);
  const route = routeQuery.data ?? null;

  const blockDensity = useFlag("blockDensity");
  const model = useMemo(() => {
    // Every view re-scores a combined model, so every populated block (noise
    // or crash) exists to carry its detail through.
    const base = buildMapModel({
      boundaries: data.boundaries,
      noise: data.noise,
      crashes: data.crashes,
      layer: "combined",
      scale,
      blockDensity,
    });
    return applyView(base, viewMode, sourceState.counts);
  }, [data.boundaries, data.noise, data.crashes, scale, viewMode, sourceState.counts, blockDensity]);

  const areas = useAreas(model, data.boundaries, scale);

  const selectedDatum = useMemo(
    () => model.neighborhoods.find((d) => d.ntaCode === selectedNtaCode) ?? null,
    [model.neighborhoods, selectedNtaCode],
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
  const sourceTotals = useMemo(
    () =>
      enabledSources.map((id) => {
        const counts = sourceState.counts[id];
        const source = SOURCE_BY_ID[id];
        return {
          id,
          label: source?.label ?? id,
          unit: source?.unit ?? "",
          nta: selectedNtaCode ? (counts?.byNta[selectedNtaCode] ?? 0) : 0,
          block: selectedBlockKey ? (counts?.blocks[selectedBlockKey]?.count ?? 0) : null,
        };
      }),
    [enabledSources, sourceState.counts, selectedNtaCode, selectedBlockKey],
  );

  const blockCaption = useMemo(() => {
    if (!selectedBlock) return "";
    if (model.view) {
      return `${formatCount(selectedBlock.value)} ${model.view.unit} (${model.view.label})`;
    }
    if (layer === "noise") {
      return `${formatCount(selectedBlock.noiseCount)} noise complaints`;
    }
    if (layer === "crashes") {
      return `${formatCount(selectedBlock.crashCount)} crashes`;
    }
    return `${formatCount(selectedBlock.noiseCount)} noise · ${formatCount(
      selectedBlock.crashCount,
    )} crashes`;
  }, [selectedBlock, layer, model.view]);

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
    for (const id of enabledSources) {
      if (id === "noise" || id === "crashes") continue;
      sources.push(...(sourceState.counts[id]?.sources ?? []));
    }
    return sources;
  }, [data.noise, data.crashes, enabledSources, sourceState.counts]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <MapView model={model} boundaries={data.boundaries} areas={areas} route={route} />

      <RoutePanel
        route={route}
        isLoading={routeQuery.isFetching}
        error={routeQuery.error ? routeQuery.error.message : null}
      />

      <MapStatusChip
        windowId={windowId}
        progress={data.progress}
        isLoading={data.isLoading}
        isError={data.isError}
        errorMessage={data.error?.message ?? null}
        onRetry={data.retry}
      />

      <MapHud
        isDesktop={isDesktop}
        onOpenControls={() => setControlsOpen(true)}
        onOpenSources={() => setSourcesOpen(true)}
      />

      <DataSourcesDrawer
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        counts={sourceState.counts}
        status={sourceState.status}
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
        maxValue={model.maxValue}
        areasWithData={model.areasWithData}
        view={model.view}
        areas={areas}
        onOpenSources={() => {
          setControlsOpen(false);
          setSourcesOpen(true);
        }}
      />

      <ChatPanel
        boundaries={data.boundaries}
        noise={data.noise}
        crashes={data.crashes}
        isDesktop={isDesktop}
      />

      <MapPanel
        isDesktop={isDesktop}
        boundaries={data.boundaries}
        status={
          <MapStatusChip
            variant="line"
            windowId={windowId}
            progress={data.progress}
            isLoading={data.isLoading}
            isError={data.isError}
            errorMessage={data.error?.message ?? null}
            onRetry={data.retry}
          />
        }
        place={selectedBoundary ? (
      <PlaceDetails
        loading={data.isLoading}
        onSummaryTap={() => setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek")}
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
        view={model.view}
        viewValue={selectedDatum?.value}
        breakdown={selectedBlock?.breakdown ?? selectedDatum?.breakdown}
        sourceTotals={sourceTotals}
      />) : null}
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
