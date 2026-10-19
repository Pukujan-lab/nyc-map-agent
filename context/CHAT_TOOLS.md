# Chat actions

The chat answers only by calling these actions. Every number it says must come from `query_data`.

## Actions

### query_data
Runs a read-only query on the noise and crash data from F1. You can also send the same query straight to the Socrata API (see DATA_APIS.md).
- Input: `{ dataset: "noise" | "crashes", filters, group_by, metric, limit }`, or a raw read-only SQL or SoQL string
- Output: rows and the query that was run, so it can be shown as a source

### fly_to
Moves the camera.
- Input: `{ place?: string, lat?: number, lon?: number, zoom?: number, pitch?: number }`

### set_layer
Changes what the map shows.
- Input: `{ layer: "noise" | "crashes" | "combined", complaint_types?: string[], date_from?, date_to?, hours?: [start, end], weekdays?: number[] }`

### highlight
Outlines specific cells, streets, or neighborhoods.
- Input: `{ cell_ids?: string[], nta_codes?: string[], points?: [lat, lon][] }`

## Answer format
Keep answers short and lead with the number. Name the place and the time window, and offer a "show query" link to the source. After answering, call `fly_to`, `set_layer`, or `highlight` so the map matches.

## Five acceptance questions (F4)
1. Where is the loudest block in Bushwick on weekend nights (10pm to 4am)?
2. Which 5 neighborhoods had the most residential noise complaints in the last 12 months?
3. Which Brooklyn intersections have the most cyclist injuries?
4. What is the top crash cause in Manhattan, and how many crashes did it cause?
5. How many helicopter noise complaints were there near the Downtown Manhattan Heliport last summer?

For each one, check the answer against a direct API query from DATA_APIS.md.
