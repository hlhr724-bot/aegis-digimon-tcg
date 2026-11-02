import { describe, expect, it } from "vitest";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { compiled } from "./BT15-098.js";

describe("BT15-098", () => {
  it("requires an own-Digimon deletion before optionally playing Myotismon and placing itself", () => {
    expect(compiled.effects?.[0]).toMatchObject({
      trigger: "Main",
      actions: [
        {
          kind: "CostGatedBlock",
          cost: { kind: "deleteOwn" },
          actions: [{ kind: "PlayWithoutCost", from: ["trash"] }, { kind: "PlaceInBattleAreaSelf" }],
        },
      ],
    });
  });
  it("triggers Delay when Myotismon is deleted and plays VenomMyotismon from trash", () => {
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "AllTurns",
      keywords: [{ keyword: "Delay" }],
      actions: [{ kind: "SubTrigger", event: "onDeletionOf", actions: [{ kind: "PlayWithoutCost", from: ["trash"] }] }],
    });
    expect(compiled.effects?.[2]).toMatchObject({
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlaceInBattleAreaSelf" }],
    });
  });

  it.each([
    [false, true, true],
    [true, true, false],
    [false, false, false],
  ])(
    "respects Mist Barrier entry timing and optional refusal: enteredThisTurn=%s accept=%s",
    async (enteredThisTurn, accept, played) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT15-076", as: "myotismon" },
              { card: "BT15-098", as: "barrier", enteredThisTurn },
            ],
            trash: [{ card: "BT15-080", as: "venom" }],
          },
          1: { battleArea: [{ card: "BT1-084", as: "defender", suspended: true }] },
        },
        { autoAcceptOptional: accept, autoDeclineOptional: !accept, autoSelectCards: true },
      );
      await s.ready();
      expect(
        s.engine.applyIntent(0, {
          type: "attack",
          attackerPermanentId: s.perm("myotismon").permanentId,
          target: { kind: "permanent", permanentId: s.perm("defender").permanentId },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.trash.some((card) => card.cardId === "BT15-076") && s.state.pendingDecision === undefined,
      );
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT15-080")).toBe(played);
      expect(s.state.players[0]!.trash.some((card) => card.cardId === "BT15-098")).toBe(played);
    },
  );

  it("naturally deletes an own Digimon, optionally plays Myotismon from trash, and places itself", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT15-068", as: "source" },
            { card: "BT15-070", as: "sacrifice" },
          ],
          hand: [{ card: "BT15-098", as: "option" }],
          trash: [{ card: "BT15-076", as: "myotismon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("sacrifice").permanentId);
    s.state.memory = 10;
    await s.ready();
    const sacrificeId = s.perm("sacrifice").permanentId;
    const optionInstanceId = s.inst("option").instanceId;
    const myotismonInstanceId = s.inst("myotismon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === optionInstanceId) &&
        s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === myotismonInstanceId),
    );

    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === sacrificeId)).toBe(false);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === myotismonInstanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === optionInstanceId)).toBe(true);
  });

  it("does not reach the Then placement when no own Digimon can pay the deletion gate", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-093", as: "purpleTamer" }],
          hand: [{ card: "BT15-098", as: "option" }],
          trash: [{ card: "BT15-076", as: "myotismon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const optionInstanceId = s.inst("option").instanceId;
    const myotismonInstanceId = s.inst("myotismon").instanceId;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === optionInstanceId));

    expect(s.state.players[0]!.trash.some((card) => card.instanceId === myotismonInstanceId)).toBe(true);
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === optionInstanceId)).toBe(false);
  });
});

async function castMistBarrierAnsweringDeletion(deleteOwnDigimon: boolean) {
  const s = setupEngine(
    {
      0: {
        battleArea: [{ card: "BT15-070", as: "sacrifice" }],
        hand: [{ card: "BT15-098", as: "option" }],
        trash: [{ card: "BT15-076", as: "myotismon" }],
      },
    },
    { autoAcceptOptional: true },
  );
  s.state.memory = 10;
  await s.ready();
  const optionId = s.inst("option").instanceId;
  const sacrificeId = s.perm("sacrifice").permanentId;
  const myotismonId = s.inst("myotismon").instanceId;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: optionId })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
  const deletionPrompt = s.state.pendingDecision!;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: deletionPrompt.decisionId,
      response: { kind: "chooseTargets", instanceIds: deleteOwnDigimon ? [sacrificeId] : [] },
    }),
  ).toEqual({ ok: true });
  await answerTrashPlaySelections(s, optionId);
  const board = s.state.players[0]!.battleArea;
  return {
    sacrificeDeleted: !board.some((p) => p.permanentId === sacrificeId),
    myotismonPlayed: board.some((p) => p.topCard?.instanceId === myotismonId),
    mistBarrierPlaced: board.some((p) => p.topCard?.instanceId === optionId),
  };
}

async function answerTrashPlaySelections(s: EngineSetup, optionId: string) {
  const resolved = () =>
    s.state.pendingDecision === undefined &&
    (s.state.players[0]!.trash.some((card) => card.instanceId === optionId) ||
      s.state.players[0]!.battleArea.some((p) => p.topCard?.instanceId === optionId));
  while (!resolved()) {
    await settle(() => resolved() || s.state.pendingDecision?.kind === "selectCards");
    const pending = s.state.pendingDecision;
    if (pending?.kind !== "selectCards") continue;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: pending.decisionId,
      response: { kind: "selectCards", instanceIds: (request.options?.candidateInstanceIds ?? []).slice(0, 1) },
    });
  }
}

describe("BT15-098 Mist Barrier — KB Q&A rulings", () => {
  it("skips the Myotismon play and the Then placement when you don't delete 1 of your Digimon (Q2595)", async () => {
    expect(await castMistBarrierAnsweringDeletion(false)).toEqual({
      sacrificeDeleted: false,
      myotismonPlayed: false,
      mistBarrierPlaced: false,
    });
    expect(await castMistBarrierAnsweringDeletion(true)).toEqual({
      sacrificeDeleted: true,
      myotismonPlayed: true,
      mistBarrierPlaced: true,
    });
  });
});
