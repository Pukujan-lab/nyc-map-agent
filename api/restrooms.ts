import { octoQuery } from "./_lib/octo";
import { fail, json } from "./_lib/http";

/** GET /api/restrooms: public restrooms from core.restrooms as a GeoJSON FeatureCollection. */
export async function GET(): Promise<Response> {
  try {
    const { rows } = await octoQuery<Record<string, string | number | null>>(
      "SELECT name, status, hours, accessibility, operator, location_type, lat, lon FROM core.restrooms ORDER BY name",
      [],
      { rowLimit: 5000 },
    );
    return json(
      {
        type: "FeatureCollection",
        features: rows.map(({ lat, lon, ...properties }) => ({
          type: "Feature",
          properties,
          geometry: { type: "Point", coordinates: [Number(lon), Number(lat)] },
        })),
      },
      { maxAge: 3600 },
    );
  } catch (err) {
    return fail(err);
  }
}
