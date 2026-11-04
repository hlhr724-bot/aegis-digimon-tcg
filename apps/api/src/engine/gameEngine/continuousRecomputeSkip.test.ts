import { afterEach, expect, it } from "vitest";
import { runBotMatch } from "#api/bot/matchHarness";
import { continuousSkipVerifier } from "#api/engine/mutationClock/continuousSkipVerifier";
import { installContinuousSkipVerification } from "#api/engine/testkit/installContinuousSkipVerification";

afterEach(() => {
  continuousSkipVerifier.verify = undefined;
});

it.each([20261103, 20261104])(
  "skips only continuous recomputes whose result would not change in a full bot match (seed %i)",
  async (seed) => {
    const verification = installContinuousSkipVerification();
    const result = await runBotMatch({
      seed,
      seats: [{ profile: "balanced" }, { profile: "aggressive" }],
      turnLimit: 12,
    });
    expect(result.errors).toEqual([]);
    expect(verification.mismatches).toEqual([]);
    expect(verification.verified).toBeGreaterThan(0);
  },
  60_000,
);
