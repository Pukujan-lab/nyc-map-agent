import { z } from "zod";

/**
 * Mirrors `context/CHAT_TOOLS.md`. Every tool-call argument coming back from a
 * model is parsed through these schemas before anything acts on it.
 */

export const queryDataArgsSchema = z.object({
  dataset: z.enum(["noise", "crashes"]),
  filters: z
    .object({
      complaint_types: z.array(z.string()).optional(),
      descriptors: z.array(z.string()).optional(),
      borough: z.string().optional(),
      nta_codes: z.array(z.string()).optional(),
      months: z.array(z.string()).optional(),
      hours: z
        .tuple([
          z.number().int().min(0).max(23),
          z.number().int().min(0).max(23),
        ])
        .optional(),
      weekdays: z.array(z.number().int().min(0).max(6)).optional(),
      near: z
        .object({
          lat: z.number(),
          lon: z.number(),
          radius_km: z.number().positive(),
        })
        .optional(),
    })
    .optional(),
  group_by: z
    .enum([
      "nta",
      "borough",
      "intersection",
      "complaint_type",
      "descriptor",
      "contributing_factor",
    ])
    .optional(),
  metric: z
    .enum([
      "count",
      "injured",
      "killed",
      "cyclist_injured",
      "night_count",
      "weekend_night_count",
    ])
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /** A raw read-only SoQL string; surfaced verbatim as the answer's source. */
  soql: z.string().optional(),
});

export const flyToArgsSchema = z.object({
  place: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  zoom: z.number().min(1).max(20).optional(),
  pitch: z.number().min(0).max(85).optional(),
});

export const setLayerArgsSchema = z.object({
  layer: z.enum(["noise", "crashes", "combined"]),
  complaint_types: z.array(z.string()).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  hours: z.tuple([z.number(), z.number()]).optional(),
  weekdays: z.array(z.number()).optional(),
});

export const highlightArgsSchema = z.object({
  cell_ids: z.array(z.string()).optional(),
  nta_codes: z.array(z.string()).optional(),
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export const agentToolCallSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("query_data"), args: queryDataArgsSchema }),
  z.object({ name: z.literal("fly_to"), args: flyToArgsSchema }),
  z.object({ name: z.literal("set_layer"), args: setLayerArgsSchema }),
  z.object({ name: z.literal("highlight"), args: highlightArgsSchema }),
]);

export type QueryDataArgs = z.infer<typeof queryDataArgsSchema>;
export type FlyToArgs = z.infer<typeof flyToArgsSchema>;
export type SetLayerArgs = z.infer<typeof setLayerArgsSchema>;
export type HighlightArgs = z.infer<typeof highlightArgsSchema>;
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;

/** JSON-schema-shaped tool list handed to a model endpoint. */
export const TOOL_DEFINITIONS = [
  {
    name: "query_data",
    description:
      "Run a read-only query over the loaded noise/crash aggregates. Every number in an answer must come from this tool.",
    parameters: {
      type: "object",
      properties: {
        dataset: { enum: ["noise", "crashes"] },
        filters: { type: "object" },
        group_by: {
          enum: [
            "nta",
            "borough",
            "intersection",
            "complaint_type",
            "descriptor",
            "contributing_factor",
          ],
        },
        metric: {
          enum: [
            "count",
            "injured",
            "killed",
            "cyclist_injured",
            "night_count",
            "weekend_night_count",
          ],
        },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        soql: { type: "string" },
      },
      required: ["dataset"],
    },
  },
  {
    name: "fly_to",
    description: "Move the camera to a place, a coordinate, or a neighborhood.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string" },
        lat: { type: "number" },
        lon: { type: "number" },
        zoom: { type: "number" },
        pitch: { type: "number" },
      },
    },
  },
  {
    name: "set_layer",
    description: "Change what the map is showing.",
    parameters: {
      type: "object",
      properties: {
        layer: { enum: ["noise", "crashes", "combined"] },
        complaint_types: { type: "array", items: { type: "string" } },
        date_from: { type: "string" },
        date_to: { type: "string" },
        hours: { type: "array", items: { type: "number" } },
        weekdays: { type: "array", items: { type: "number" } },
      },
      required: ["layer"],
    },
  },
  {
    name: "highlight",
    description: "Outline specific neighborhoods on the map.",
    parameters: {
      type: "object",
      properties: {
        cell_ids: { type: "array", items: { type: "string" } },
        nta_codes: { type: "array", items: { type: "string" } },
        points: { type: "array" },
      },
    },
  },
] as const;
