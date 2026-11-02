import { describe, expect, it } from "vitest";
import { CloseCheckInOutcome } from "@/tournaments/CloseCheckInOutcome";
import { getCloseCheckInOutcome } from "@/tournaments/getCloseCheckInOutcome";

describe("what closing check-in does", () => {
  it("cancels a single elimination event with fewer than two checked-in players", () => {
    expect(getCloseCheckInOutcome({ structure: "single_elimination", checkedIn: 1 })).toBe(
      CloseCheckInOutcome.CANCEL.value,
    );
  });

  it("starts a single elimination event once two players checked in", () => {
    expect(getCloseCheckInOutcome({ structure: "single_elimination", checkedIn: 2 })).toBe(
      CloseCheckInOutcome.START.value,
    );
  });

  it("cannot start a Swiss event that nobody checked in to", () => {
    expect(getCloseCheckInOutcome({ structure: "swiss", checkedIn: 0 })).toBe(CloseCheckInOutcome.BLOCKED.value);
  });
});
