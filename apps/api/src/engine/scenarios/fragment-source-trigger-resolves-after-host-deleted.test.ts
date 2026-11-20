import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/fragment-source-trigger-resolves-after-host-deleted.fixture";
import "#api/cards/index";

describe("a source trashed by ＜Fragment＞ before its host is deleted by 0 DP", () => {
  it("still resolves its inherited De-Digivolve after the host leaves the battle area", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferTriggerKeys: ["subtrigger"],
    });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("dpReducer").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision === undefined && s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "P-167"));

      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([]);
      expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "P-167")).toBe(true);
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain("BT1-009");
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
