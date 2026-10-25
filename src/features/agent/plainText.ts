/**
 * The answer as plain text. The prompt asks for no markdown, but the model still
 * writes "tap **Use my location**" now and then, and the answer card shows text
 * as it is, so the stars reached the screen (owner report, 2026-10-25).
 * Only paired marks are removed, so a lone "*" or "_" in a name stays.
 */
export function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}
