import { describe, expect, it } from "vitest";
import { recentTurns } from "./chatWindow";
import { MAX_MESSAGES, requestBody } from "./schema";

const chat = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}`, id: String(i) }));

describe("recentTurns", () => {
  it("sends a short chat whole, without the app's own fields", () => {
    expect(recentTurns(chat(3))).toEqual([{ role: "user", content: "m0" }, { role: "assistant", content: "m1" }, { role: "user", content: "m2" }]);
  });

  it("keeps a long chat under the server's limit, starting on a question", () => {
    const sent = recentTurns(chat(41));
    expect(sent.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(sent[0].role).toBe("user");
    expect(sent.at(-1)?.content).toBe("m40");
    expect(requestBody.safeParse({ messages: sent }).success).toBe(true);
  });
});
