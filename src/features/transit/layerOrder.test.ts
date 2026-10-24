import { describe, expect, it, vi } from "vitest";
import { ABOVE_VEHICLE_LAYERS, RAISED_LIFT_PX, STOP_LIFT_PX, alertCameraAction, paintAboveVehicles, trainIconOffset } from "./layerOrder";

const fakeMap = (order: string[]) => {
  const moveLayer = vi.fn((id: string) => { order.splice(order.indexOf(id), 1); order.push(id); });
  return { order, moveLayer, getLayer: (id: string) => (order.includes(id) ? ({ id } as never) : undefined), getLayersOrder: () => [...order] } as never as Parameters<typeof paintAboveVehicles>[0] & { order: string[]; moveLayer: typeof moveLayer };
};

describe("paintAboveVehicles", () => {
  it("leaves the stack alone when the overlay already sits above the vehicle layer", () => {
    const m = fakeMap(["base", "veh", ...ABOVE_VEHICLE_LAYERS]);
    paintAboveVehicles(m, "veh");
    expect(m.moveLayer).not.toHaveBeenCalled();
  });
  it("moves the vehicle layer then the overlay to the top, in order", () => {
    const m = fakeMap([...ABOVE_VEHICLE_LAYERS, "veh", "other"]);
    paintAboveVehicles(m, "veh");
    expect(m.order.slice(-(ABOVE_VEHICLE_LAYERS.length + 1))).toEqual(["veh", ...ABOVE_VEHICLE_LAYERS]);
  });
  it("skips layers that are not on the map and does nothing when none exist", () => {
    const m = fakeMap(["base"]);
    paintAboveVehicles(m, "veh");
    expect(m.moveLayer).not.toHaveBeenCalled();
    const partial = fakeMap(["transit-station", "veh", "transit-skip"]);
    paintAboveVehicles(partial, "veh");
    expect(partial.order).toEqual(["veh", "transit-station", "transit-skip"]);
  });
});

describe("trainIconOffset", () => {
  it("flat map: only dwelling trains lift", () => {
    const e = trainIconOffset(false, 0) as unknown as unknown[];
    expect(e[0]).toBe("case");
    expect(e[2]).toEqual(["literal", [0, -STOP_LIFT_PX]]);
    expect(e[3]).toEqual(["literal", [0, -0]]);
  });
  it("3D: elevated dwelling trains lift by both, and the notch rides above the bullet", () => {
    const e = trainIconOffset(true, 26) as unknown as unknown[];
    expect(e[2]).toEqual(["literal", [0, -(RAISED_LIFT_PX + STOP_LIFT_PX + 26)]]);
    expect(e[4]).toEqual(["literal", [0, -(STOP_LIFT_PX + 26)]]);
    expect(e[6]).toEqual(["literal", [0, -(RAISED_LIFT_PX + 26)]]);
    expect(e[7]).toEqual(["literal", [0, -26]]);
  });
});

describe("alertCameraAction", () => {
  const base = { hasBounds: true, hasFocus: true, hasSaved: false, following: false };
  it("fits the alert when not following", () => {
    expect(alertCameraAction(base)).toBe("fit");
  });
  it("never fits or eases while following; it only forgets a stale saved view", () => {
    expect(alertCameraAction({ ...base, following: true })).toBe("none");
    expect(alertCameraAction({ ...base, following: true, hasSaved: true })).toBe("drop");
  });
  it("eases back only when the alert closes and a view was saved", () => {
    expect(alertCameraAction({ hasBounds: false, hasFocus: false, hasSaved: true, following: false })).toBe("restore");
    expect(alertCameraAction({ hasBounds: false, hasFocus: false, hasSaved: false, following: false })).toBe("none");
    expect(alertCameraAction({ hasBounds: false, hasFocus: true, hasSaved: true, following: false })).toBe("none");
  });
});
