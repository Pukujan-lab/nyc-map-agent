# Design rules

*The owner's standing preferences for how the app looks and behaves, agreed 2026-10-23 and 2026-10-24. Read this before changing anything people see. `PROJECT.md` says what the app is for; this file says how it should feel. The agreed screens are on the design canvas (private to the owner). The chat agent's own rules live in `server/features/agent/prompt.ts`.*

## The map is always there
- The map stays visible on every screen. No full screens of text, and no full-screen lists.
- Everything else opens from a button, as a dropdown or a drawer. Only one is open at a time, it is the single focus while open, and closing it returns to the map.
- A trigger button is an icon plus a short label plus a small arrow. The dropdown it opens is a small dashboard: sections with an icon and a label, all folded except one.
- **Top left is one swipeable menu row** of at most 6 or 7 menus, in this order: My day, Layers, Filters, Data (what we remember, lock icon), City data (311 and crash analytics), Settings. It loops round. Rarer things go inside Settings. The open one is always leftmost, with its icon and label in a pill; the rest follow to its right as icons on small dark discs with no outline (so they read on light and dark maps), each smaller and fainter, and the row fades out at its right edge so you can tell it scrolls. Swipe sideways for more, so every menu opens from there and the screen stays clean.
- The one exception is the technical user's analytics (311 complaints, crashes, research data). That can open as a focused dashboard, and only when they ask for it.
- Panels float, translucent with a blur, so the map shows through.

## Few words
- Minimal text and no tooltips. If a button needs a tooltip, change the icon or the label.
- Show, do not tell: an answer comes with a button that draws it on the map.
- Data sources sit behind a small "i", not in the answer.

## Fixed parts of the screen
- **The chat bar is never hidden.** Left to right: text box, a small grey microphone (dictation), a big blue waveform button (hands-free conversation).
- **Quick bar, top right, icons only:** Change view (one dropdown for Top, Aerial, Closer and Street), a north/compass button that appears only when the map is rotated or tilted, and Center on my location.
- **Layers** lives in the menu row and opens a small panel: Live trains, Live buses, Restrooms, then "More layers". Technical layers (noise, crashes, research data) live under More layers.
- **Home's four task buttons:** Restroom, My train, Plan trip, Find exit.
- **Answer card:** "Walk me there" first, then "What's nearby" and "Other options".

## Trains, buses and lines on the map
- Every train or bus drawn on the map carries its line bullet (for example the round orange F), so nobody has to guess which train it is.
- Every notice is clickable. Tapping it shows, on the map, the station where the problem is, which stations and lines it affects and how (delayed, skipped, rerouted), since when and until when.
- An alternative ("Take the C instead") is clickable too: it shows where to transfer, which platform, and the new arrival time on the map.
- Tapping a line shows which line it is and its station names, and opens the line panel with its notices.
- Trains move smoothly between updates. Their path along the track is worked out in advance from the timetable shapes and arrival predictions, and the live feed is synced every 30 seconds to correct it. A train never jumps backwards (`src/features/transit/model.ts`, `dwell.ts`, `monotonic.ts`).
- Trains are drawn as simple boxes; the detailed 3D city is optional and off by default. The Top view is a flat 2D map.

## Guidance
- Walking checkpoints use landmarks or big stores, with a photo, never street signs.
- Restrooms use a real restroom icon, never "WC".
- Weather is shown in street view, not only described.

## What the app offers without being asked
- Never suggest food, cafés, shops, events or other things to do unless the person asks.
- Unasked help is limited to their own trip: delays, planned work, skipped stops, elevator outages, weather that affects the trip.
- Never tell people how to manage their time ("leave 8 min later"). Show the facts; they plan their own day.
- Updates appear inside the app only. No push notifications.

## Memory and data
- What the app learns (daily rides, Home and Work, past conversations, trips looked up) stays on the phone by default.
- The agent gets only a short summary that a question needs, never full history or exact coordinates unless the person shares their location.
- "What we remember" lets people see, pause or delete each kind of memory, or everything, and links to the data policy (`docs/PRIVACY.md`, draft in #384).
