# NYC Map Agent: project

*Realigned 2026-10-23 with the owner. This replaces the pitch in `README.md` and `context/BRIEF.md`, which still describe the original noise-and-crash app. Where a line says "not built" or "not checked", that is the state of the repo on that date.*

## What it is
An **accessible AI agent that takes care of a regular person getting around New York**. You talk to it (chat or voice, in many languages) and it answers by **showing the answer on a clean map**, not by describing it. The map is the canvas; the agent is the product.

The goal is *not* a dashboard. The technical dashboards and in-depth controls stay, but for technical users, tucked away behind advanced mode.

## Who it is for
Three kinds of people, in this order of priority:

1. **The newcomer.** Someone visiting New York, or opening the app for the first time. They must get started immediately: no setup, no learning the map. The home screen shows the chat and four task buttons (Restroom, My train, Plan trip, Find exit), and one tap or one spoken question gets a useful answer.
2. **The daily explorer.** Anyone who comes back to the app again and again, local or visitor, to get around and get things done: their train, their usual trips, a restroom on the way, what's nearby. They get a deeper "My day" dashboard built from their own habits: their usual trains and buses and any station issues on them, trips they have looked up, and weather only when it affects their plans. The app never suggests food, cafés, shops or other things to do unless the person asks. Updates appear inside the app only, never as push notifications, and only when they concern that person today.
3. **The technical user.** People looking for data about the city: noise, crashes, 311, neighbourhood comparisons. They get the dashboards, data layers (noise complaints, crashes, research data) and detailed controls, but deeper inside filters, "More layers" and settings, so the first two groups never trip over them. Above all, the interface stays clean enough for anyone to use.

Design rule that follows: the first screen serves the newcomer, repeated use serves the daily explorer, and depth is opt-in for the technical user.

## The feel
Being looked after. The app notices what you are doing (on a train, underground, walking, driving), shows only what matters for that, and warns you before you ask.

## Primary jobs, in the owner's order
1. **Plan and simulate trips.** "Tomorrow at 9 am, from here to here": the conditions you will face (delays, planned work, weather, traffic if you drive), your options, played back at 2x, 5x, 10x or 30x. Choosing an alternative stops and restarts the simulation on the new route.
2. **Find restrooms nearby.** Extremely important. Nearest first, with options and directions.
3. **Guide you with landmarks.** Landmarks stay visible so you always know where you still are.
4. **Underground and exits.** No signal in stations; on surfacing, maps lose which way you face; after losing connection you do not know which exit to take. The app should ask whether you are underground, help you choose the exit, and recalibrate your facing (Live View style).
5. **Make MTA trouble readable.** Show on the map which station has a problem, which stops are skipped, which substitute buses connect and where to board them, where they lead, where to get the train back, which station lets you switch direction, which train to take instead, and tell you when a train is stuck and exactly where.
6. **Weather and traffic, shown.** Rain or snow drawn in street view with how much, what to be aware of, and traffic on the roads you will drive.

## Secondary
Questions about a place from the data: noise level of a neighbourhood from 311 complaints, how it changed over the years, what people complain about, how authorities respond, and how it compares with the borough and the city average; accidents on a street; a child's school route and which streets on it have crashes. Always shown on the map, never only told.

## Third
Virtual travel through NYC to find businesses and food and where they are, especially knowing exactly which street a shop or restaurant is on (the owner also counts this as a secondary goal).

## Principles
- **Show, do not tell.** Every answer carries buttons that draw it on the map.
- **Clean by default.** Only what matters right now; landmarks always.
- **The map stays visible.** Everything else opens from a button as a dropdown or drawer, one at a time, and closes back to the map. No full screens of text. The one exception is the technical user's analytics (311 complaints, crashes, research data), which can open as a focused dashboard on request.
- **A simple, fast map by default.** Plain block shapes and only what answers the question; the detailed 3D city is an optional module, off by default.
- **Top view is a flat 2D map.** 3D belongs to tilted and street-level views.
- **Fast and cheap to run.** Few backend calls; the server syncs upstream feeds, clients read from our server.
- **Always answer.** The agent has fallback models, rate limits against abuse, and tells you (and says aloud) when something is slow.
- **Remembers you, on your terms.** The app learns your daily pattern and the agent remembers earlier conversations, kept on your phone by default. The agent receives only short summaries a question needs, never full history or exact coordinates. A "What we remember" screen lets people see, pause or delete each kind of memory, or delete everything, and links to the plain-language data policy (`docs/PRIVACY.md`, draft in #384).
- **No unasked recommendations.** Businesses, food and things to do appear only when someone asks for them.
- **Never make up numbers.** Every figure comes from a data query, and the app shows each dataset's limits (311 counts are what people reported; crash data runs months behind).

## Where to read next
- `docs/ROADMAP.md`: priorities, known problems, and what exists versus what is missing.
- `docs/PERFORMANCE.md`: speed, first load, network calls, and abuse and LLM fair-use limits.
- `docs/ARCHITECTURE.md`: how the code is organised, plus the agent-first target.
- `context/CHAT_TOOLS.md`, `context/AI_VOICE.md`: how the agent calls tools and listens today.
