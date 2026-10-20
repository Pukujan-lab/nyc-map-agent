# Features and acceptance checks

Build order: F1, F2, F4, F7, F3, F5, then F6. F2 and F4 are the demo. Cut F5 and F6 first if time is short.

## F1. Data layer
- Pull the last 12 months of 311 noise complaints and crashes, keeping only rows with coordinates.
- Group the points into map cells (hexagons or street segments) and into neighborhoods (NTA 2020).
- [ ] One query returns counts by cell and by neighborhood in under 1 second.
- [ ] The counts match a direct API count for the same filter (within 1%).

## F2. Block map (main)
- Translucent glass volumes on an OpenStreetMap basemap, drawn by MapLibre's `fill-extrusion` layers: neighborhoods, or ~300 m blocks, in one neutral hue, with height as a square-root scale of the current layer's count and no colour ramp at all.
- Boundaries carry the legibility: a thin square around every ~300 m block (blocks scale only), a line around every neighborhood, and a heavier line around each borough, derived from the neighborhood polygons.
- The screen stays almost empty: one bottom dock holds the Noise / Crashes / Combined switch, the tilt button, settings, and chat. Scale, time window, neighborhood jump, zoom/reset, the map key and caveats live in the settings drawer; chat and details open as sheets.
- [ ] All five boroughs load flat, with the map key's height scale matching the volumes on screen.
- [ ] The tilt button pitches to 62°, drops to a zoom where buildings are visible, reads as pressed, and reset returns to flat north-up.
- [ ] Nothing but the dock is on screen at rest, at 375px wide and on desktop.
- [ ] The toggles switch layer and scale.
- [ ] Hovering over a neighborhood or a block shows its counts.

## F3. Click details
- Clicking a neighborhood or block opens a small card over the map: the headline count, the top house number (311 `incident_address`) or street (crash records), and buttons for more details, walking the block and street photos.
- "More details" opens the full panel with the top noise descriptors, the top crash contributing factors, the top addresses, injuries and deaths, and an hour-of-day chart; a clicked block also shows its share of the neighborhood.
- [ ] The numbers in the card and the panel match F1 for the area clicked.
- [ ] A single map click never covers the map with a full-height sheet.

## F4. AI chat (main)
- The chat answers using the actions in CHAT_TOOLS.md and never guesses numbers.
- [ ] The 5 example questions in CHAT_TOOLS.md each return a correct number.
- [ ] Each answer moves or filters the map to match.

## F5. Chat and map linked
- The chat's answers highlight the cells or streets they mention.
- Clicking a cell gives an "Ask about this block" option that adds that location to the chat.
- [ ] Both directions work in the demo.

## F6. Polish (stretch)
- A score card for a typed-in address (0 to 100, compared with its neighborhood).
- A time-of-day slider.
- A "Data caveats" panel.
- [ ] Each one works on 3 test addresses.

## F7. Voice (main)
Push-to-talk questions and spoken answers on top of the F4 chat. See AI_VOICE.md for the model, the key handling, and the acceptance checks.
