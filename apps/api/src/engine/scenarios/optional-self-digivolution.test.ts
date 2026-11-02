import { Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/optional-self-digivolution.fixture";

describe("optional self digivolution", () => {
  it("keeps Tsunomon available after passing the card choice, then consumes it after choosing a Shaman", async () => {
    const s = setupScenario(fixture);
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstTemple").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision !== undefined);
      const first = s.decisions.at(-1)!.req;
      expect(first.kind).toBe("selectCards");
      expect(first.options).toMatchObject({
        min: 0,
        max: 1,
        purpose: "optionalTarget",
        candidateInstanceIds: [s.inst("shaman").instanceId],
      });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: first.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.security.length === 3);
      expect(s.perm("host").topCard.cardId).toBe("P-194");
      expect(s.state.memory).toBe(8);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondTemple").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.pendingDecision !== undefined);
      const second = s.decisions.at(-1)!.req;
      expect(second.kind).toBe("selectCards");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: second.decisionId,
          response: { kind: "selectCards", instanceIds: [s.inst("shaman").instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("host").topCard.cardId === "BT24-014" && s.state.pendingDecision === undefined);
      expect(s.state.memory).toBe(4);
      expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["BT24-003", "BT24-033", "P-194"]);
      const decisionsBeforeRemoval = s.decisions.length;
      const thirdTempleId = s.inst("thirdTemple").instanceId;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: thirdTempleId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === thirdTempleId) &&
          s.state.pendingDecision === undefined,
      );
      expect(s.decisions.slice(decisionsBeforeRemoval).some(({ req }) => req.sourceCardId === "BT24-003")).toBe(false);
      expect(s.perm("host").topCard.cardId).toBe("BT24-014");
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("jupitermon").instanceId)).toBe(true);
      expect(s.state.memory).toBe(2);
    } finally {
      s.engine.applyIntent(s.state.turnSeat as 0 | 1, { type: "surrender" });
      await loop;
    }
  });
});
