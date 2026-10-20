import type { NtaBoundary } from "@/lib/api/nta";
import type { AggregateResult, SoqlSource } from "@/lib/geo/types";
import { LAYER_LABELS, type LayerId } from "@/lib/layers";
import { findBoroughCenter, findBoundary } from "./places";
import { runStructuredQuery, type QueryRow } from "./query";
import type { AgentToolCall } from "./tools";

export interface ExecuteContext {
  boundaries: NtaBoundary[] | null;
  noise: AggregateResult | null;
  crashes: AggregateResult | null;
  selectNta: (ntaCode: string | null) => void;
  setHighlights: (ntaCodes: string[]) => void;
  setLayer: (layer: LayerId) => void;
  flyTo: (target: {
    lat: number;
    lon: number;
    zoom?: number;
    pitch?: number;
  }) => void;
}

export interface ExecutionResult {
  chips: string[];
  sources: SoqlSource[];
  rows: QueryRow[];
}

/**
 * Runs validated tool calls against the shared map state. Deliberately
 * independent of which agent produced them, so the map behaviour is identical
 * for the mock and for the real model.
 */
export function executeToolCalls(
  calls: AgentToolCall[],
  context: ExecuteContext,
): ExecutionResult {
  const chips: string[] = [];
  const sources: SoqlSource[] = [];
  const rows: QueryRow[] = [];

  for (const call of calls) {
    if (call.name === "query_data") {
      if (call.args.soql) {
        sources.push({
          label: "SoQL from the model",
          query: call.args.soql,
        });
        continue;
      }
      const outcome = runStructuredQuery(call.args, {
        noise: context.noise,
        crashes: context.crashes,
        boundaries: context.boundaries,
      });
      sources.push(outcome.source);
      rows.push(...outcome.rows);
      continue;
    }

    if (call.name === "set_layer") {
      context.setLayer(call.args.layer);
      chips.push(`Switched to ${LAYER_LABELS[call.args.layer]} layer`);
      continue;
    }

    if (call.name === "highlight") {
      const codes = call.args.nta_codes ?? call.args.cell_ids ?? [];
      context.setHighlights(codes);
      chips.push(
        codes.length === 1
          ? "Highlighted 1 area"
          : `Highlighted ${codes.length} areas`,
      );
      continue;
    }

    const { place, lat, lon, zoom, pitch } = call.args;
    if (typeof lat === "number" && typeof lon === "number") {
      context.flyTo({ lat, lon, zoom, pitch });
      chips.push(
        place ? `Flew to ${place}` : `Flew to ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      );
      continue;
    }
    if (place) {
      const borough = findBoroughCenter(place);
      const boundary = context.boundaries
        ? findBoundary(context.boundaries, place)
        : null;
      if (boundary) {
        context.flyTo({
          lat: boundary.center[1],
          lon: boundary.center[0],
          zoom: zoom ?? 13,
          pitch,
        });
        chips.push(`Flew to ${boundary.ntaName}`);
      } else if (borough) {
        context.flyTo({
          lat: borough.lat,
          lon: borough.lon,
          zoom: zoom ?? borough.zoom,
          pitch,
        });
        chips.push(`Flew to ${place}`);
      }
    }
  }

  return { chips, sources, rows };
}
