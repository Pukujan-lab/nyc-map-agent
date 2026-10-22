import { z } from "@hono/zod-openapi";

/**
 * Shapes for "shops & cafés with toilets": the Overpass element we read, the
 * normalised place stored in core.place_toilets, and the /api/v1/place-toilets
 * response. The Overpass payload is parsed with zod at ingest.
 */
export const OverpassElement = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: z.record(z.string()).default({}),
});
export type OverpassElement = z.infer<typeof OverpassElement>;
export const OverpassResponse = z.object({ elements: z.array(OverpassElement) });

export const ToiletAccess = z.enum(["anyone", "customers"]);
export type ToiletAccess = z.infer<typeof ToiletAccess>;

export const PlaceToilet = z
  .object({
    id: z.string().openapi({ example: "osm:node/123" }),
    name: z.string(),
    kind: z.string().openapi({ description: "OSM amenity (restaurant, cafe, fast_food, bar, pub) or 'shop'" }),
    access: ToiletAccess.openapi({ description: "anyone = toilets:access yes|permissive|public; customers = customers or untagged" }),
    accessTagged: z.boolean().openapi({ description: "false when OSM has no toilets:access tag" }),
    wheelchair: z.boolean().nullable(),
    changingTable: z.boolean().nullable(),
    fee: z.boolean().nullable(),
    source: z.literal("openstreetmap"),
    url: z.string(),
  })
  .openapi("PlaceToilet");
export type PlaceToilet = z.infer<typeof PlaceToilet>;

export interface StoredPlaceToilet extends PlaceToilet {
  lon: number;
  lat: number;
}

export const PlaceToiletsResponse = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: z.string(),
        geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
        properties: PlaceToilet,
      }),
    ),
  })
  .openapi("PlaceToiletsResponse");
export type PlaceToiletsResponse = z.infer<typeof PlaceToiletsResponse>;
