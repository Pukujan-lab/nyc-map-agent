import { describe, expect, it } from "vitest";
import { fallbackReason, initialPermissions, modeOf, permissionReducer as r, type PermissionState } from "./permission";

const req = r(initialPermissions, { type: "request", cameraSupported: true, orientationSupported: true });

describe("permission state machine", () => {
  it("asks for nothing until requested", () => {
    expect(modeOf(initialPermissions)).toBe("idle");
    expect(req).toEqual({ camera: "requesting", orientation: "requesting" });
    expect(modeOf(req)).toBe("requesting");
  });
  it("reaches ar only when both are granted", () => {
    const a = r(req, { type: "camera", result: "granted" });
    expect(modeOf(a)).toBe("requesting");
    expect(modeOf(r(a, { type: "orientation", result: "granted" }))).toBe("ar");
  });
  it("falls back with a reason when either is denied or missing", () => {
    const cam = r(r(req, { type: "camera", result: "denied" }), { type: "orientation", result: "granted" });
    expect(modeOf(cam)).toBe("fallback");
    expect(fallbackReason(cam)).toMatch(/Camera permission/);
    const noCompass = r(r(req, { type: "camera", result: "granted" }), { type: "orientation", result: "unsupported" });
    expect(fallbackReason(noCompass)).toMatch(/no compass/);
    const none = r(initialPermissions, { type: "request", cameraSupported: false, orientationSupported: true });
    expect(none.camera).toBe("unsupported");
  });
  it("ignores late results after stop and resets on stop", () => {
    const stopped = r(req, { type: "stop" });
    expect(stopped).toEqual(initialPermissions);
    const late: PermissionState = r(stopped, { type: "camera", result: "granted" });
    expect(late).toEqual(initialPermissions);
  });
});
