import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/arts-dedigivolution-pending-play.fixture";

describe("Arts digivolution retires the played card's pending effect", () => {
  it.each([true, false])("keeps On Play retired only when Arts Digivolve was accepted: %s", async (artsDigivolves) => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false });
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      const securityIds = s.state.players[0]!.security.map(({ instanceId }) => instanceId);
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mickey").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(s.state.pendingDecision!.promptText).toContain("Arts Digivolve");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: artsDigivolves ? [s.inst("blanc").instanceId] : [] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.trash.some(({ cardId }) => cardId === "EX13-066") &&
          s.state.pendingDecision === undefined,
      );
      await settle();
      expect(s.perm("blanc").topCard.cardId).toBe("BT23-076");
      expect(s.perm("blanc").stack).toHaveLength(0);
      expect(s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT13-065")).toBe(artsDigivolves);
      expect(
        s.events.filter(
          (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT23-076" && event.timing === "OnPlay",
        ),
      ).toHaveLength(artsDigivolves ? 0 : 1);
      const remainingSecurityIds = s.state.players[0]!.security.map(({ instanceId }) => instanceId);
      expect(remainingSecurityIds).toHaveLength(securityIds.length);
      expect(remainingSecurityIds.every((instanceId, index) => instanceId === securityIds[index])).toBe(artsDigivolves);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
