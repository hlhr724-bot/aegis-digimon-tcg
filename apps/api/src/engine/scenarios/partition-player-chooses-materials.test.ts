import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/partition-player-chooses-materials.fixture";

type PendingDecision = { decisionId: string; seat: number; kind: string; promptText?: string; payloadJson?: string };
type SelectionPayload = { candidateInstanceIds?: string[]; visibleInstanceIds?: string[]; selectionContext?: string };

function readPayload(decision: PendingDecision): SelectionPayload {
  return JSON.parse(decision.payloadJson ?? "{}") as SelectionPayload;
}

function isPartitionMaterialChoice(decision: PendingDecision | undefined): boolean {
  return (
    decision?.kind === "selectCards" &&
    decision.seat === 1 &&
    readPayload(decision).selectionContext === undefined &&
    (decision.promptText ?? "").startsWith("＜Partition＞")
  );
}

function sortIds(ids: readonly string[] | undefined): string[] {
  return [...(ids ?? [])].sort();
}

describe("Partition lets the player choose which digivolution cards to play", () => {
  it("plays the chosen Yellow/Black and Green Lv.6 cards when several pairs qualify", async () => {
    const s = setupScenario(fixture);
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const yellowBlack = s.inst("yellowBlackBancholeomon").instanceId;
    const firstHeavy = s.inst("firstHeavyleomon").instanceId;
    const greenYellow = s.inst("greenYellowBancholeomon").instanceId;
    const secondHeavy = s.inst("secondHeavyleomon").instanceId;
    const offered: string[][] = [];

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.seat === 1);
    const activation = s.state.pendingDecision as PendingDecision;
    const activationPayload = readPayload(activation);
    expect(activationPayload.selectionContext).toBe("partitionActivation");
    expect(sortIds(activationPayload.visibleInstanceIds)).toEqual(
      sortIds([yellowBlack, firstHeavy, greenYellow, secondHeavy]),
    );
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: activation.decisionId,
        response: { kind: "selectCards", instanceIds: activationPayload.candidateInstanceIds!.slice(0, 1) },
      }),
    ).toEqual({ ok: true });

    for (const pick of [yellowBlack, secondHeavy]) {
      await settle(() => isPartitionMaterialChoice(s.state.pendingDecision as PendingDecision | undefined));
      const choice = s.state.pendingDecision as PendingDecision;
      offered.push(sortIds(readPayload(choice).candidateInstanceIds));
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: choice.decisionId,
          response: { kind: "selectCards", instanceIds: [pick] },
        }),
      ).toEqual({ ok: true });
    }
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 2 &&
        !isPartitionMaterialChoice(s.state.pendingDecision as PendingDecision | undefined),
    );

    expect(offered).toEqual([
      sortIds([yellowBlack, firstHeavy, greenYellow, secondHeavy]),
      sortIds([firstHeavy, greenYellow, secondHeavy]),
    ]);
    expect(sortIds(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId))).toEqual(
      sortIds([yellowBlack, secondHeavy]),
    );
    const trash = s.state.players[1]!.trash.map((card) => card.instanceId);
    expect(trash).toEqual(expect.arrayContaining([firstHeavy, greenYellow, s.inst("ultimateChaosmon").instanceId]));
    expect(trash).not.toContain(yellowBlack);
    expect(trash).not.toContain(secondHeavy);
    s.engine.applyIntent(0, { type: "surrender" });
    await turn;
  });
});
