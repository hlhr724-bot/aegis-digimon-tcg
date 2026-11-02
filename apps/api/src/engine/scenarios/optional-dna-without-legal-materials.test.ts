import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/optional-dna-without-legal-materials.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";

it("finishes Dianamon's accepted optional DNA clause without selecting unusable materials", async () => {
  const s = setupScenario(fixture, { autoAcceptOptional: true });
  s.state.phase = Phase.Main;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedRookie").instanceId })).toEqual({
    ok: true,
  });
  await settle();
  expect(s.state.pendingDecision).toBeUndefined();
  expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual([
    "BT25-028",
    "BT1-009",
    "BT1-009",
  ]);
  expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT25-103"]);
});

it("offers only legal DNA partners among unrelated Digimon and rejects an unrelated material", async () => {
  const ownBoard = fixture.board[0]!;
  const s = setupScenario(
    {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...ownBoard,
          battleArea: [...(ownBoard.battleArea ?? []), { card: "BT1-025", as: "redPartner" }],
        },
      },
    },
    { autoAcceptOptional: true },
  );
  s.state.phase = Phase.Main;
  await s.ready();
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("playedRookie").instanceId })).toEqual({
    ok: true,
  });
  await settle();
  const decision = s.state.pendingDecision!;
  const request = s.decisions.find(({ req }) => req.decisionId === decision.decisionId)!.req;
  const materialIds = [s.perm("redPartner").permanentId, s.perm("dianamon").permanentId];
  expect(request.kind).toBe("chooseTargets");
  expect(request.options?.candidateInstanceIds).toEqual(expect.arrayContaining(materialIds));
  expect(request.options?.candidateInstanceIds).toHaveLength(2);
  expect(request.options?.allowedTargetCombinations).toEqual([materialIds]);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: {
        kind: "chooseTargets",
        instanceIds: [s.perm("dianamon").permanentId, s.perm("rookie").permanentId],
      },
    }).ok,
  ).toBe(false);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: decision.decisionId,
      response: { kind: "chooseTargets", instanceIds: materialIds },
    }),
  ).toEqual({ ok: true });
  await settle();
  expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-103")).toBe(true);
  expect(s.state.players[0]!.hand.map((card) => card.instanceId)).not.toContain(s.inst("gracenovamon").instanceId);
  expect(s.state.pendingDecision).toBeUndefined();
});
