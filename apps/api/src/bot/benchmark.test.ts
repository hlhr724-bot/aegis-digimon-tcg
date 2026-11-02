import { describe, expect, it } from "vitest";
import { createBaselinePolicy } from "./baselinePolicy.js";
import { runBotSeries, type SeriesResult } from "./matchHarness.js";

/**
 * Bot-vs-bot benchmark.
 *
 * Two sizes, one code path:
 *   - the SMOKE series always runs. It is small enough to sit inside the normal suite and
 *     is there to catch regressions in kind — an illegal action, a thrown error, a wedged
 *     match — not to measure strength precisely.
 *   - the FULL series runs only under `BOT_BENCH=1`. It is the one whose winrate and
 *     behavior numbers are quoted, because a handful of games is pure noise on a game
 *     with this much variance.
 *
 * Every match is seeded from a fixed base seed, and each series alternates which
 * configuration sits in seat 0, so first-player advantage cancels rather than being
 * measured as skill.
 */

const FULL = process.env.BOT_BENCH === "1";
const GAMES = FULL ? 60 : 6;
const TIMEOUT_MS = FULL ? 600_000 : 120_000;
/**
 * The DECISIVE bar: over 60 games the evaluation policy must take at least 60% off the legacy
 * baseline. It stays behind `BOT_BENCH=1` because six games cannot resolve a winrate on a game with
 * this much variance — asserting 0.6 on the smoke run would be a coin flip dressed as a gate.
 */
const MINIMUM_WIN_RATE = 0.6;
/**
 * The bar the SMOKE run carries instead, and it is deliberately shallow: at least one of the six
 * games goes to the evaluation policy. It is not a measurement, it is a total-regression trip wire —
 * a policy that has stopped winning at all, or that now loses every game to a baseline it used to
 * beat comfortably, fails here rather than passing green until somebody remembers to run the full
 * bench. The runs are seeded from a fixed base, so this is deterministic rather than lucky.
 */
const SMOKE_MINIMUM_WINS = 1;

function report(title: string, result: SeriesResult): void {
  console.log(
    [
      `\n[bot-benchmark] ${title} (${result.games} games)`,
      `  ${result.statsA.label}: ${result.winsA} wins | ${result.statsB.label}: ${result.winsB} wins | draws: ${result.draws}`,
      `  winrate(${result.statsA.label}) = ${(result.winRateA * 100).toFixed(1)}%`,
      `  average turns/game = ${result.averageTurns.toFixed(1)}`,
      `  rejections = ${result.totalRejections} (${result.statsA.label}=${result.rejectionsA}, ${result.statsB.label}=${result.rejectionsB}) ${JSON.stringify(result.rejectionReasons)}`,
      `  errors = ${result.errors.length}`,
      ...[result.statsA, result.statsB].map(
        (stats) =>
          `  ${stats.label}: attacks/turn=${stats.attacksPerTurn.toFixed(2)} securityAttacks/turn=${stats.securityAttacksPerTurn.toFixed(2)} securityTaken/game=${stats.securityTakenPerGame.toFixed(2)} ` +
          `plays/game=${stats.digimonPlayedPerGame.toFixed(1)} digivolves/game=${stats.digivolutionsPerGame.toFixed(1)} ` +
          `decision p50=${stats.medianDecisionMs.toFixed(2)}ms p95=${stats.p95DecisionMs.toFixed(2)}ms max=${stats.maxDecisionMs.toFixed(2)}ms`,
      ),
    ].join("\n"),
  );
}

describe("bot benchmark", () => {
  it(
    "the balanced evaluation policy beats the baseline heuristic policy",
    async () => {
      const result = await runBotSeries({
        games: GAMES,
        baseSeed: 20_260_812,
        seats: [
          { profile: "balanced", label: "balanced" },
          { policy: createBaselinePolicy(), label: "baseline" },
        ],
      });
      report("balanced vs baseline", result);

      expect(result.errors).toEqual([]);
      // The evaluation policy must never propose an action the engine refuses. The legacy
      // baseline still does — it declares attacks without consulting the engine's attack
      // projection — which is exactly part of why it is the weaker policy.
      expect(result.rejectionsA).toBe(0);
      // Every game reached a verdict; none wedged, none was abandoned mid-match.
      expect(result.winsA + result.winsB + result.draws).toBe(GAMES);
      if (FULL) expect(result.winRateA).toBeGreaterThanOrEqual(MINIMUM_WIN_RATE);
      else expect(result.winsA).toBeGreaterThanOrEqual(SMOKE_MINIMUM_WINS);
    },
    TIMEOUT_MS,
  );

  it(
    "the aggressive and defensive profiles play measurably differently",
    async () => {
      const result = await runBotSeries({
        games: GAMES,
        baseSeed: 777_001,
        seats: [
          { profile: "aggressive", label: "aggressive" },
          { profile: "defensive", label: "defensive" },
        ],
      });
      report("aggressive vs defensive", result);

      expect(result.errors).toEqual([]);
      expect(result.totalRejections).toBe(0);

      // Directional, with generous margins: the point is that the weights actually move
      // behavior, not that they move it by a precise amount.
      expect(result.statsA.securityAttacksPerTurn).toBeGreaterThan(result.statsB.securityAttacksPerTurn);
    },
    TIMEOUT_MS,
  );

  it(
    "finishes games faster in an aggressive mirror than in a defensive one",
    async () => {
      // Game length only means something when both seats share a personality: in a
      // head-to-head the two configurations play the same games, so the number is shared.
      const mirror = async (profile: "aggressive" | "defensive") =>
        runBotSeries({
          games: Math.max(4, GAMES / 2),
          baseSeed: 31_337,
          seats: [
            { profile, label: `${profile}-a` },
            { profile, label: `${profile}-b` },
          ],
        });
      const aggressive = await mirror("aggressive");
      const defensive = await mirror("defensive");
      report("aggressive mirror", aggressive);
      report("defensive mirror", defensive);

      expect(aggressive.errors).toEqual([]);
      expect(defensive.errors).toEqual([]);
      expect(aggressive.totalRejections).toBe(0);
      expect(defensive.totalRejections).toBe(0);
      expect(aggressive.averageTurns).toBeLessThan(defensive.averageTurns);
    },
    TIMEOUT_MS,
  );

  it(
    "keeps every decision well inside the interactive budget",
    async () => {
      const result = await runBotSeries({
        games: Math.min(GAMES, 6),
        baseSeed: 4_242,
        seats: [
          { profile: "balanced", label: "balanced-a" },
          { profile: "balanced", label: "balanced-b" },
        ],
      });
      report("balanced mirror", result);

      expect(result.errors).toEqual([]);
      expect(result.statsA.p95DecisionMs).toBeLessThan(50);
      expect(result.statsB.p95DecisionMs).toBeLessThan(50);
    },
    TIMEOUT_MS,
  );
});
