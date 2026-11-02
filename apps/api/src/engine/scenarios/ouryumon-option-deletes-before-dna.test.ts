import type { DecisionResponse } from "@aegis/shared/protocol/intents";
import { expect, it } from "vitest";
import "#api/cards/index";
import fixture from "#api/engine/scenarios/ouryumon-option-deletes-before-dna.fixture";
import acceptedFixture from "#api/engine/scenarios/accepted-ouryumon-option-deletes-before-dna.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { drainMicrotasks, settle } from "#api/engine/testkit/harness";

type ResolveMandatoryOptionDeletionParams = {
  s: ReturnType<typeof setupScenario>;
  usedOptionId: string;
};

async function resolveMandatoryOptionDeletion({
  s,
  usedOptionId,
}: ResolveMandatoryOptionDeletionParams): Promise<void> {
  const pending = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
  expect(pending.kind).toBe("chooseTargets");
  expect(pending.sourceCardId).toBe("BT27-103");
  expect(pending.sourceInstanceId).toBe(usedOptionId);
  expect(pending.options?.effectTextEmphasis).toBe("Delete 1 of your opponent's Digimon.");
  expect(pending.options?.min).toBe(1);
  expect(s.state.players[1]!.battleArea).toHaveLength(2);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending.decisionId,
      response: { kind: "chooseTargets", instanceIds: [] },
    }),
  ).toMatchObject({ ok: false });
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending.decisionId,
      response: { kind: "chooseTargets", instanceIds: [s.perm("first-enemy").permanentId] },
    }),
  ).toEqual({ ok: true });
  await drainMicrotasks();
}

it.each([
  [false, false, 2],
  [true, false, 2],
  [false, true, 2],
  [false, true, 1],
])(
  "Ouryumon deletes before independent optional DNA (DNA=%s acceptedPlan=%s enemies=%s)",
  async (acceptDna, acceptedPlan, enemyCount) => {
    const selectedFixture = acceptedPlan ? acceptedFixture : fixture;
    const s = setupScenario(
      {
        ...selectedFixture,
        board: {
          ...selectedFixture.board,
          1: { ...selectedFixture.board[1], battleArea: selectedFixture.board[1]!.battleArea!.slice(0, enemyCount) },
        },
      },
      { autoAcceptOptional: false, autoSelectCards: false, autoOrderTriggers: false },
    );
    const usedOptionId = s.inst("used-option").instanceId;
    const unusedOptionId = s.inst("unused-option").instanceId;
    const materialIds = [s.perm("alphamon").permanentId, s.perm("ouryumon").permanentId];
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      let preparationResult = { ok: true };
      if (s.state.pendingDecision !== undefined) {
        preparationResult = s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision.decisionId,
          response: { kind: "chooseTargets", instanceIds: [s.perm("ouryumon").permanentId] },
        });
        await drainMicrotasks();
      }
      expect(preparationResult).toEqual({ ok: true });

      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("ouryumon").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision !== undefined);
      let planResult = { ok: true };
      if (acceptedPlan) {
        const plan = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
        const keys = plan.options?.triggerKeys ?? [];
        const first = keys.findIndex((key) => key.includes(s.perm("ouryumon").topCard.instanceId));
        planResult = s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: plan.decisionId,
          response: {
            kind: "orderTriggers",
            order: [],
            orderIndexes: [first, 1 - first],
            optionalAnswersByIndex: keys.map((_, index) => index === first),
          },
        });
      }
      expect(planResult).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "selectCards", instanceIds: [usedOptionId] },
        }),
      ).toEqual({ ok: true });
      await drainMicrotasks();
      if (enemyCount === 2) {
        await resolveMandatoryOptionDeletion({ s, usedOptionId });
      }
      expect(s.state.pendingDecision?.kind).toBe("optional");
      const dna = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision?.decisionId)!.req;
      expect(dna.kind).toBe("optional");
      expect(dna.sourceCardId).toBe("BT27-103");
      expect(dna.options?.effectTextPart).toBe("Then, 2 of your Digimon may DNA digivolve into this card.");
      expect(s.state.players[1]!.battleArea).toHaveLength(enemyCount - 1);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: dna.decisionId,
          response: { kind: "optional", accept: acceptDna },
        }),
      ).toEqual({ ok: true });
      await drainMicrotasks();
      for (let step = 0; step < 12 && s.state.pendingDecision !== undefined; step += 1) {
        const request = s.decisions.find(({ req }) => req.decisionId === s.state.pendingDecision!.decisionId)!.req;
        expect(["chooseTargets", "selectCards", "optional", "orderTriggers"]).toContain(request.kind);
        expect(request.kind !== "selectCards" || request.promptText.includes("Arts Digivolve")).toBe(true);
        let response: DecisionResponse;
        if (request.kind === "chooseTargets") {
          const candidates = request.options?.candidateInstanceIds ?? [];
          response = {
            kind: "chooseTargets",
            instanceIds: materialIds.filter((id) => candidates.includes(id)).slice(0, request.options?.max ?? 1),
          };
        } else if (request.kind === "selectCards") {
          response = { kind: "selectCards", instanceIds: [] };
        } else if (request.kind === "orderTriggers") {
          response = { kind: "orderTriggers", order: [], orderIndexes: [0] };
        } else {
          response = { kind: "optional", accept: false };
        }
        expect(s.engine.applyIntent(0, { type: "respondDecision", decisionId: request.decisionId, response })).toEqual({
          ok: true,
        });
        await drainMicrotasks();
      }
      expect(s.state.pendingDecision).toBeUndefined();
      expect(s.state.players[0]!.resolvingOption).toBeUndefined();
      const expectedBoard = acceptDna ? ["BT27-103"] : ["BT13-075", "BT27-015"];
      expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId).sort()).toEqual(
        [...expectedBoard, ...(acceptedPlan ? ["BT14-082"] : [])].sort(),
      );
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === usedOptionId)).toBe(
        acceptDna,
      );
      expect(
        s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === usedOptionId)?.stack.map(
          (card) => card.cardId,
        ),
      ).toEqual(acceptDna ? ["BT27-015", "BT13-075"] : undefined);
      expect(s.state.players[0]!.trash.some((card) => card.instanceId === usedOptionId)).toBe(!acceptDna);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === unusedOptionId)).toBe(true);
      expect(s.state.players[0]!.security).toHaveLength(acceptDna ? 5 : 3);
      expect(s.state.players[1]!.security).toHaveLength(2);
      expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
        enemyCount === 2 ? ["BT1-010"] : [],
      );
      expect(s.state.memory).toBe(6);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
