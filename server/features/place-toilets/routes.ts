import { octoQuery } from "../../../api/_lib/octo";
import { fail, json } from "../../../api/_lib/http";
import type { PlaceToiletsResponse } from "./schema";

/**
 * GET /api/v1/place-toilets: restaurants, cafés, bars and shops with a toilet
 * (OpenStreetMap, refreshed nightly into core.place_toilets) as GeoJSON.
 * City-wide; about a thousand points, so the client filters by zoom.
 */
interface Row {
  id: string;
  name: string;
  kind: string;
  access: "anyone" | "customers";
  access_tagged: boolean;
  wheelchair: boolean | null;
  changing_table: boolean | null;
  fee: boolean | null;
  lon: number;
  lat: number;
  url: string;
}

export async function GET(): Promise<Response> {
  try {
    const { rows } = await octoQuery<Row>(
      "SELECT id, name, kind, access, access_tagged, wheelchair, changing_table, fee, lon, lat, url FROM core.place_toilets ORDER BY id",
      [],
      { rowLimit: 10000 },
    );
    const body: PlaceToiletsResponse = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature" as const,
        id: r.id,
        geometry: { type: "Point" as const, coordinates: [Number(r.lon), Number(r.lat)] as [number, number] },
        properties: {
          id: r.id,
          name: r.name,
          kind: r.kind,
          access: r.access,
          accessTagged: r.access_tagged,
          wheelchair: r.wheelchair,
          changingTable: r.changing_table,
          fee: r.fee,
          source: "openstreetmap" as const,
          url: r.url,
        },
      })),
    };
    return json(body, { maxAge: 3600, browserMaxAge: 900 });
  } catch (err) {
    return fail(err);
  }
}
