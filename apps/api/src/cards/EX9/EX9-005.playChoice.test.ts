import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import fixture from "#api/engine/scenarios/negamon-play-choice.fixture";
import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import "#api/cards/EX9/EX9-005";
import "#api/cards/EX9/EX9-047";
import "#api/cards/EX9/EX9-048";
import "#api/cards/EX9/EX9-055";
import "#api/cards/BT8/BT8-097";

describe("Negamon hand play reminder projection", () => {
  it("offers its available breeding effect only for matching Digimon in its controller's hand", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "EX9-005", as: "negamon" },
        hand: [
          { card: "EX9-047", as: "eyesmon" },
          { card: "EX9-048", as: "scatter" },
          { card: "BT1-009", as: "unrelated" },
        ],
        trash: [{ card: "EX9-047", as: "trashed" }],
      },
      1: { hand: [{ card: "EX9-047", as: "opponent" }] },
    });
    await s.ready();
    const effect = observe(s.engine).activatableEffects(s.perm("negamon"))[0]!;
    expect(s.inst("eyesmon").negamonPlayEffectKey).toBe(effect.effectKey);
    expect(s.inst("scatter").negamonPlayEffectKey).toBe(effect.effectKey);
    expect(s.inst("unrelated").negamonPlayEffectKey).toBe("");
    expect(s.inst("trashed").negamonPlayEffectKey).toBe("");
    expect(s.inst("opponent").negamonPlayEffectKey).toBe("");
    const player = s.state.players[0]!;
    player.trash.push(...player.hand.splice(player.hand.indexOf(s.inst("eyesmon")), 1));
    await s.engine.recomputeContinuousEffects();
    expect(s.inst("eyesmon").negamonPlayEffectKey).toBe("");
  });

  it("clears the shortcut after Negamon is used and placed under the played Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          hand: [{ card: "EX9-047", as: "eyesmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const effectKey = s.inst("eyesmon").negamonPlayEffectKey;
    expect(effectKey).not.toBe("");
    expect(
      s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("negamon").instanceId, effectKey }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.breeding === undefined && s.state.pendingDecision === undefined);
    expect(s.inst("eyesmon").negamonPlayEffectKey).toBe("");
    expect(s.perm("eyesmon").stack.map(({ cardId }) => cardId)).toEqual(["EX9-005"]);
    expect(s.state.memory).toBe(5);
  });

  it("keeps the shortcut cleared after declining a once-per-turn activation", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true });
    const loop = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const effectKey = s.inst("eyesmon").negamonPlayEffectKey;
      expect(effectKey).not.toBe("");
      expect(
        s.engine.applyIntent(0, { type: "activateEffect", sourceInstanceId: s.inst("negamon").instanceId, effectKey }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("EX9-005");
      expect(s.inst("eyesmon").negamonPlayEffectKey).toBe("");
      expect(s.state.memory).toBe(10);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });

  it("offers a reduced-cost play when the normal play is unaffordable", async () => {
    const s = setupEngine({
      0: {
        breeding: { card: "EX9-005", as: "negamon" },
        hand: [{ card: "EX9-057", as: "abbadomon" }],
        trash: ["EX9-005", "EX9-005", "EX9-005"],
      },
    });
    s.state.memory = 0;
    await s.ready();
    expect(s.inst("abbadomon").playableFromHand).toBe(false);
    expect(s.inst("abbadomon").negamonPlayEffectKey).not.toBe("");
  });

  it("does not offer Negamon while Crimson Blaze prohibits playing by effects", async () => {
    const s = setupEngine({
      0: { breeding: { card: "EX9-005", as: "negamon" }, hand: [{ card: "EX9-047", as: "eyesmon" }] },
      1: { hand: [{ card: "BT8-097", as: "blaze" }], battleArea: ["ST1-03"] },
    });
    s.state.turnSeat = 1;
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("blaze").instanceId })).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.engine.mainVerbContinuationsInFlight === 0);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    await s.engine.recomputeContinuousEffects();
    expect(s.inst("eyesmon").playableFromHand).toBe(true);
    expect(s.inst("eyesmon").negamonPlayEffectKey).toBe("");
    expect(observe(s.engine).activatableEffects(s.perm("negamon"))).toHaveLength(1);
  });

  it("does not offer a battle-area Negamon as a breeding effect", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX9-047", under: ["EX9-005"] }],
        hand: [{ card: "EX9-048", as: "scatter" }],
      },
    });
    await s.ready();
    expect(s.inst("scatter").negamonPlayEffectKey).toBe("");
  });
});
