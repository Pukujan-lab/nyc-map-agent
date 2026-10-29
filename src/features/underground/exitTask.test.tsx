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

  const withExit: ExitPack = { ...pack, exits: [{ at: [-73.989, 40.751], kind: "stair", streets: ["W 42 St", "7 Av"], corner: "NE", alongM: null, landmarks: [] } as unknown as ExitPack["exits"][number]] };
  const base = { pack: withExit, chosen: 0, online: true, rotation: null, distanceM: 90, onChoose: noop, onOut: noop, onClose: noop, onShare: noop, onHere: noop, onWalkThere: noop, onPickStation: noop };
  it("asks whether you are at the station before saying you are out", () => {
    const html = renderToStaticMarkup(<ExitTask {...base} where={{ kind: "ask", blocked: false }} />);
    expect(html).toContain("Are you at 42 St?");
    expect(html).toContain("Share location");
    expect(html).toContain("I&#x27;m here");
    expect(html).not.toContain("I&#x27;m out");
    expect(html).toContain("from the station centre");
  });
  it("says when you are somewhere else and offers the station by you", () => {
    const html = renderToStaticMarkup(<ExitTask {...base} where={{ kind: "far", metres: 1240, nearest: { id: "2", name: "Times Sq", at: [-73.98, 40.75] } }} />);
    expect(html).toContain("You&#x27;re about 1.2 km from 42 St.");
    expect(html).toContain("Walk there");
    expect(html).toContain("Use Times Sq, by you");
  });
  it("gives the distance from you once you are there", () => {
    const html = renderToStaticMarkup(<ExitTask {...base} where={{ kind: "here", from: [-73.99, 40.75], toExitM: 64 }} />);
    expect(html).not.toContain("exit-where");
    expect(html).toContain("About 64 m from you");
    expect(html).toContain("I&#x27;m out");
  });
});
