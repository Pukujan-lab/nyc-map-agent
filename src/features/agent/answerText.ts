/**
 * The model sometimes writes a reply, calls a tool, then writes the reply
 * again ("No sé desde dónde me escribes… No sé desde dónde buscas…"), and the
 * two pieces arrived glued together with no space. Each piece written between
 * tool calls is kept on its own; one that the next piece restates (the same
 * first three words) is dropped, and the rest are set apart as paragraphs.
 */
export function joinSegments(segments: readonly string[]): string {
  const kept = segments.map((s) => s.trim()).filter((s, i, all) => s && !restates(all[i + 1], s));
  return kept.join("\n\n");
}

const opening = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");

function restates(next: string | undefined, prev: string): boolean {
  if (!next) return false;
  const a = opening(prev);
  // Chinese and other unspaced scripts have no words to compare, so their first characters stand in.
  if (!a.includes(" ")) return a.length >= 4 && opening(next).slice(0, 4) === a.slice(0, 4);
  return a.split(" ").length === 3 && opening(next) === a;
}

/**
 * The model copies the English button name into answers in other languages
 * ("toca Use my location"). When the reply carries the button, its text uses
 * the name the button shows.
 */
export function nameLocationButton(text: string, offerLocation: boolean | undefined, label: string): string {
  if (!offerLocation || label === "Use my location") return text;
  return text.replace(/\bUse my location\b/gi, label);
}
