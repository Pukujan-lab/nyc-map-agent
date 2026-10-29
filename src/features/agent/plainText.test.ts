import { describe, expect, it } from "vitest";
import { plainText } from "./plainText";

describe("plainText", () => {
  it("drops bold, italic, code and heading marks", () => {
    expect(plainText("Tap **Use my location** under this reply.")).toBe("Tap Use my location under this reply.");
    expect(plainText("Take the *downtown* 6, then `Exit B`.")).toBe("Take the downtown 6, then Exit B.");
    expect(plainText("## Nearest restroom\nBryant Park")).toBe("Nearest restroom\nBryant Park");
    expect(plainText("It's __open__ now.")).toBe("It's open now.");
  });

  it("keeps lone marks and ordinary text", () => {
    expect(plainText("Stand clear * of the doors")).toBe("Stand clear * of the doors");
    expect(plainText("Q_train_stop and 5 * 3")).toBe("Q_train_stop and 5 * 3");
    expect(plainText("Walk 3 minutes to 42 St.")).toBe("Walk 3 minutes to 42 St.");
  });
});
