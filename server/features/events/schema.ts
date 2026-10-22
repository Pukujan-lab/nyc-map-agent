import { z } from "@hono/zod-openapi";

/**
 * Shapes for the Events layer: the two NYC Open Data payloads we read, the
 * normalised event we store in core.street_events, and the /api/events query and
 * response. Source payloads are parsed with zod at ingest so a renamed column
 * fails loudly instead of landing nulls.
 */

/** NYC Permitted Event Information (Socrata tvpp-9vvx; same columns as the historical bkfu-528j). */
export const PermittedEventRow = z.object({
  event_id: z.string(),
  event_name: z.string(),
  start_date_time: z.string(),
  end_date_time: z.string(),
  event_agency: z.string(),
  event_type: z.string(),
  event_borough: z.string(),
  event_location: z.string(),
  event_street_side: z.string().optional(),
  street_closure_type: z.string().optional(),
  community_board: z.string().optional(),
  police_precinct: z.string().optional(),
  cemsid: z.string().optional(),
});
export type PermittedEventRow = z.infer<typeof PermittedEventRow>;

/** NYC Parks Public Events – Upcoming 14 Days (Socrata w3wp-dpdi). */
export const ParksEventRow = z.object({
  guid: z.string(),
  title: z.string(),
  link: z.object({ url: z.string() }).optional(),
  description: z.string().optional(),
  parknames: z.string().optional(),
  location: z.string().optional(),
  starttime: z.string().optional(),
  endtime: z.string().optional(),
  categories: z.string().optional(),
  /** "lat, lon", or several joined by "; ". */
  coordinates: z.string().optional(),
});
export type ParksEventRow = z.infer<typeof ParksEventRow>;

const EVENT_KINDS = ["fair", "market", "popup", "show", "parks", "closure", "other"] as const;
export const EventKind = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKind>;

const Position = z.tuple([z.number(), z.number()]);
export const EventGeometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: Position }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(Position).min(2) }),
]);
export type EventGeometry = z.infer<typeof EventGeometry>;

const EventSource = z.enum(["nyc-permitted-events", "nyc-parks-events"]);

/** One normalised event, as stored in core.street_events and served by /api/events. */
export const Event = z
  .object({
    id: z.string(),
    title: z.string(),
    kind: EventKind,
    start: z.string().openapi({ description: "ISO 8601 with New York offset" }),
    end: z.string(),
    location: EventGeometry,
    address: z.string().nullable(),
    source: EventSource,
    url: z.string().nullable(),
  })
  .openapi("Event");
export type Event = z.infer<typeof Event>;

const kindList = z
  .string()
  .max(200)
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(EventKind))
  .optional()
  .openapi({ description: "Comma-separated kinds", example: "fair,market" });

const bbox = z
  .string()
  .max(120)
  .transform((s) => s.split(",").map(Number))
  .pipe(
    z
      .tuple([z.number().min(-75.5).max(-72.5), z.number().min(39).max(42), z.number().min(-75.5).max(-72.5), z.number().min(39).max(42)])
      .refine(([w, s, e, n]) => w < e && s < n, "bbox must be west,south,east,north"),
  )
  .optional()
  .openapi({ description: "west,south,east,north", example: "-74.02,40.70,-73.93,40.80" });

export const Query = z.object({
  bbox,
  from: z.string().datetime({ offset: true }).optional().openapi({ description: "Default: now" }),
  to: z.string().datetime({ offset: true }).optional().openapi({ description: "Default: 7 days after from" }),
  kind: kindList,
});
export type Query = z.infer<typeof Query>;

export const EventsResponse = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(
      z.object({
        type: z.literal("Feature"),
        id: z.string(),
        geometry: EventGeometry,
        properties: Event.omit({ location: true }),
      }),
    ),
  })
  .openapi("EventsResponse");
export type EventsResponse = z.infer<typeof EventsResponse>;
