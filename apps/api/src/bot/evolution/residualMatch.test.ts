import { expect, it, vi } from "vitest";
import { evolutionDeck } from "./decks.js";
import { runResidualMatch } from "./residualMatch.js";
import { SEED_RESIDUAL } from "./residualPolicy.js";
import { recordApplicationRandomCalls } from "#api/engine/testkit/recordApplicationRandomCalls";

it("keeps client projections valid when Ulforce returns a just-evolved top card before the next patch", async () => {
  const decks = [
    evolutionDeck("ex4-dgo-2022-06-25-1-ulforceveedramon").deck,
    evolutionDeck("bt8-blackwargreymon").deck,
  ] as const;
  const program = {
    ...SEED_RESIDUAL,
    rules: SEED_RESIDUAL.rules.map((rule) => ({ ...rule, weight: rule.feature === "sourceDp" ? 0.2 : 0 })),
  };
  const decoderErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const decoderWarnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const game = await runResidualMatch({ seed: 2130995244, learnerSeat: 0, decks, program });
    expect(game.result.errors).toEqual([]);
    expect(game.result.rejections).toEqual([]);
    expect(game.result.timedOut).toBe(false);
    expect(game.result.projectionChecks).toBeGreaterThan(50);
    expect(game.valid).toBe(true);
    expect(decoderErrors).not.toHaveBeenCalled();
    expect(decoderWarnings).not.toHaveBeenCalled();
  } finally {
    decoderErrors.mockRestore();
    decoderWarnings.mockRestore();
  }
});

it("refuses a replaced balanced control even when the override is neutral", async () => {
  const decks = [evolutionDeck("bt1-red-omnimon").deck, evolutionDeck("bt4-yellow-wargreymon").deck] as const;
  await expect(
    runResidualMatch({ seed: 719, learnerSeat: 0, decks, program: SEED_RESIDUAL, opponentProgram: SEED_RESIDUAL }),
  ).rejects.toThrow("Balanced comparison cannot override the control policy");
});

it("replays effect-driven security shuffles from the match seed without ambient randomness", async () => {
  const decks = [
    evolutionDeck("bt5-lordknightmon").deck,
    evolutionDeck("bt24-dgo-2026-02-14-13-jupitermon").deck,
  ] as const;
  const ambient = recordApplicationRandomCalls();
  try {
    const results = [];
    for (const learnerSeat of [0, 1, 0] as const) {
      const game = await runResidualMatch({ seed: 32000027, learnerSeat, decks, program: SEED_RESIDUAL });
      expect(game.result.errors).toEqual([]);
      expect(game.valid).toBe(true);
      results.push(game.result);
    }
    expect(results[0]!.events!.filter((event) => event.kind === "securityRevealed").length).toBeGreaterThan(0);
    for (const result of results.slice(1)) {
      expect(result.winnerSeat).toBe(results[0]!.winnerSeat);
      expect(result.turnCount).toBe(results[0]!.turnCount);
      expect(result.events).toEqual(results[0]!.events);
    }
    expect(ambient.stacks).toEqual([]);
  } finally {
    ambient.restore();
  }
}, 30000);

it("a neutral residual reproduces the balanced control's real game in both learner seats", async () => {
  const decks = [evolutionDeck("bt1-red-omnimon").deck, evolutionDeck("bt4-yellow-wargreymon").deck] as const;
  const results = [];
  for (const learnerSeat of [0, 1] as const) {
    const game = await runResidualMatch({ seed: 719, learnerSeat, decks, program: SEED_RESIDUAL, captureTraces: true });
    expect(game.valid).toBe(true);
    expect(game.result.rejections).toEqual([]);
    expect(game.result.errors).toEqual([]);
    expect(game.result.projectionChecks).toBeGreaterThan(0);
    expect(game.traces.length).toBeGreaterThan(0);
    results.push(game.result);
  }
  expect(results[0]!.winnerSeat).toBe(results[1]!.winnerSeat);
  expect(results[0]!.turnCount).toBe(results[1]!.turnCount);
  expect(results[0]!.events).toEqual(results[1]!.events);
});
