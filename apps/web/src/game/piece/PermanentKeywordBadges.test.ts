import { describe, expect, it } from "vitest";
import { visibleKeywordCount } from "./PermanentKeywordBadges";

describe("keyword pills that fit one line", () => {
  it("shows every pill that fits beside the card", () => {
    expect(visibleKeywordCount(["Decode", "Barrier"], 100)).toBe(2);
  });

  it("keeps one pill and room for +N when the rest do not fit", () => {
    expect(visibleKeywordCount(["Progress", "Security Attack +1", "Barrier", "Piercing"], 100)).toBe(1);
  });

  it("shows more pills on a wider card, up to three", () => {
    expect(visibleKeywordCount(["Rush", "Blocker", "Jamming", "Raid"], 160)).toBe(3);
  });

  it("uses a count with a complete explanation when no label fits", () => {
    expect(visibleKeywordCount(["Security Attack +1", "Barrier"], 60)).toBe(0);
  });
});

it("reserves full character widths for Chinese keyword labels", () => {
  expect(visibleKeywordCount(["重启", "阻挡者", "屏障"], 100)).toBe(2);
  expect(visibleKeywordCount(["重启", "阻挡者", "屏障"], 116)).toBe(3);
});
