import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlaceToiletProps } from "./data";
import { PlaceToiletSheet } from "./PlaceToiletSheet";

vi.mock("@/lib/store/DataViewContext", () => ({ useDataView: () => ({ setRoutePoint: vi.fn(), setRoutePicking: vi.fn() }) }));

const base: PlaceToiletProps = {
  id: "osm:node/1",
  name: "Cafe",
  kind: "cafe",
  access: "customers",
  accessTagged: true,
  wheelchair: null,
  changingTable: null,
  fee: null,
  source: "openstreetmap",
  url: "https://www.openstreetmap.org/node/1",
};
const html = (p: Partial<PlaceToiletProps>) => renderToStaticMarkup(<PlaceToiletSheet place={{ ...base, ...p }} lon={-74} lat={40.7} />);

describe("PlaceToiletSheet", () => {
  it("shows the access badge, source link and Directions", () => {
    const out = html({});
    expect(out).toContain("Customers only");
    expect(out).toContain("Directions");
    expect(out).toContain('href="https://www.openstreetmap.org/node/1"');
    expect(out).not.toContain("Wheelchair accessible toilet");
  });
  it("shows Anyone and the wheelchair mark only where tagged", () => {
    const out = html({ access: "anyone", wheelchair: true });
    expect(out).toContain("Anyone");
    expect(out).toContain("Wheelchair accessible toilet");
  });
  it("flags untagged access as customers only", () => {
    expect(html({ accessTagged: false })).toContain("Access not tagged");
  });
});
