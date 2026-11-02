import { describe, expect, it } from "vitest";
import { RANKED_REPORT_RULINGS, RankedReportStatus } from "#shared/ranked/RankedReportStatus";
import { isRankedReportRuling } from "#shared/ranked/isRankedReportRuling";

describe("ranked report status", () => {
  it("keeps the persisted values and offers only final rulings to admins", () => {
    expect(Object.values(RankedReportStatus).map(({ value }) => value)).toEqual(["pending", "confirmed", "rejected"]);
    expect(RANKED_REPORT_RULINGS).toEqual(["confirmed", "rejected"]);
  });

  it.each(["confirmed", "rejected"])("accepts the ruling %s", (value) => {
    expect(isRankedReportRuling(value)).toBe(true);
  });

  it.each([null, undefined, 0, {}, "pending", "CONFIRMED", "constructor", "__proto__", ""])(
    "rejects the invalid ruling %j",
    (value) => {
      expect(isRankedReportRuling(value)).toBe(false);
    },
  );
});
