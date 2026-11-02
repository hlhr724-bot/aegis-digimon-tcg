import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/resident-option-reduction-after-evolution.fixture";
import "#api/cards/BT25/BT25-049";
import "#api/cards/BT14/BT14-046";
import "#api/cards/EX3/EX3-040";
import "#api/cards/BT25/BT25-057";
import "#api/cards/ST23/ST23-15";

describe("resident Option reduction after evolution", () => {
  it.each([
    { evolve: false, acceptSecond: false },
    { evolve: true, acceptSecond: false },
    { evolve: false, acceptSecond: true },
    { evolve: true, acceptSecond: true },
  ])("rechecks the source with evolution=$evolve and payment=$acceptSecond", async ({ evolve, acceptSecond }) => {
    const declinePrompts = [""];
    const options = { autoAcceptOptional: true, autoSelectCards: true, declinePrompts };
    const s = setupScenario(fixture, options);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstOption").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
      expect(s.decisions.filter(({ req }) => req.sourceCardId === "BT25-049" && req.kind === "optional")).toHaveLength(
        1,
      );
      expect(s.state.memory).toBe(7);
      const evolutionResult = evolve
        ? s.engine.applyIntent(0, {
            type: "digivolve",
            instanceId: s.inst("evolution").instanceId,
            permanentId: s.perm("reducer").permanentId,
          })
        : undefined;
      expect(evolutionResult).toEqual(evolve ? { ok: true } : undefined);
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
      expect(s.perm("reducer").topCard.cardId).toBe(evolve ? "BT25-057" : "BT25-049");
      expect(s.perm("reducer").stack.map(({ cardId }) => cardId)).toEqual(evolve ? ["BT25-049"] : []);
      if (acceptSecond) {
        declinePrompts.length = 0;
      }
      const before = s.decisions.length;
      const memory = s.state.memory;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondOption").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
      expect(
        s.decisions.slice(before).filter(({ req }) => req.sourceCardId === "BT25-049" && req.kind === "optional"),
      ).toHaveLength(evolve ? 0 : 1);
      const paidReduction = acceptSecond && !evolve;
      expect(s.state.memory).toBe(memory - (paidReduction ? 0 : 3));
      expect(s.perm("tamer").stack.map(({ instanceId }) => instanceId)).toEqual(
        paidReduction ? [] : [s.inst("fuel").instanceId],
      );
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});

it.each([
  { reducer: "BT14-046", played: "BT1-088" },
  { reducer: "EX3-040", played: "BT1-067" },
])("removes $reducer's printed reduction after digivolving", async ({ reducer, played }) => {
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: [{ card: reducer, as: "reducer" }],
          hand: [
            { card: played, as: "first" },
            { card: played, as: "second" },
            { card: "BT1-078", as: "evolution" },
          ],
        },
      },
    },
    { autoDeclineOptional: true, autoSelectCards: true },
  );
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    expect(s.decisions.some(({ req }) => req.sourceCardId === reducer)).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        instanceId: s.inst("evolution").instanceId,
        permanentId: s.perm("reducer").permanentId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    const before = s.decisions.length;
    const memory = s.state.memory;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && s.state.pendingDecision === undefined);
    expect(s.decisions.slice(before).some(({ req }) => req.sourceCardId === reducer)).toBe(false);
    expect(s.state.memory).toBe(memory - (played === "BT1-088" ? 2 : 3));
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
