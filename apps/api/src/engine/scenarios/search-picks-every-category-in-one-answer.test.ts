import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/search-picks-every-category-in-one-answer.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";

type Scenario = ReturnType<typeof setupScenario>;

async function openSearch(s: Scenario) {
  await advance(s.engine).waitForMainPhase(0);
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("searcher").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  return s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
}

function answer(s: Scenario, response: DecisionResponse) {
  return s.engine.applyIntent(0, {
    type: "respondDecision",
    decisionId: s.state.pendingDecision!.decisionId,
    response,
  });
}

function expectSearchResolved(s: Scenario) {
  expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("other-either-category").instanceId);
  expect(s.perm("searcher").stack.map((card) => [card.instanceId, card.faceUp])).toEqual([
    [s.inst("either-category").instanceId, false],
  ]);
  expect(s.state.players[0]!.deck.at(-1)?.instanceId).toBe(s.inst("hand-only").instanceId);
}

it("takes one card for each search category from a single grouped answer", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false, autoOrderCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    const request = await openSearch(s);
    const handOnly = s.inst("hand-only").instanceId;
    const either = s.inst("either-category").instanceId;
    const otherEither = s.inst("other-either-category").instanceId;
    expect(request.options?.selectionSlots).toEqual([
      {
        description: "add 1 card with the [DM] trait to the hand",
        candidateInstanceIds: [handOnly, either, otherEither],
        max: 1,
        isMandatory: true,
      },
      {
        description: "place 1 card with the [Ver.4] trait face down as the bottom digivolution card",
        candidateInstanceIds: [either, otherEither],
        max: 1,
        isMandatory: true,
      },
    ]);
    const refused: DecisionResponse[] = [
      { kind: "selectCards", instanceIds: [either], followingSlotInstanceIds: [[either]] },
      { kind: "selectCards", instanceIds: [otherEither], followingSlotInstanceIds: [[handOnly]] },
      { kind: "selectCards", instanceIds: [otherEither], followingSlotInstanceIds: [[either, handOnly]] },
      { kind: "selectCards", instanceIds: [otherEither], followingSlotInstanceIds: [[]] },
      { kind: "selectCards", instanceIds: [otherEither], followingSlotInstanceIds: [] },
      { kind: "selectCards", instanceIds: [], followingSlotInstanceIds: [[either]] },
    ];
    for (const response of refused) {
      expect(answer(s, response).ok).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(request.decisionId);
    }
    const asked = s.decisions.length;
    expect(
      answer(s, { kind: "selectCards", instanceIds: [otherEither], followingSlotInstanceIds: [[either]] }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.decisions.slice(asked).filter(({ req }) => req.kind === "selectCards")).toEqual([]);
    expectSearchResolved(s);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});

it("still takes one category per answer from a seat that answers the first category alone", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: false, autoOrderCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    const request = await openSearch(s);
    expect(answer(s, { kind: "selectCards", instanceIds: [s.inst("other-either-category").instanceId] })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.pendingDecision?.kind === "selectCards" && s.state.pendingDecision.decisionId !== request.decisionId,
    );
    const second = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
    expect(second.options?.selectionSlots).toBeUndefined();
    expect(second.options?.candidateInstanceIds).toEqual([s.inst("either-category").instanceId]);
    expect(answer(s, { kind: "selectCards", instanceIds: [s.inst("either-category").instanceId] })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined);
    expectSearchResolved(s);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
