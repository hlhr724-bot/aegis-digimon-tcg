import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { finishTurnLoop } from "#api/engine/testkit/finishTurnLoop";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/decode-preserves-deletion-trigger.fixture";
import "#api/cards/index";

describe("Decode and the leaving Digimon's deletion trigger", () => {
  it("plays Proximamon after inherited Decode when Arcturusmon is deleted", async () => {
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      declinePrompts: ["Attack"],
    });
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("deletion").instanceId })).toEqual({
        ok: true,
      });
      await settle();
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
        expect.arrayContaining(["RB1-006", "EX12-077"]),
      );
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "P-240" && event.timing === "OnDestroyedAnyone",
        ),
      ).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
  it("does not trigger On Deletion when inherited Decode accompanies security placement", async () => {
    const preferred: string[] = [];
    const s = setupScenario(
      { ...fixture, turnSeat: 1 },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        autoChooseOption: true,
        preferInstanceIds: preferred,
        declinePrompts: ["Attack"],
      },
    );
    preferred.push(s.inst("securityPlacer").instanceId, s.inst("decoded").instanceId);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("arcturusmon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
      const opened = s.events.find((event) => event.kind === "counterWindowOpened");
      if (opened?.kind !== "counterWindowOpened") {
        throw new Error("Expected a counter window");
      }
      const counter = opened.eligibleCounters.find((entry) => entry.instanceId === s.inst("securityPlacer").instanceId);
      expect(counter).toBeDefined();
      expect(
        s.engine.applyIntent(0, {
          type: "respondCounter",
          sourceInstanceId: counter!.instanceId,
          effectKey: counter!.effectKey,
        }),
      ).toEqual({ ok: true });
      await settle();
      expect(s.state.players[1]!.security[0]!.cardId).toBe("P-240");
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["RB1-006"]);
      expect(s.state.players[1]!.hand.some((card) => card.instanceId === s.inst("proximamon").instanceId)).toBe(true);
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "P-240" && event.timing === "OnDestroyedAnyone",
        ),
      ).toBe(false);
      expect(s.state.pendingDecision).toBeUndefined();
    } finally {
      await finishTurnLoop({ setup: s, loop });
    }
  });
});
