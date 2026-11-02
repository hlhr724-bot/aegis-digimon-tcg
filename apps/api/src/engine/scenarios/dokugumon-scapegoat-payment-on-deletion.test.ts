import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/dokugumon-scapegoat-payment-on-deletion.fixture";
import "#api/cards/BT1/BT1-016";
import "#api/cards/EX8/EX8-059";
import "#api/cards/EX8/EX8-071";
import "#api/cards/P/P-163";

describe("Dokugumon deleted to pay for Scapegoat", () => {
  it("activates its On Deletion effect and suspends an opponent's Digimon", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const dokugumonId = s.inst("dokugumon").instanceId;
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "permanent", permanentId: s.perm("scapegoatHolder").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.seat === 1 && s.state.pendingDecision.kind === "selectCards");
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: [dokugumonId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.seat === 1 && s.state.pendingDecision.kind === "chooseTargets");
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("bystander").permanentId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision && !s.state.combatWindow,
      );
      expect(s.state.players[1]!.trash.map((card) => card.instanceId)).toEqual([dokugumonId]);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.permanentId)).toEqual([
        s.perm("scapegoatHolder").permanentId,
      ]);
      expect(s.perm("bystander").isSuspended).toBe(true);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
