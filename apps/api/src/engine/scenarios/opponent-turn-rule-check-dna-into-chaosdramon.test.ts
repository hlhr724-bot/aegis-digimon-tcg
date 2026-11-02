import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { setupScenario } from "#api/engine/testkit/scenario";
import { opponentTurnRuleCheckDnaIntoChaosdramon } from "#api/engine/scenarios/opponent-turn-rule-check-dna-into-chaosdramon.fixture";

describe("opponent-turn rule-check DNA into Chaosdramon", () => {
  it("resolves the turn player's Aquilamon first and keeps Machinedramon's lock on Chaosdramon", async () => {
    const atChaosdramonOnPlay: { suspended: boolean; locked: boolean }[] = [];
    const preferInstanceIds: string[] = [];
    const s = setupScenario(opponentTurnRuleCheckDnaIntoChaosdramon, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds,
      onEvent: (event) => {
        if (event.kind !== "effectTriggered" || event.sourceCardId !== "EX12-060") return;
        const chaosdramon = s.state.players[0]!.battleArea.find(
          ({ topCard }) => topCard.instanceId === s.inst("chaosdramon").instanceId,
        );
        if (chaosdramon === undefined) return;
        atChaosdramonOnPlay.push({
          suspended: chaosdramon.isSuspended,
          locked: advance(s.engine).ledgers.continuous.stackTrashLocked(chaosdramon.permanentId),
        });
      },
    });
    preferInstanceIds.push(s.perm("hiandromon").permanentId, s.inst("hiandromon").instanceId);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("andromon").permanentId,
          instanceId: s.inst("machinedramon").instanceId,
          useAlternateCost: true,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("andromon").stack.length === 3 && s.state.pendingDecision === undefined);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });

      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "digivolve",
          permanentId: s.perm("minervamon").permanentId,
          instanceId: s.inst("mervamon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => atChaosdramonOnPlay.length > 0);

      expect(atChaosdramonOnPlay).toEqual([{ suspended: true, locked: true }]);
      expect(
        s.events.some((event) => event.kind === "effectTriggered" && event.effectKey.includes("later entrant")),
      ).toBe(false);
      const chaosdramon = s.state.players[0]!.battleArea.find(
        ({ topCard }) => topCard.instanceId === s.inst("chaosdramon").instanceId,
      )!;
      expect(observe(s.engine).hasKeyword(chaosdramon, "Piercing")).toBe(true);
    } finally {
      s.engine.applyIntent(1, { type: "surrender" });
      await loop;
    }
  });
});
