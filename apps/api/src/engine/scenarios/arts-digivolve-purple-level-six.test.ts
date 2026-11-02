import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/arts-digivolve-purple-level-six.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

describe("Arts Digivolve onto a purple level six", () => {
  it("offers Plutomon after resolving Ravemon Burst Mode as an Option", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });
    await s.ready();
    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("ravemon").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.decisions.some(({ req }) => req.promptText.includes("Arts Digivolve"))).toBe(true);
    expect(s.perm("plutomon").topCard.cardId).toBe("BT27-085");
    expect(s.perm("plutomon").stack.map(({ cardId }) => cardId)).toEqual(["BT4-089"]);
    expect(s.state.memory).toBe(4);
    expect(s.state.players[0]!.trash.some(({ cardId }) => cardId === "BT27-085")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
