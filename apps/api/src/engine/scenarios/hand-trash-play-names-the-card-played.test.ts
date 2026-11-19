import { describe, expect, it } from "vitest";
import "#api/cards/index";
import { buildHandTrashPlayNamesTheCardPlayed } from "#api/engine/scenarios/hand-trash-play-names-the-card-played.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

async function discardWithInvasion(eligibleDiscards: 1 | 2) {
  const preferred: string[] = [];
  const s = setupScenario(buildHandTrashPlayNamesTheCardPlayed({ eligibleDiscards }), {
    autoAcceptOptional: true,
    autoSelectCards: true,
    preferInstanceIds: preferred,
  });
  preferred.push(s.inst("first-discard").instanceId, s.inst("second-discard").instanceId);
  const loop = s.engine.startTurnLoop();
  try {
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("invasion").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("first-discard").instanceId,
      ),
    );
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
  return s;
}

describe("playing a card trashed from the hand", () => {
  it("shows the only card it can play on the activation prompt", async () => {
    const s = await discardWithInvasion(1);
    const activation = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT24-007")!.req;
    const played = { instanceId: s.inst("first-discard").instanceId, cardId: "BT24-010" };
    expect(activation.seat).toBe(0);
    expect(activation.options?.visibleInstanceIds).toEqual([played.instanceId]);
    expect(activation.options?.visibleCards).toEqual([played]);
    expect(activation.options?.candidateInstanceIds).toBeUndefined();
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "BT24-007")).toHaveLength(1);
    expect(s.state.memory).toBe(1);
  });

  it("offers every card it can play when more than one was trashed", async () => {
    const s = await discardWithInvasion(2);
    const requests = s.decisions.filter(({ req }) => req.sourceCardId === "BT24-007").map(({ req }) => req);
    expect(requests.map((request) => request.kind)).toEqual(["optional", "selectCards"]);
    expect(requests[0]!.options?.visibleCards).toBeUndefined();
    const discards = [s.inst("first-discard").instanceId, s.inst("second-discard").instanceId];
    expect(requests[1]!.options?.candidateInstanceIds).toEqual(discards);
    expect(requests[1]!.options?.visibleCards).toEqual(
      expect.arrayContaining([
        { instanceId: discards[0], cardId: "BT24-010" },
        { instanceId: discards[1], cardId: "BT24-015" },
      ]),
    );
    expect(requests[1]!.options?.candidateInstanceIds).not.toContain(s.inst("older-trash-card").instanceId);
  });
});
