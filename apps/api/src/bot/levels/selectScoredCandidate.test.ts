import { describe, expect, it } from "vitest";
import { selectScoredCandidate } from "#api/bot/levels/selectScoredCandidate";
import { createBotRandom } from "#api/bot/rng";

describe("bounded candidate sampling", () => {
  const candidates = [
    { candidate: "best", score: 5 },
    { candidate: "second", score: 4 },
    { candidate: "bad", score: -1 },
  ];

  it("preserves the best choice at zero temperature", () => {
    expect(selectScoredCandidate({ candidates, temperature: 0, topK: 3, random: () => 0.99 })).toBe("best");
  });

  it("samples reproducibly without crossing the pass threshold", () => {
    const run = () => {
      const random = createBotRandom(42);
      return Array.from({ length: 100 }, () =>
        selectScoredCandidate({
          candidates,
          temperature: 10,
          topK: 3,
          random: () => random.next(),
          passThreshold: 0,
        }),
      );
    };
    expect(run()).toEqual(run());
    expect(new Set(run())).toEqual(new Set(["best", "second"]));
  });

  it("protects lethal and forced moves", () => {
    for (const protection of [{ lethal: true }, { forced: true }]) {
      expect(
        selectScoredCandidate({
          candidates: [...candidates, { candidate: "protected", score: 2, ...protection }],
          temperature: 100,
          topK: 1,
          random: () => 0.99,
        }),
      ).toBe("protected");
    }
  });

  it("passes when every move is below the threshold", () => {
    expect(
      selectScoredCandidate({ candidates, temperature: 1, topK: 2, random: () => 0, passThreshold: 5 }),
    ).toBeUndefined();
  });
});
