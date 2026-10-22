import { describe, expect, it } from "vitest";
import { levelOf } from "./ViewSwitcher";

describe("levelOf", () => {
  it("maps the camera to a level", () => {
    expect(levelOf(true, 1.7, 85)).toBe("street");
    expect(levelOf(false, 60, 70)).toBe("mid");
    expect(levelOf(false, 300, 55)).toBe("up");
    expect(levelOf(false, 800, 0)).toBe("top");
  });
});
