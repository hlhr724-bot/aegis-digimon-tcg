import "#api/cards/index";
import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { setupScenario } from "#api/engine/testkit/scenario";
import fixture from "#api/engine/scenarios/partition-player-chooses-materials.fixture";

type PendingDecision = { decisionId: string; seat: number; kind: string; promptText?: string; payloadJson?: string };
type SelectionPayload = {
  candidateInstanceIds?: string[];
  selectionContext?: string;
  min?: number;
  max?: number;
  allowedTargetCombinations?: string[][];
};

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

function sortCombinations(combinations: readonly (readonly string[])[] | undefined): string[][] {
  return (combinations ?? [])
    .map((combination) => sortIds(combination))
    .sort((left, right) => left.join().localeCompare(right.join()));
}

describe("Partition lets the player choose which digivolution cards to play", () => {
  it("asks for the whole pair in one selection that only accepts legal pairs", async () => {
    const s = setupScenario(fixture);
    const turn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const yellowBlack = s.inst("yellowBlackBancholeomon").instanceId;
    const heavy = s.inst("heavyleomon").instanceId;
    const greenYellow = s.inst("greenYellowBancholeomon").instanceId;
    const secondYellowBlack = s.inst("secondYellowBlackBancholeomon").instanceId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("gaiaForce").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => isPartitionMaterialChoice(s.state.pendingDecision as PendingDecision | undefined));
    const choice = s.state.pendingDecision as PendingDecision;
    const payload = readPayload(choice);
    expect(sortIds(payload.candidateInstanceIds)).toEqual(
      sortIds([yellowBlack, heavy, greenYellow, secondYellowBlack]),
    );
    expect(payload).toMatchObject({ min: 0, max: 2 });
    expect(sortCombinations(payload.allowedTargetCombinations)).toEqual(
      sortCombinations([
        [yellowBlack, heavy],
        [yellowBlack, greenYellow],
        [secondYellowBlack, heavy],
        [secondYellowBlack, greenYellow],
        [heavy, greenYellow],
      ]),
    );
    for (const invalid of [[yellowBlack, secondYellowBlack], [heavy, heavy], [yellowBlack]]) {
      expect(
        s.engine.applyIntent(1, {
          type: "respondDecision",
          decisionId: choice.decisionId,
          response: { kind: "selectCards", instanceIds: invalid },
        }).ok,
      ).toBe(false);
    }
    expect(
      s.engine.applyIntent(1, {
        type: "respondDecision",
        decisionId: choice.decisionId,
        response: { kind: "selectCards", instanceIds: [secondYellowBlack, greenYellow] },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 2 &&
        !isPartitionMaterialChoice(s.state.pendingDecision as PendingDecision | undefined),
    );

    expect(sortIds(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.instanceId))).toEqual(
      sortIds([secondYellowBlack, greenYellow]),
    );
    const trash = s.state.players[1]!.trash.map((card) => card.instanceId);
    expect(trash).toEqual(expect.arrayContaining([yellowBlack, heavy, s.inst("ultimateChaosmon").instanceId]));
    expect(trash).not.toContain(secondYellowBlack);
    expect(trash).not.toContain(greenYellow);
    s.engine.applyIntent(0, { type: "surrender" });
    await turn;
  });
});
