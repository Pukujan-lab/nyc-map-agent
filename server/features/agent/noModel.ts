/**
 * Answers that need no language model (#199): when the daily budget is spent
 * or the model fails before saying anything, the two questions people ask most
 * in a hurry still get a real answer from the app's own feeds. Each one runs
 * the same tool the model would call, so the buttons under the answer match.
 * Anything else gets null and the caller keeps its usual message.
 */
import type { makeTools } from "./tools";

type Tools = ReturnType<typeof makeTools>;
type Question = { text: string; hasLocation: boolean };

const RESTROOM = /\b(rest ?rooms?|bathrooms?|toilets?|washrooms?|loos?|wc|baños?|banos?|servicios|sanitarios?|aseos?)\b/i;
// "is the N running", "Q train delays", "the 7 line": the subway's own letters and numbers.
// Letters are matched in capitals only, so "take a train" is not the A.
const LINE = /\b(?:[Tt]he\s+)?([1-7]|[ABCDEFGJLMNQRWZ]|SIR)\s*(?:[Tt]rains?|[Ll]ines?|[Ss]ubway)\b|\b(?:[Ii]s|[Aa]re)\s+the\s+([1-7]|[ABCDEFGJLMNQRWZ])\b/;

export type NoModelIntent = { kind: "restroom" } | { kind: "line"; route: string };

export function noModelIntent(text: string): NoModelIntent | null {
  if (RESTROOM.test(text)) return { kind: "restroom" };
  const m = LINE.exec(text);
  const route = m?.[1] ?? m?.[2];
  return route ? { kind: "line", route: route.toUpperCase() } : null;
}

const call = { toolCallId: "no-model", messages: [] };
/** Runs a tool the way the model would, outside a model step. */
const run = <R>(t: { execute?: unknown }, input: unknown): Promise<R> =>
  (t.execute as (input: unknown, options: typeof call) => Promise<R>)(input, call);

type RestroomResult = { restrooms: Array<{ name: string; distanceM: number; openNow?: boolean | null; hours?: string | null }>; walkToNearest: { minutes: number } | null };
type LineResult = { trouble: Array<{ summary: string }>; alerts: unknown[]; note?: string };

/** The answer text, or null when the question is not one of these or the feed failed. */
export async function answerWithoutModel(q: Question, tools: Tools): Promise<string | null> {
  const intent = noModelIntent(q.text);
  if (!intent) return null;
  try {
    if (intent.kind === "restroom") {
      if (!q.hasLocation) return "To find the nearest public restroom, tap Use my location, or turn on Restrooms in the Layers menu to see them all on the map.";
      const r = await run<RestroomResult>(tools.nearest_restroom, { place: "here" });
      const first = r.restrooms[0];
      if (!first) return "I couldn't find an open public restroom nearby. Turn on Restrooms in the Layers menu to see them on the map.";
      const walk = r.walkToNearest ? `, about ${r.walkToNearest.minutes} min on foot` : `, about ${first.distanceM} m away`;
      const hours = first.hours ? ` Hours: ${first.hours}.` : "";
      return `The nearest public restroom is ${first.name}${walk}.${hours} Tap the button below to see the way.`;
    }
    const r = await run<LineResult>(tools.line_status, { lines: [intent.route] });
    if (!r.trouble.length) return `The MTA lists no delays or changes on the ${intent.route} train right now.`;
    return `${r.trouble.slice(0, 3).map((t) => t.summary).join(" ")} The button below shows it on the map.`;
  } catch {
    return null;
  }
}
