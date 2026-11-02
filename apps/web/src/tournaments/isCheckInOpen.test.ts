import { describe, expect, it } from "vitest";
import { isCheckInOpen } from "@/tournaments/isCheckInOpen";

const windows = { registrationClosesAt: null, checkInOpensAt: 1_000, checkInClosesAt: 2_000 };

describe("whether the organizer can close check-in", () => {
  it("waits until check-in opens", () => {
    expect(isCheckInOpen({ status: "registration", windows, now: 999 })).toBe(false);
    expect(isCheckInOpen({ status: "registration", windows, now: 1_000 })).toBe(true);
  });

  it("treats a missing opening time as already open", () => {
    expect(isCheckInOpen({ status: "registration", windows: undefined, now: 0 })).toBe(true);
  });

  it("is closed outside sign-ups and check-in", () => {
    expect(isCheckInOpen({ status: "draft", windows, now: 1_500 })).toBe(false);
    expect(isCheckInOpen({ status: "running", windows, now: 1_500 })).toBe(false);
  });
});
