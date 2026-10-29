import { describe, expect, it } from "vitest";
import { FLAGS, type FlagMeta } from "./registry";

describe("flag hygiene", () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, meta] of Object.entries(FLAGS) as [string, FlagMeta][]) {
    it(`${id} has an owner and has not expired`, () => {
      expect(meta.owner, `${id} owner`).toMatch(/\S/);
      expect(meta.expires, `${id} expires`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(meta.expires >= today, `${id} expired on ${meta.expires}; remove it or renew with a new date`).toBe(true);
    });
  }
});
