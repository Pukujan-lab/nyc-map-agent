import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upSection } from "./migrate";

describe("dbmate migrations", () => {
  it("splits the up section and drops the down section", () => {
    const up = upSection("-- migrate:up\nCREATE SCHEMA a;\n-- migrate:down\nDROP SCHEMA a;\n");
    expect(up).toBe("CREATE SCHEMA a;");
  });

  it("every file has up and down sections and never touches public.nyc_* destructively", () => {
    for (const f of readdirSync("db/migrations")) {
      const sql = readFileSync(`db/migrations/${f}`, "utf8");
      expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
      expect(sql).toMatch(/^-- migrate:up/m);
      expect(sql).toMatch(/^-- migrate:down/m);
      expect(sql).not.toMatch(/(DROP|TRUNCATE|ALTER)\s+TABLE\s+(IF EXISTS\s+)?public\.nyc_/i);
    }
  });
});
