import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRoot } from "./node";

describe("root app", () => {
  it("answers /healthz with JSON", async () => {
    const res = await createRoot().fetch(new Request("http://x/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves the SPA shell for a client route when dist exists", async () => {
    // `serveStatic` resolves its root against the working directory, which is the
    // repo root under vitest. CI checks out without dist, so the expectation
    // follows what is on disk rather than pretending the build always ran.
    const built = existsSync("dist/index.html");
    const res = await createRoot().fetch(new Request("http://x/some/client/route"));
    expect(res.status).toBe(built ? 200 : 404);
  });
});
