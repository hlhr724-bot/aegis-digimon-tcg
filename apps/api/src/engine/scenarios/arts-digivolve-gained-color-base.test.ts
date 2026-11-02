import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/arts-digivolve-gained-color-base.fixture";

describe("Arts Digivolve onto a base with gained colors", () => {
  it("offers a Digimon whose effect makes it the required color", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false });
    const loop = s.engine.runOneTurn();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(
        s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("nosferamon").instanceId, useAs: "option" }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.pendingDecision?.kind === "selectCards" ||
          s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT27-082"),
      );
      const arts = s.decisions.at(-1)!.req;
      expect(arts.promptText).toContain("Arts Digivolve");
      expect(arts).toMatchObject({
        seat: 0,
        kind: "selectCards",
        sourceCardId: "BT27-082",
        options: { candidateInstanceIds: [s.perm("purpleSourcedKimeramon").topCard.instanceId] },
      });
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: arts.decisionId,
          response: { kind: "selectCards", instanceIds: [s.perm("purpleSourcedKimeramon").topCard.instanceId] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("purpleSourcedKimeramon").topCard.cardId === "BT27-082");
      expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT27-082")).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
