import { describe, expect, it } from "vitest";
import {
  onFootMinutes,
  RESTROOM_WALK_LIMIT_MINUTES,
  shouldWalkRestroomTrip,
} from "./restroomTrip";

describe("shouldWalkRestroomTrip", () => {
  it("walks when the card's on-foot time is under 20 minutes", () => {
    expect(shouldWalkRestroomTrip((RESTROOM_WALK_LIMIT_MINUTES - 1) * 60)).toBe(true);
    // 19 min 29 sec still prints as about 19 min.
    expect(onFootMinutes(19 * 60 + 29)).toBe(19);
    expect(shouldWalkRestroomTrip(19 * 60 + 29)).toBe(true);
  });

  it("does not auto-walk when the on-foot time is 20 minutes or more", () => {
    expect(onFootMinutes(RESTROOM_WALK_LIMIT_MINUTES * 60)).toBe(20);
    expect(shouldWalkRestroomTrip(RESTROOM_WALK_LIMIT_MINUTES * 60)).toBe(false);
    // 19 min 30 sec prints as about 20 min, the same number the card shows.
    expect(onFootMinutes(19 * 60 + 30)).toBe(RESTROOM_WALK_LIMIT_MINUTES);
    expect(shouldWalkRestroomTrip(19 * 60 + 30)).toBe(false);
    expect(shouldWalkRestroomTrip((RESTROOM_WALK_LIMIT_MINUTES + 25) * 60)).toBe(false);
  });
});
