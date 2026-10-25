/**
 * The static chat bar in index.html shows before the app's script has run
 * (#368). The real chat bar takes over its text and removes it when it mounts,
 * so the bar never blinks out and nothing typed early is lost.
 */
type Doc = Pick<Document, "getElementById">;

/** What was typed into the static bar, or "". */
export function shellText(doc: Doc = document): string {
  const el = doc.getElementById("shell-ask") as { value?: unknown } | null;
  return typeof el?.value === "string" && el.value.trim() ? el.value : "";
}

export function removeShell(doc: Doc = document): void {
  doc.getElementById("shell-bar")?.remove();
}
