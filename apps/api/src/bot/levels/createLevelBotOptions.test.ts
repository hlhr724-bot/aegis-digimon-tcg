import { describe, expect, it } from "vitest";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { BOT_LEVEL_CONFIGS } from "#api/bot/levels/BOT_LEVEL_CONFIGS";
import { resolveLevelConfig } from "#api/bot/levels/resolveLevelConfig";
import { weakenWeights } from "#api/bot/levels/weakenWeights";
import { BOT_PROFILES } from "#api/bot/profiles";
import { setupEngine } from "#api/engine/testkit/harness";

const deck = { mainDeck: [], eggDeck: [] };

describe("independent bot difficulty and style", () => {
  for (const difficulty of Object.values(BotDifficulty)) {
    for (const style of Object.values(BotStyle)) {
      it(`resolves ${difficulty.value} with ${style.value}`, () => {
        const { engine } = setupEngine({});
        const options = createLevelBotOptions({
          engine,
          seat: 0,
          deck,
          seed: 42,
          difficulty: difficulty.value,
          style: style.value,
        });
        expect(options.policy?.name).toContain(`level:${difficulty.value}:${style.value}:`);
        expect(options.profile).toMatchObject({ name: style.value });
        expect(options.minThinkMs).toBe(BOT_LEVEL_CONFIGS[difficulty.value].minThinkMs);
        expect(options.maxThinkMs).toBe(BOT_LEVEL_CONFIGS[difficulty.value].maxThinkMs);
        const profile = options.profile;
        if (typeof profile !== "object") {
          throw new Error("Expected resolved profile");
        }
        const expectedWeights = weakenWeights({
          weights: BOT_PROFILES[style.value].weights,
          scales: resolveLevelConfig({ difficulty: difficulty.value, style: style.value }).weightScales,
        });
        expect(profile.weights).toEqual(expectedWeights);
      });
    }
  }

  it.each([BotStyle.BALANCED, BotStyle.DEFENSIVE])(
    "discounts only removal and loss at Standard for $value",
    (style) => {
      const { engine } = setupEngine({});
      const options = createLevelBotOptions({
        engine,
        seat: 0,
        deck,
        seed: 42,
        difficulty: BotDifficulty.STANDARD.value,
        style: style.value,
      });
      const weights = BOT_PROFILES[style.value].weights;
      expect(options.profile).toMatchObject({
        weights: { ...weights, removal: weights.removal * 0.75, loss: weights.loss * 0.75 },
      });
    },
  );

  it("keeps Standard Aggressive removal and loss and softens its security attacks", () => {
    const { engine } = setupEngine({});
    const options = createLevelBotOptions({
      engine,
      seat: 0,
      deck,
      seed: 42,
      difficulty: BotDifficulty.STANDARD.value,
      style: BotStyle.AGGRESSIVE.value,
    });
    const weights = BOT_PROFILES[BotStyle.AGGRESSIVE.value].weights;
    expect(options.profile).toMatchObject({
      weights: { ...weights, securityAttack: weights.securityAttack * 0.8 },
    });
  });

  it("searches fewer candidates with fewer rollouts at Expert than at Master", () => {
    const expert = BOT_LEVEL_CONFIGS[BotDifficulty.EXPERT.value];
    const master = BOT_LEVEL_CONFIGS[BotDifficulty.MASTER.value];
    expect(expert.searchCandidateLimit).toBeLessThan(master.searchCandidateLimit);
    expect(expert.searchSimulations).toBeLessThan(master.searchSimulations);
    expect(expert.searchCandidateLimit).toBeGreaterThan(1);
  });

  it("samples more widely at each lower non-search level", () => {
    const levels = [BotDifficulty.STANDARD, BotDifficulty.CASUAL, BotDifficulty.BEGINNER].map(
      (difficulty) => BOT_LEVEL_CONFIGS[difficulty.value],
    );
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]!.temperature).toBeGreaterThan(levels[index - 1]!.temperature);
      expect(levels[index]!.topK).toBeGreaterThan(levels[index - 1]!.topK);
    }
  });

  it("exposes only public opponent card identities to search policy consumers", () => {
    const { engine } = setupEngine({});
    const policy = createLevelBotOptions({
      engine,
      seat: 0,
      deck,
      seed: 42,
      difficulty: BotDifficulty.EXPERT.value,
      style: BotStyle.BALANCED.value,
    }).policy!;
    policy.observeEvent?.({ kind: "cardRevealed", seat: 1, cardId: "BT1-009" });
    policy.observeEvent?.({ kind: "cardRevealed", seat: 0, cardId: "BT1-019" });
    expect(policy.getSeenOpponentCards?.()).toEqual({ main: ["BT1-009"], eggs: [] });
  });

  it.each([BotDifficulty.EXPERT, BotDifficulty.MASTER])("uses the residual evaluator at %s", (difficulty) => {
    const { engine } = setupEngine({});
    const options = createLevelBotOptions({
      engine,
      seat: 0,
      deck,
      seed: 42,
      difficulty: difficulty.value,
      style: BotStyle.BALANCED.value,
    });
    expect(options.policy?.name).toContain("live-search:projected:balanced");
  });
});
