import { describe, expect, it } from "vitest";
import { splitTextByHighlight } from "@/game/splitTextByHighlight";

describe("literal match history highlighting", () => {
  it("matches repeated text without changing its casing", () => {
    expect(splitTextByHighlight({ text: "Agumon and AGUMON", highlight: "agumon" })).toEqual([
      { text: "Agumon", highlighted: true },
      { text: " and ", highlighted: false },
      { text: "AGUMON", highlighted: true },
    ]);
  });

  it("treats regular expression characters as literal text", () => {
    expect(splitTextByHighlight({ text: "A [Main] effect", highlight: "[Main]" })).toEqual([
      { text: "A ", highlighted: false },
      { text: "[Main]", highlighted: true },
      { text: " effect", highlighted: false },
    ]);
  });

  it("leaves unmatched text and empty searches intact", () => {
    for (const highlight of [undefined, " ", "missing"]) {
      expect(splitTextByHighlight({ text: "Agumon", highlight })).toEqual([{ text: "Agumon", highlighted: false }]);
    }
  });
});
