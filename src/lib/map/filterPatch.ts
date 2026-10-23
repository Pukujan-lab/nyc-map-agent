import { z } from "zod";

/**
 * A partial change to the map's filters. Absent fields stay as they are.
 * `liveBuses: true` only asks the client to open the line picker.
 * Lives in core so the map can apply it without importing the agent feature.
 */
export const filterPatch = z.object({
  roads: z.boolean().optional().describe("false hides road paint and road names"),
  busStops: z.boolean().optional().describe("false hides bus stop icons"),
  streetNames: z.boolean().optional(),
  buildings: z.enum(["flat", "3d"]).optional(),
  streets: z.enum(["simple", "full"]).optional().describe("simple is the pale street style; full is detailed"),
  stationsOnly: z.boolean().optional().describe("true hides live vehicles and keeps stations"),
  routes: z.array(z.string().max(3)).max(24).optional().describe("Subway lines to emphasize, such as [\"L\"]. An empty list shows every line."),
  businesses: z.boolean().optional(),
  streetArt: z.boolean().optional(),
  xray: z.boolean().optional().describe("underground trains near the camera"),
  health: z.boolean().optional(),
  parksPlaces: z.boolean().optional(),
  citibike: z.boolean().optional(),
  restrooms: z.boolean().optional(),
  transitFocus: z.boolean().optional().describe("dims the basemap so transit stands out"),
  eco: z.boolean().optional().describe("lighter drawing for a slow device"),
  texturedCity: z.boolean().optional().describe("textured 3D buildings"),
  events: z.boolean().optional(),
  parking: z.boolean().optional(),
  traffic: z.boolean().optional(),
  weather: z.boolean().optional(),
  ferry: z.boolean().optional(),
  liveTrains: z.boolean().optional(),
  liveBuses: z.boolean().optional().describe("true opens the bus line picker; false hides live buses. Never turn on every bus."),
  theme: z.enum(["auto", "ivory", "ink", "mta", "neon"]).optional(),
  places: z.array(z.string().max(40)).max(30).optional().describe("Basemap place ids to show, replacing the current set: food.restaurant, food.fast, food.bar, food.bakery, food.icecream, coffee.cafe, todo.museum, todo.shows, todo.sights, todo.library, todo.sport, shop.grocery, shop.clothes, shop.books, shop.other, parks.park, parks.play, parks.dog, health.care, citibike.dock. An empty list hides them."),
});
export type FilterPatch = z.infer<typeof filterPatch>;
