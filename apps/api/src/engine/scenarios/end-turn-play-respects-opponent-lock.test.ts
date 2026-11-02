import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/end-turn-play-respects-opponent-lock.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each([false, true])("Alphamon's end-turn play respects the opponent's effect-play lock: %s", async (locked) => {
  const s = setupScenario(fixture, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    declinePrompts: ["1 of your Digimon may attack", "activate 1 of this Digimon's"],
  });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(1);
    const evolution = locked
      ? s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("imperialdramon").permanentId,
          instanceId: s.inst("fighter-mode").instanceId,
        })
      : { ok: true };
    expect(evolution).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("alphamon").topCard.cardId).toBe("EX13-060");
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("alphamon").topCard.cardId).toBe("EX13-060");
    expect(s.events).toContainEqual(
      expect.objectContaining({
        kind: "effectTriggered",
        sourceCardId: "EX13-060",
        timing: "OnEndTurn",
      }),
    );
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT20-048")).toBe(!locked);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("dorumon").instanceId)).toBe(locked);
    expect(
      s.decisions.some(({ req }) => req.sourceCardId === "EX13-060" && req.options?.selectionGoal === "play"),
    ).toBe(!locked);
    expect(s.state.pendingDecision).toBeUndefined();
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
