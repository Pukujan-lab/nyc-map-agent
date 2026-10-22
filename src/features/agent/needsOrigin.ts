/** Shown under the reply, with the Use my location button, when a trip starts from here. */
export const ORIGIN_PROMPT = "I need your location to plan this from here. Tap Use my location, or type a starting address.";

/**
 * The question uses the person's own position as the start ("from here"),
 * so the trip cannot be planned until they share their location.
 */
export function needsSharedOrigin(text: string): boolean {
  return /\bhere\b|\bmy (current )?location\b|\bwhere i am\b|\bmy place\b/i.test(text);
}

/** The assistant asked them to share a start, so the reply should carry the button. */
export function replyAsksForOrigin(text: string): boolean {
  return /use my location|my location|starting address|where you(?:'| a)?re starting|where are you starting/i.test(text);
}
