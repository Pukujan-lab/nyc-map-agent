/** Explicit answer follow-ups. The conversation supplies the previous question. */
export function followUpQuestion(kind: "nearby" | "other", place: { name: string; lon: number; lat: number } | null): string {
  if (kind === "other") return "What are my other options? Show them on the map.";
  const at = place ? ` near ${place.name} (${place.lat.toFixed(4)}, ${place.lon.toFixed(4)})` : " nearby";
  return `What's${at}? Show landmarks, public restrooms and transit stops on the map.`;
}
