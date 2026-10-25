import { z } from "@hono/zod-openapi";

/**
 * /api/restrooms: the city's public restrooms (NYC Open Data i7jb-7jku) merged
 * with OpenStreetMap public toilets. A city restroom and an OSM toilet within
 * about 40 m are one place (merge.ts): city fields win, OSM fills the gaps.
 */
export const RestroomSource = z.enum(["nyc-open-data", "openstreetmap"]);
export type RestroomSource = z.infer<typeof RestroomSource>;

export const Restroom = z
  .object({
    id: z.string().openapi({ example: "osm:node/322546340" }),
    name: z.string(),
    source: RestroomSource.openapi({ description: "Where the record comes from; a merged place keeps nyc-open-data" }),
    asOf: z.string().nullable().openapi({ description: "When the source last updated this record (ISO); city rows carry the dataset's row update time, OSM the last edit" }),
    status: z.string().nullable(),
    hours: z.string().nullable(),
    accessibility: z.string().nullable(),
    operator: z.string().nullable(),
    location_type: z.string().nullable(),
    fee: z.boolean().nullable(),
    changingTable: z.boolean().nullable(),
    unisex: z.boolean().nullable(),
    osmId: z.string().nullable().openapi({ description: "The matched or source OpenStreetMap element" }),
    osmUrl: z.string().nullable(),
    filledFromOsm: z.array(z.string()).openapi({ description: "City fields that were empty and were filled from the matched OSM toilet" }),
  })
  .openapi("Restroom");
export type Restroom = z.infer<typeof Restroom>;

export const RestroomsResponse = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: z.string(),
        geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
        properties: Restroom,
      }),
    ),
    sources: z.array(z.object({ id: RestroomSource, asOf: z.string().nullable(), count: z.number() })),
  })
  .openapi("RestroomsResponse");
export type RestroomsResponse = z.infer<typeof RestroomsResponse>;
