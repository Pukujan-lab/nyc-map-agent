import { formatDate } from "@/lib/format";
import type { RestroomInfo } from "./layers";

/** The card's source line: "OpenStreetMap, updated Oct 3, 2026", or the city list noting any OSM-filled details. */
export function restroomSourceLine(r: Pick<RestroomInfo, "source" | "asOf" | "filledFromOsm">): string {
  const when = r.asOf ? `, updated ${formatDate(r.asOf)}` : "";
  if (r.source === "openstreetmap") return `OpenStreetMap${when}`;
  const filled = r.filledFromOsm?.length ? " · some details from OpenStreetMap" : "";
  return `NYC Open Data · Public Restrooms${when}${filled}`;
}

const yesNo = (v: boolean | null | undefined): string | null => (v === true ? "Yes" : v === false ? "No" : null);

/** Detail rows shown on the card, in order; empty values are dropped by the card. */
export function restroomRows(r: RestroomInfo): Array<[string, string | null]> {
  return [
    ["Hours", r.hours],
    ["Accessibility", r.accessibility],
    ["Status", r.status],
    ["Operator", r.operator],
    ["Fee", r.fee === true ? "Yes" : r.fee === false ? "Free" : null],
    ["Changing table", yesNo(r.changingTable)],
    ["Unisex", yesNo(r.unisex)],
  ];
}
