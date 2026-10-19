# Features and acceptance checks

Build order: F1, F2, F4, F7, F3, F5, then F6. F2 and F4 are the demo. Cut F5 and F6 first if time is short.

## F1. Data layer
- Pull the last 12 months of 311 noise complaints and crashes, keeping only rows with coordinates.
- Group the points into map cells (hexagons or street segments) and into neighborhoods (NTA 2020).
- [ ] One query returns counts by cell and by neighborhood in under 1 second.
- [ ] The counts match a direct API count for the same filter (within 1%).

## F2. 3D map (main)
- Extruded columns on an OpenStreetMap basemap. Height is the incident count, and color is severity (crashes with injuries or deaths weigh more).
- A layer toggle switches between Noise, Crashes, and Combined. The camera starts tilted.
- [ ] All five boroughs load in 3D.
- [ ] The toggle switches layers.
- [ ] Hovering over a column shows its counts.

## F3. Click details
- Clicking a column or neighborhood opens a side panel with the top noise descriptors, the top crash contributing factors, injuries and deaths, and an hour-of-day chart.
- [ ] The numbers in the panel match F1 for the cell clicked.

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
