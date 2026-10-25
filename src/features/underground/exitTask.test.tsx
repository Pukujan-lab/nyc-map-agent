import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExitTask } from "./ExitTask";
import type { ExitPack } from "./pack";
const pack: ExitPack = { station: { id: "1", name: "42 St", at: [-73.99, 40.75] }, exits: [], trackBearing: null, sketch: [] };
const noop = () => {};
describe("exit task", () => {
  it("shows the saved station and an honest empty state", () => {
    const html = renderToStaticMarkup(<ExitTask pack={pack} chosen={0} online={false} rotation={null} distanceM={null} onChoose={noop} onOut={noop} onClose={noop} />);
    expect(html).toContain("42 St");
    expect(html).toContain("Offline");
    expect(html).toContain("No street exits listed");
    expect(html).not.toContain("Approximate direction to your exit");
    expect(html).not.toContain("Other exits");
  });
});
