/**
 * Live check of every registry source against data.cityofnewyork.us. Skipped
 * by default (CI must not depend on the network); run with
 * `LIVE_SOCRATA=1 pnpm test`.
 */
import { describe, expect, it } from "vitest";

declare const process: { env: Record<string, string | undefined> };
import { buildSocrataUrl } from "@/lib/api/socrata";
import { windowBounds } from "@/lib/windows";
import { gridQuery } from "./fetchSource";
import { SOURCES } from "./registry";

const live = process.env.LIVE_SOCRATA === "1";

describe.skipIf(!live)("registry sources (live)", () => {
  for (const source of SOURCES) {
    if (source.kind === "builtin") continue;
    it(`${source.id} (${source.datasetId}) returns geo rows`, async () => {
      const params: Record<string, string> =
        source.kind === "grid"
          ? { ...gridQuery(source, source.dateField ? windowBounds("90d") : null), $limit: "5" }
          : { $select: source.geom, $where: `${source.geom} IS NOT NULL`, $limit: "5" };
      const response = await fetch(buildSocrataUrl(source.datasetId, "json", params));
      const body = (await response.json()) as Array<Record<string, unknown>>;
      expect(response.status, JSON.stringify(body).slice(0, 300)).toBe(200);
      expect(body.length).toBeGreaterThan(0);
      if (source.kind === "grid") {
        expect(Number(body[0].r)).toBeGreaterThan(13000);
        expect(Number(body[0].c)).toBeLessThan(-24000);
      } else {
        expect(body[0][source.geom]).toBeTruthy();
      }
    }, 60_000);
  }
});
