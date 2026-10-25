import { MAX_MESSAGES } from "./schema";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * The part of a long conversation sent with the next question. The server
 * refuses more than MAX_MESSAGES, so a long chat used to fail after about 15
 * exchanges. This keeps the latest ones, starting on a question so the model
 * never sees an answer without what it answered.
 */
export function recentTurns<T extends Turn>(history: readonly T[], max = MAX_MESSAGES): Turn[] {
  let start = Math.max(0, history.length - max);
  while (start < history.length - 1 && history[start].role !== "user") start++;
  return history.slice(start).map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}
