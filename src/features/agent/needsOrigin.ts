import { tr } from "@/lib/i18n/appLang";
import { APP_LANGS } from "@/lib/voice/langPref";

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
  if (/use my location|my location|starting address|where you(?:'| a)?re starting|where are you starting/i.test(text)) return true;
  // A reply in another language names the button in that language, or says "my location" its own way.
  const t = text.toLowerCase();
  return APP_LANGS.some((l) => t.includes(tr(l, "useMyLocation").toLowerCase())) || OTHER_MY_LOCATION.some((w) => t.includes(w));
}

/** "My location" in the app's other languages, for replies that don't quote the button word for word. */
const OTHER_MY_LOCATION = ["mi ubicación", "ma position", "местоположени", "我的位置", "내 위치", "আমার অবস্থান", "pozisyon mwen"];
