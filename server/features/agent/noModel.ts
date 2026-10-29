/**
 * Answers that need no language model (#199): when the daily budget is spent
 * or the model fails before saying anything, the two questions people ask most
 * in a hurry still get a real answer from the app's own feeds. Each one runs
 * the same tool the model would call, so the buttons under the answer match.
 * Anything else gets null and the caller keeps its usual message.
 */
import { hoursToday } from "./hours";
import type { makeTools } from "./tools";

type Tools = ReturnType<typeof makeTools>;
type Question = { text: string; hasLocation: boolean; now?: Date };

// Also the words the Restroom button asks with in the app's other languages (French, Haitian Creole,
// Russian, Chinese, Korean, Bengali); \b does not work next to those scripts, so they match on their own.
const RESTROOM = /\b(rest ?rooms?|bathrooms?|toilets?|toilettes?|washrooms?|loos?|wc|baños?|banos?|servicios|sanitarios?|aseos?|twal[eè]t)\b|туалет|厕所|洗手间|화장실|টয়লেট/i;
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

// Words a plain "where's the nearest restroom" or "is the 7 running" question is made of. A question
// with any other word in it (a place, "on the way", "with a stroller") goes to the model.
const RESTROOM_WORD = /^(rest ?rooms?|bathrooms?|toilets?|washrooms?)$/;
const RESTROOM_FILLER = new Set(["where", "wheres", "where's", "is", "are", "the", "a", "an", "nearest", "closest", "public", "open", "now", "right", "that", "thats", "that's", "near", "me", "nearby", "around", "here", "i", "need", "find", "any", "to", "go", "can", "use", "please", "one"]);
const ROUTE = /^([1-7]|[ABCDEFGJLMNQRWZ]|SIR)$/;
const LINE_FILLER = new Set(["how", "hows", "how's", "is", "are", "the", "train", "trains", "line", "subway", "running", "doing", "right", "now", "today", "there", "any", "delays", "delay", "on", "status", "of", "service", "whats", "what's", "with"]);

const words = (text: string) => text.replace(/[\u2018\u2019]/g, "'").replace(/[?!.,¿¡]/g, " ").split(/\s+/).filter(Boolean);

/**
 * A question the app answers on its own, before the model: plain English asks for the nearest
 * restroom or one subway line's status, like the home buttons send. Exact and narrow on purpose:
 * anything more goes to the model, which also answers in the asker's language.
 */
export function fastIntent(text: string): NoModelIntent | null {
  const w = words(text);
  if (!w.length || w.length > 14) return null;
  const lower = w.map((x) => x.toLowerCase());
  if (lower.some((x) => RESTROOM_WORD.test(x)) && lower.every((x) => RESTROOM_WORD.test(x) || RESTROOM_FILLER.has(x))) return { kind: "restroom" };
  // Letters count in capitals only, so "is there a delay" has no A train in it.
  const routes = w.filter((x) => ROUTE.test(x));
  if (routes.length === 1 && w.every((x, i) => ROUTE.test(x) || LINE_FILLER.has(lower[i]))) return { kind: "line", route: routes[0] };
  return null;
}

const call = { toolCallId: "no-model", messages: [] };
/** Runs a tool the way the model would, outside a model step. */
const run = <R>(t: { execute?: unknown }, input: unknown): Promise<R> =>
  (t.execute as (input: unknown, options: typeof call) => Promise<R>)(input, call);

type RestroomResult = { restrooms: Array<{ name: string; distanceM: number; openNow?: boolean | null; hours?: string | null }>; walkToNearest: { minutes: number } | null };
type LineResult = { trouble: Array<{ summary: string }>; alerts: unknown[]; note?: string };

/** The answer text, or null when the question is not one of these or the feed failed. */
export async function answerWithoutModel(q: Question, tools: Tools, intent: NoModelIntent | null = noModelIntent(q.text)): Promise<string | null> {
  if (!intent) return null;
  try {
    if (intent.kind === "restroom") {
      if (!q.hasLocation) return "To find the nearest public restroom, tap Use my location, or turn on Restrooms in the Layers menu to see them all on the map.";
      const r = await run<RestroomResult>(tools.nearest_restroom, { place: "here" });
      const first = r.restrooms[0];
      if (!first) return "I couldn't find an open public restroom nearby. Turn on Restrooms in the Layers menu to see them on the map.";
      const walk = r.walkToNearest ? `, about ${r.walkToNearest.minutes} min on foot` : `, about ${first.distanceM} m away`;
      // Today's hours only; the card under the answer has the whole week.
      const today = hoursToday(first.hours, q.now ?? new Date());
      const hours = today === "closed" ? " It is closed today." : today ? ` Open today ${today}.` : "";
      return `The nearest public restroom is ${first.name}${walk}.${hours} Tap the button below to see the way.`;
    }
    const r = await run<LineResult>(tools.line_status, { lines: [intent.route] });
    if (!r.trouble.length) return `The MTA lists no delays or changes on the ${intent.route} train right now.`;
    // The feed starts each notice with the line ("7: In Queens, …"); the question already named it.
    const lead = new RegExp(`^${intent.route}\\s*:\\s*`);
    const notes = [...new Set(r.trouble.map((t) => t.summary.replace(lead, "").trim()))].slice(0, 2);
    const more = r.trouble.length > notes.length ? " There's more on the map." : "";
    return `${notes.join(" ")}${more} The buttons below show it on the map.`;
  } catch {
    return null;
  }
}
