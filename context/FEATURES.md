# Features and acceptance checks

Build order: F1, F2, F4, F7, F3, F5, then F6. F2 and F4 are the demo. Cut F5 and F6 first if time is short.

## F1. Data layer
- Pull the last 12 months of 311 noise complaints and crashes, keeping only rows with coordinates.
- Group the points into map cells (hexagons or street segments) and into neighborhoods (NTA 2020).
- [ ] One query returns counts by cell and by neighborhood in under 1 second.
- [ ] The counts match a direct API count for the same filter (within 1%).

## F2. Block map (main)
- Colored columns on an OpenStreetMap basemap, drawn by MapLibre's `fill-extrusion` layers: neighborhoods, or ~300 m blocks, colored in four bands (blue → green → yellow → red) cut at the quartiles of the current layer's counts, with height as a square-root scale of the same value.
- The screen stays almost empty: one bottom dock holds the legend, the Noise / Crashes / Combined switch, the tilt button, settings, and chat. Scale, time window, neighborhood jump, zoom and reset live in the settings drawer; chat and details open as sheets.
- [ ] All five boroughs load flat, with the legend's four ranges matching the colors on screen.
- [ ] The tilt button pitches to 62°, drops to a zoom where buildings are visible, reads as pressed, and reset returns to flat north-up.
- [ ] Nothing but the dock is on screen at rest, at 375px wide and on desktop.
- [ ] The toggles switch layer and scale.
- [ ] Hovering over a neighborhood or a block shows its counts.

## F3. Click details
- Clicking a neighborhood or block opens a side panel with the top noise descriptors, the top crash contributing factors, injuries and deaths, and an hour-of-day chart; a clicked block also shows its share of the neighborhood.
- [ ] The numbers in the panel match F1 for the area clicked.

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
