import { describe, expect, it } from "vitest";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { levelTemperature } from "#api/bot/levels/levelTemperature";

describe("style-scaled level temperature", () => {
  it("uses the configured temperature for Balanced", () => {
    expect(levelTemperature({ difficulty: BotDifficulty.CASUAL.value, style: BotStyle.BALANCED.value })).toBe(
      BOT_LEVEL_CONFIGS[BotDifficulty.CASUAL.value].temperature,
    );
  });

  it("samples Aggressive more widely and Defensive more narrowly than Balanced", () => {
    const temperature = (style: BotStyle) => levelTemperature({ difficulty: BotDifficulty.BEGINNER.value, style });
    expect(temperature(BotStyle.AGGRESSIVE.value)).toBeGreaterThan(temperature(BotStyle.BALANCED.value));
    expect(temperature(BotStyle.BALANCED.value)).toBeGreaterThan(temperature(BotStyle.DEFENSIVE.value));
  });

  it("uses an absolute temperature override instead of the style scale", () => {
    expect(levelTemperature({ difficulty: BotDifficulty.CASUAL.value, style: BotStyle.DEFENSIVE.value })).toBe(0.9);
  });

  it("keeps greedy selection at Standard for every style", () => {
    for (const style of Object.values(BotStyle)) {
      expect(levelTemperature({ difficulty: BotDifficulty.STANDARD.value, style: style.value })).toBe(0);
    }
  });
});
