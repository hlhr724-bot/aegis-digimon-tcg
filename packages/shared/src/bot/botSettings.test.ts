import { describe, expect, it } from "vitest";
import { BotDifficulty } from "#shared/bot/BotDifficulty";
import { BotStyle } from "#shared/bot/BotStyle";
import { isBotDifficulty } from "#shared/bot/isBotDifficulty";
import { isBotStyle } from "#shared/bot/isBotStyle";

describe("bot settings contracts", () => {
  it("accepts every serialized difficulty and style", () => {
    expect(Object.values(BotDifficulty).map((entry) => entry.value)).toEqual([
      "beginner",
      "casual",
      "standard",
      "expert",
      "master",
    ]);
    expect(Object.values(BotStyle).map((entry) => entry.value)).toEqual(["balanced", "aggressive", "defensive"]);
    for (const entry of Object.values(BotDifficulty)) {
      expect(isBotDifficulty(entry.value)).toBe(true);
    }
    for (const entry of Object.values(BotStyle)) {
      expect(isBotStyle(entry.value)).toBe(true);
    }
  });

  it.each([undefined, null, 0, {}, [], "constructor", "toString", "__proto__", "STANDARD", ""])(
    "refuses invalid boundary input %s",
    (value) => {
      expect(isBotDifficulty(value)).toBe(false);
      expect(isBotStyle(value)).toBe(false);
    },
  );
});
