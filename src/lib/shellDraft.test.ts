import { describe, expect, it, vi } from "vitest";
import { removeShell, shellFocused, shellText } from "./shellDraft";

const page = (value: string | null) => {
  const remove = vi.fn();
  const doc = {
    getElementById: (id: string) =>
      value === null ? null : id === "shell-ask" ? ({ value } as unknown as HTMLElement) : id === "shell-bar" ? ({ remove } as unknown as HTMLElement) : null,
  };
  return { doc, remove };
};

describe("the static chat bar before the app loads (#368)", () => {
  it("hands over what was typed", () => {
    expect(shellText(page("nearest restroom").doc)).toBe("nearest restroom");
  });

  it("hands over nothing for blank text or a page without it", () => {
    expect(shellText(page("   ").doc)).toBe("");
    expect(shellText(page(null).doc)).toBe("");
  });

  it("is removed by the real bar, and removing twice is harmless", () => {
    const { doc, remove } = page("");
    removeShell(doc);
    expect(remove).toHaveBeenCalledOnce();
    expect(() => removeShell(page(null).doc)).not.toThrow();
  });

  it("knows when it holds the cursor, so the real bar can take it over", () => {
    expect(shellFocused({ activeElement: { id: "shell-ask" } as Element })).toBe(true);
    expect(shellFocused({ activeElement: { id: "other" } as Element })).toBe(false);
    expect(shellFocused({ activeElement: null })).toBe(false);
  });
});
