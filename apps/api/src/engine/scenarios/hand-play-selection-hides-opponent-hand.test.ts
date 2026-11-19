import "#api/cards/BT17/BT17-094";
import { expect, it } from "vitest";
import fixture from "#api/engine/scenarios/hand-play-selection-hides-opponent-hand.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

it("shows only the player's own hand when an Option plays a card from hand", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guardianDeity").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.decisions.some((decision) => decision.req.kind === "selectCards"));

    const selection = s.decisions.find((decision) => decision.req.kind === "selectCards")!.req.options!;
    const opponentHand = s.state.players[1]!.hand.map((card) => card.instanceId);
    expect(selection.candidateInstanceIds).toEqual([s.inst("ownTamer").instanceId]);
    expect(selection.visibleInstanceIds?.filter((instanceId) => opponentHand.includes(instanceId))).toEqual([]);
    expect(selection.visibleCards?.filter((card) => opponentHand.includes(card.instanceId)) ?? []).toEqual([]);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
