import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/chronicle-security-plays-tamers.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";

it.each(["hand-tamer", "trash-tamer"])(
  "plays the offered Chronicle %s without allowing Options or expensive Digimon",
  async (alias) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false });
    await s.ready();
    const loop = s.engine.runOneTurn();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("fellowship-attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const pending = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
      expect(request.options?.candidateInstanceIds).toEqual(
        expect.arrayContaining([s.inst("hand-tamer").instanceId, s.inst("trash-tamer").instanceId]),
      );
      expect(request.options?.candidateInstanceIds).toHaveLength(2);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst(alias).instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          !s.state.pendingDecision &&
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("fellowship").instanceId),
      );
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst(alias).instanceId)).toBe(true);
    } finally {
      s.engine.applyIntent(s.state.turnSeat, { type: "surrender" });
      await loop;
    }
  },
);
