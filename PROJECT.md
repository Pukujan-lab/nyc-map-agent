# NYC Map Agent: project

*Realigned 2026-10-23 with the owner. This replaces the pitch in `README.md` and `context/BRIEF.md`, which still describe the original noise-and-crash app. Where a line says "not built" or "not checked", that is the state of the repo on that date.*

## What it is
An **accessible AI agent that takes care of a regular person getting around New York**. You talk to it (chat or voice, in many languages) and it answers by **showing the answer on a clean map**, not by describing it. The map is the canvas; the agent is the product.

The goal is *not* a dashboard. The technical dashboards and in-depth controls stay, but for technical users, tucked away behind advanced mode.

## The problem we are solving
*Added 2026-10-24 from the owner. These describe the person the app is for; none of the fixes below is claimed as built unless `docs/ROADMAP.md` says so.*

The person we have most in mind is **an adult who is new to New York and not comfortable with apps: often middle-aged or older, often an immigrant, and not always fluent in English.** For them, getting around the subway is stressful, and the tools meant to help do not.

- **MTA notices are unreadable.** They are written for people who already know the system. Which stop is skipped, where the substitute bus boards, where it goes and how to get back to the train are not clear from the notice.
- **You cannot predict your trip.** MTA disruption notices read like cryptic codes, so it is hard to know how long a trip will take or how to get somewhere on a given day. The agent reads the disruptions for you and simulates the trip on the map, for a trip you are on now or one in the future, played back at 2x to 30x. It also shows the weather to expect along the way, so you see what you will face beforehand, at home and calm, not for the first time on a crowded platform. If you pick another route, the simulation restarts on it.
- **There is often no one to ask.** Station agents are not at every station, and in a crowded station they are hard to find even when they are there.
- **Finding a restroom is extremely stressful.** Public restrooms are rare and hard to find, and many in stations are closed or not marked. Needing one urgently, in a city you do not know, possibly with a child or in a language you do not read well, is when people panic. The answer must be the nearest open one, drawn on the map with the walking route, in one tap.
- **Maps are hard to read for an accurate location.** A standard map is dense with labels, and people who do not use maps daily struggle to match it to what they see. Landmarks and stops are small or missing, so "I am here, the stop is there" is unclear. The map must be plain, keep recognizable landmarks always visible, and mark the exact stop or entrance clearly.
- **Crowds make it worse.** With many people, noise and a train to catch, a confusing screen becomes stress, and people stop trying.
- **Google Maps cannot tell where you are inside a station.** It does not separate the platform from the mezzanine or the street above, so "you are here" can be wrong by a whole floor.
- **Maps behave strangely around losing signal.** Before the signal drops and after it returns, the blue dot jumps, and the map does not recalibrate which way you face.
- **After surfacing, you do not know which exit to take**, so you come up on the wrong corner and walk the wrong way.

What the agent does about it: it is the agent that is always available, by chat or by voice in the person's own language; it says in plain words what a notice means and draws it on the map; it asks whether you are underground instead of guessing; it helps you pick the exit and your facing; and it shows only what matters right now. The same design serves everyone else: a person who can use it without learning anything can be anyone.

Not yet true (`docs/ROADMAP.md`): the nearest-restroom flow exists in an open pull request (#350) but has not been run end to end; underground and exit help is not built, many-language chat and voice is not checked, and substitute-bus routes with where to board are missing.

## Who it is for
Three kinds of people, in this order of priority:

1. **The newcomer.** Someone visiting New York, or new to the city, or opening the app for the first time, including adults who are not comfortable with apps and may not read English well (see "The problem we are solving"). They must get started immediately: no setup, no learning the map. The home screen shows the chat and four task buttons (Restroom, My train, Plan trip, Find exit), and one tap or one spoken question gets a useful answer.
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
