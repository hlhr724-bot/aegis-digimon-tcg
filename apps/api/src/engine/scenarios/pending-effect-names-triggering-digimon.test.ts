import { parseTriggerKey } from "@aegis/shared/protocol/triggerKey";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/pending-effect-names-triggering-digimon.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("names the Digimon that triggered each pending effect of identical source cards", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("placer").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
    const manualInstanceIds = [s.inst("first-manual").instanceId, s.inst("second-manual").instanceId];
    expect(request.options?.triggerCardIds).toEqual(["BT26-099", "BT26-099"]);
    expect(request.options?.triggerKeys?.map((key) => parseTriggerKey(key).instanceId).sort()).toEqual(
      [...manualInstanceIds].sort(),
    );
    const subject = s.state.players[0]!.battleArea.find((permanent) => permanent.stack.some((card) => !card.faceUp))!;
    expect(subject.topCard.cardId).not.toBe("BT26-099");
    expect(request.options?.triggerSubjectPermanentIds).toEqual([subject.permanentId, subject.permanentId]);
    expect(JSON.stringify(request.options)).not.toContain(s.inst("evolution").instanceId);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
