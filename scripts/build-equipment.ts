/**
 * Builds public/transit/equipment.json: the MTA elevator and escalator list
 * (nyct_ene_equipments.json, the same feed the transit alerts route reads),
 * cut down to the units that reach the street, with the corner they name.
 * Static so the station exit view works offline; outages stay live.
 *
 *   pnpm build:equipment
 */
import { writeFileSync } from "node:fs";
import { parseCorner } from "../src/lib/transit/equipment";

const URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json";

type Row = Record<string, string | number | undefined>;

async function main() {
  const res = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`equipment list ${res.status}`);
  const rows = (await res.json()) as Row[];
  const units = rows
    .filter((r) => r.isactive === "Y")
    .map((r) => {
      const serving = String(r.serving ?? "");
      const c = parseCorner(serving);
      return c
        ? {
            id: String(r.equipmentno),
            type: r.equipmenttype === "EL" ? "EL" : "ES",
            stops: String(r.elevatorsgtfsstopid ?? "").split(/[/,; ]+/).filter(Boolean),
            serving,
            streets: c.streets,
            corner: c.corner,
          }
        : null;
    })
    .filter(Boolean);
  const out = { source: "MTA nyct_ene_equipments.json", builtAt: new Date().toISOString(), units };
  writeFileSync("public/transit/equipment.json", JSON.stringify(out));
  console.log(`equipment.json: ${units.length} street units of ${rows.length}`);
}

void main();
