import { describe, expect, it } from "vitest";
import { weakenWeights } from "#api/bot/levels/weakenWeights";
import { BOT_PROFILES } from "#api/bot/profiles";

describe("level weight weakening", () => {
  const weights = BOT_PROFILES.defensive.weights;

  it("scales only the named weights", () => {
    const weakened = weakenWeights({ weights, scales: { securityRisk: 0, removal: 0.5 } });
    expect(weakened).toEqual({ ...weights, securityRisk: 0, removal: weights.removal * 0.5 });
  });

  it("leaves the style weights unchanged", () => {
    const original = { ...weights };
    weakenWeights({ weights, scales: { securityRisk: 0 } });
    expect(weights).toEqual(original);
  });
});
