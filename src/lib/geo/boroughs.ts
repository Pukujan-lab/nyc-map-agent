import type { FeatureCollection, MultiLineString, Position } from "geojson";
import type { NtaBoundary } from "@/lib/api/nta";

/**
 * Borough outlines, derived from the neighborhood boundaries we already have.
 *
 * Each borough is drawn as the boundary of the *union* of its neighborhoods:
 * an edge that two neighborhoods of the same borough share is interior, so it
 * is counted twice and dropped; an edge that appears once is on the borough's
 * outline — either its border with another borough or the coastline. That is a
 * real county boundary without a second dataset, a turf dependency or a polygon
 * union: the line layer only needs the surviving segments.
 */

export interface BoroughProperties {
  borough: string;
}

/** ~1 m of resolution, so vertices shared by two rings match exactly. */
const COORD_DIGITS = 5;

function coordKey(point: Position): string {
  const factor = 10 ** COORD_DIGITS;
  return `${Math.round(point[0] * factor)},${Math.round(point[1] * factor)}`;
}

interface Edge {
  count: number;
  from: Position;
  to: Position;
}

export function boroughOutlinesToGeoJson(
  boundaries: NtaBoundary[],
): FeatureCollection<MultiLineString, BoroughProperties> {
  const edgesByBorough = new Map<string, Map<string, Edge>>();

  for (const boundary of boundaries) {
    let edges = edgesByBorough.get(boundary.borough);
    if (!edges) {
      edges = new Map<string, Edge>();
      edgesByBorough.set(boundary.borough, edges);
    }
    for (const polygon of boundary.polygons) {
      for (const ring of polygon) {
        for (let i = 1; i < ring.length; i += 1) {
          const from = ring[i - 1];
          const to = ring[i];
          const fromKey = coordKey(from);
          const toKey = coordKey(to);
          if (fromKey === toKey) continue;
          // Direction-insensitive: neighbors list a shared edge opposite ways.
          const edgeKey =
            fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
          const existing = edges.get(edgeKey);
          if (existing) {
            existing.count += 1;
          } else {
            edges.set(edgeKey, {
              count: 1,
              from: [from[0], from[1]],
              to: [to[0], to[1]],
            });
          }
        }
      }
    }
  }

  const features: FeatureCollection<
    MultiLineString,
    BoroughProperties
  >["features"] = [];

  for (const [borough, edges] of edgesByBorough) {
    const coordinates: Position[][] = [];
    for (const edge of edges.values()) {
      if (edge.count !== 1) continue;
      coordinates.push([edge.from, edge.to]);
    }
    if (coordinates.length === 0) continue;
    features.push({
      type: "Feature",
      properties: { borough },
      geometry: { type: "MultiLineString", coordinates },
    });
  }

  features.sort((a, b) => a.properties.borough.localeCompare(b.properties.borough));
  return { type: "FeatureCollection", features };
}
