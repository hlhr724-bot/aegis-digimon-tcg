import { describe, expect, it } from "vitest";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import calibration from "#api/bot/levels/level-calibration.json" with { type: "json" };
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { STYLE_TEMPERATURE_SCALES } from "#api/bot/levels/STYLE_TEMPERATURE_SCALES";
import { BOT_PROFILES } from "#api/bot/profiles";

describe("shipped bot level calibration", () => {
  it("ships the calibrated level configs", () => {
    expect(BOT_LEVEL_CONFIGS).toEqual(calibration.calibrated.levels);
  });

  it("ships the calibrated style temperature scales", () => {
    expect(STYLE_TEMPERATURE_SCALES).toEqual(calibration.calibrated.styleTemperatureScales);
  });

  it("ships the calibrated style weights", () => {
    for (const style of Object.values(BotStyle)) {
      expect(BOT_PROFILES[style.value].weights).toEqual(calibration.calibrated.styleWeights[style.value]);
    }
  });
});
