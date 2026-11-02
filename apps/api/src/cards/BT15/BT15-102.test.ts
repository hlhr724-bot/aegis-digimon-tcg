import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, settleAcrossTimers } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT15-102.js";

describe("BT15-102", () => {
  it("matches the catalog identity and complete compiled contract", () => {
    expect(getCardDefinition("BT15-102")).toMatchObject({
      cardId: "BT15-102",
      nameEn: "Apocalymon",
      colors: ["White"],
      kinds: ["Digimon"],
      level: 7,
      playCost: 15,
      dp: 15000,
      evoCosts: [
        { color: "Blue", level: 6, memoryCost: 6 },
        { color: "Green", level: 6, memoryCost: 6 },
        { color: "Black", level: 6, memoryCost: 6 },
        { color: "Purple", level: 6, memoryCost: 6 },
      ],
      forms: ["Mega"],
      attributes: ["Unknown"],
      types: ["Unidentified"],
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("reduces its play cost by 4 per distinct Dark Masters placed from battle area/trash", () =>
    expect(compiled.effects?.[0]?.actions[0]).toMatchObject({
      kind: "Replacement",
      event: "wouldBePlayed",
      actions: [
        {
          kind: "Replacement",
          mode: "reduceCost",
          amount: 4,
          amountPerPlaced: 4,
          cost: { kind: "place", target: { count: 3, upTo: true }, host: "self" },
        },
      ],
    }));

  it("places distinct Dark Masters from trash and battle-area tops before paying play cost", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-102", as: "apocalymon" }],
          trash: [
            { card: "BT15-031", as: "metalSeadramon" },
            { card: "BT15-052", as: "puppetmon" },
          ],
          battleArea: [{ card: "BT15-066", as: "machinedramon", under: [{ card: "AD1-001", as: "shedSource" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() =>
      s.state.players[0]!.battleArea.some(({ topCard, stack }) => topCard.cardId === "BT15-102" && stack.length === 3),
    );

    const apocalymon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT15-102");
    expect(apocalymon?.stack.map(({ cardId }) => cardId).sort()).toEqual(["BT15-031", "BT15-052", "BT15-066"]);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-066")).toBe(false);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("shedSource").instanceId);
  });
  it("does not offer its cost reduction when another card is played while it is on the field", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-031", as: "metalSeadramonHand" }],
          trash: [
            { card: "BT15-031", as: "metalSeadramon" },
            { card: "BT15-052", as: "puppetmon" },
          ],
          battleArea: [{ card: "BT15-102", as: "apocalymon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 11;
    await s.ready();

    expect(s.inst("metalSeadramonHand").projectedPlayCost).toBe(11);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("metalSeadramonHand").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-031"));

    expect(s.decisions.filter(({ req }) => req.kind === "optional")).toHaveLength(0);
    expect(s.state.memory).toBe(0);
    const apocalymon = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT15-102");
    expect(apocalymon?.stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(2);
  });
  it("at end of turn may place a level 6 or lower trash card underneath and trashes opponent deck per level 6 source", () =>
    expect(compiled.effects?.[1]).toMatchObject({
      trigger: "EndOfYourTurn",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "ActivateEffect",
          effectType: "OnPlay",
          lastPlacedOnly: true,
          target: { filter: { controller: "mine", zone: "digivolutionCards" } },
          cost: { kind: "place" },
        },
        { kind: "TrashTopDeck", controller: "opponent", amount: 2, scaling: { per: 1, unit: "digivolutionCards" } },
      ],
    }));

  it("at the natural end of its turn places a level 6-or-lower trash card, activates its On Play, then mills per level 6 stack cards", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-102", as: "apocalymon", under: ["BT15-066"] }],
          trash: [{ card: "BT15-031", as: "onPlaySource" }],
          deck: ["AD1-001"],
        },
        1: {
          battleArea: [{ card: "BT1-009", as: "onPlayTarget" }],
          deck: ["AD1-001", "AD1-001", "AD1-001", "AD1-001", "AD1-001"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 0;

    const onPlayTargetId = s.perm("onPlayTarget").permanentId;
    s.state.memory = 3;
    await advance(s.engine).runTurn(0);

    const firstDecision = s.decisions.find(({ req }) => req.kind === "optional" && req.sourceCardId === "BT15-102");
    expect(firstDecision?.req.options?.effectTextEmphasis).toBe(
      "By placing 1 level 6 or lower card from your trash as this Digimon's bottom digivolution card, activate 1 [On Play] effect on that card as an effect of this Digimon.",
    );
    expect(firstDecision?.req.options?.effectText).not.toContain("When this card would be played");
    expect(s.events.filter((event) => event.kind === "cardRevealed")).toHaveLength(0);
    const placementIndex = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        event.from === "trash" &&
        event.placedUnder?.permanentId === s.perm("apocalymon").permanentId,
    );
    expect(placementIndex).toBeGreaterThanOrEqual(0);
    expect(s.events[placementIndex]).toMatchObject({ cardIds: ["BT15-031"], seat: 0 });
    const millIndex = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.from === "deck" && event.to === "trash",
    );
    const copiedResultIndex = s.events.findIndex(
      (event) =>
        event.kind === "cardsMoved" &&
        event.to === "hand" &&
        event.instanceIds.includes(s.inst("onPlayTarget").instanceId),
    );
    expect(copiedResultIndex).toBeGreaterThan(placementIndex);
    const targetIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectTargetsSelected" &&
        event.sourcePermanentId === s.perm("apocalymon").permanentId &&
        event.targetPermanentIds.includes(onPlayTargetId),
    );
    expect(targetIndex).toBeGreaterThan(placementIndex);
    expect(copiedResultIndex).toBeGreaterThan(targetIndex);
    const thenIndex = s.events.findIndex(
      (event) => event.kind === "effectTriggered" && event.effectTextPart?.startsWith("Then, trash") === true,
    );
    expect(thenIndex).toBeGreaterThan(copiedResultIndex);
    expect(millIndex).toBeGreaterThan(thenIndex);
    expect(s.events[millIndex]).toMatchObject({ cardIds: Array(4).fill("AD1-001"), seat: 1 });
    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-031", "BT15-066"]);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("onPlayTarget").instanceId);
    expect(s.state.players[1]!.trash).toHaveLength(4);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).not.toContain(
      s.inst("onPlaySource").instanceId,
    );
  });

  it("does not activate the following mill when no level 6-or-lower trash card can be placed", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT15-102", as: "apocalymon", under: ["BT15-066"] }] },
        1: { deck: ["AD1-001", "AD1-001", "AD1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 0;

    await advance(s.engine).runTurn(0);

    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-066"]);
    expect(s.state.players[1]!.deck).toHaveLength(3);
    expect(s.state.players[1]!.trash).toHaveLength(0);
  });

  it("does not repeat its end-of-turn processing in the same turn, then processes again next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-102", as: "apocalymon", under: ["BT15-066"] }],
          trash: [
            { card: "BT15-031", as: "firstSource" },
            { card: "BT15-052", as: "secondSource" },
          ],
          deck: ["AD1-001", "AD1-001"],
        },
        1: { deck: ["AD1-001", "AD1-001", "AD1-001", "AD1-001", "AD1-001", "AD1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.turnSeat = 0;

    await advance(s.engine).runTurn(0);
    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-031", "BT15-066"]);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 3;
    await advance(s.engine).runTurn(0);
    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-052", "BT15-031", "BT15-066"]);
  });

  it("ends the turn automatically when digivolving into it pushes memory across", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-066", as: "base" }],
          hand: [{ card: "BT15-102", as: "apocalymon" }],
          deck: ["AD1-001", "AD1-001"],
        },
        1: { deck: ["AD1-001", "AD1-001", "AD1-001", "AD1-001", "AD1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    let turnClosed = false;
    const turn = s.engine.runOneTurn().then(() => {
      turnClosed = true;
    });
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("apocalymon").instanceId,
      }),
    ).toEqual({ ok: true });

    await settle(() => turnClosed);
    expect(turnClosed).toBe(true);
    await turn;
  });
});

type TurnEndOrder = "apocalymonFirst" | "deleteFirst";

const DELAYED_DELETE_KEY = "delayed-delete-played";

async function resolveTurnEndInOrder(darkMastersCardId: string, order: TurnEndOrder) {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: darkMastersCardId, as: "darkMaster" }, { card: "BT15-102", as: "apocalymon" }, "BT1-013"],
        deck: ["BT1-013", "BT1-014", "BT1-009"],
        trash: ["BT1-009"],
      },
      1: { deck: ["BT1-013", "BT1-014", "BT1-009", "BT1-012"] },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
  );
  const loop = s.engine.startTurnLoop();
  await advance(s.engine).waitForMainPhase(0);

  s.state.memory = 6;
  const handMain = (JSON.parse(s.inst("darkMaster").activatableEffectsJson || "[]") as { effectKey: string }[])[0];
  expect(handMain).toBeDefined();
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: s.inst("darkMaster").instanceId,
      effectKey: handMain!.effectKey,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === darkMastersCardId));

  s.state.memory = 6;
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("darkMaster").permanentId,
      instanceId: s.inst("apocalymon").instanceId,
    }),
  ).toEqual({ ok: true });
  await settle(() => s.perm("darkMaster").topCard.cardId === "BT15-102");

  advance(s.engine).endMainPhaseIfOpen(0);
  await settleAcrossTimers(() => s.state.pendingDecision?.kind === "orderTriggers");
  const request = s.decisions.find(({ req }) => req.kind === "orderTriggers");
  expect(request?.seat).toBe(0);
  const triggerKeys = request!.req.options?.triggerKeys ?? [];
  expect(triggerKeys).toHaveLength(2);
  const deleteKey = triggerKeys.find((key) => key.includes(DELAYED_DELETE_KEY));
  const apocalymonKey = triggerKeys.find((key) => key.includes("BT15-102/") && !key.includes(DELAYED_DELETE_KEY));
  expect(deleteKey).toBeDefined();
  expect(apocalymonKey).toBeDefined();

  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: request!.req.decisionId,
      response: { kind: "orderTriggers", order: [order === "apocalymonFirst" ? apocalymonKey! : deleteKey!] },
    }),
  ).toEqual({ ok: true });
  await settleAcrossTimers(() => s.state.turnSeat === 1);

  const outcome = {
    apocalymonLeftPlay: s.state.players[0]!.battleArea.length === 0,
    opponentCardsMilled: s.state.players[1]!.trash.length,
  };
  s.engine.applyIntent(0, { type: "surrender" });
  await loop;
  return outcome;
}

async function turnEndOutcomesByOrder(darkMastersCardId: string) {
  return {
    apocalymonFirst: await resolveTurnEndInOrder(darkMastersCardId, "apocalymonFirst"),
    deleteFirst: await resolveTurnEndInOrder(darkMastersCardId, "deleteFirst"),
  };
}

const outcomesWhenTurnPlayerChoosesOrder = {
  apocalymonFirst: { apocalymonLeftPlay: true, opponentCardsMilled: 2 },
  deleteFirst: { apocalymonLeftPlay: true, opponentCardsMilled: 0 },
};

describe("BT15-102 Apocalymon — KB Q&A rulings", () => {
  it("places only top cards of battle-area permanents under it, never digivolution cards or cards under Tamers (Q2599)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-102", as: "apocalymon" }],
          battleArea: [
            { card: "BT15-066", as: "topMachinedramon" },
            { card: "BT1-009", as: "monodramon", under: [{ card: "BT15-031", as: "sourceMetalSeadramon" }] },
            { card: "BT1-085", as: "tamer", under: [{ card: "BT15-052", as: "tamerPuppetmon" }] },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 11;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const selection = s.decisions.find(({ req }) => req.kind === "selectCards")!.req;
    const candidates = selection.options?.candidateInstanceIds ?? [];
    expect(candidates).toContain(s.inst("topMachinedramon").instanceId);
    expect(candidates).not.toContain(s.inst("sourceMetalSeadramon").instanceId);
    expect(candidates).not.toContain(s.inst("tamerPuppetmon").instanceId);

    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: selection.decisionId,
      response: {
        kind: "selectCards",
        instanceIds: [s.inst("topMachinedramon").instanceId, s.inst("sourceMetalSeadramon").instanceId],
      },
    });
    if (s.state.pendingDecision?.decisionId === selection.decisionId) {
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("topMachinedramon").instanceId] },
      });
    }
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-102"));

    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-066"]);
    expect(s.perm("monodramon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-031"]);
    expect(s.perm("tamer").stack.map(({ cardId }) => cardId)).toEqual(["BT15-052"]);
    expect(s.state.memory).toBe(0);
  });

  it("skips the opponent deck trash when it does not place a level 6 or lower trash card under it (Q2600)", async () => {
    const declined = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-102", as: "apocalymon", under: ["BT15-066"] }],
          trash: [{ card: "BT15-031", as: "eligibleSource" }],
          deck: ["AD1-001"],
        },
        1: { deck: ["AD1-001", "AD1-001", "AD1-001", "AD1-001"] },
      },
      { autoDeclineOptional: true },
    );
    await declined.ready();
    declined.state.turnSeat = 0;
    await advance(declined.engine).runTurn(0);

    expect(declined.decisions.some(({ req }) => req.kind === "optional" || req.kind === "selectCards")).toBe(true);

    expect(declined.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-066"]);
    expect(declined.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(
      declined.inst("eligibleSource").instanceId,
    );
    expect(declined.state.players[1]!.deck).toHaveLength(4);
    expect(declined.state.players[1]!.trash).toHaveLength(0);

    const accepted = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT15-102", as: "apocalymon", under: ["BT15-066"] }],
          trash: [{ card: "BT15-031", as: "eligibleSource" }],
          deck: ["AD1-001"],
        },
        1: { deck: ["AD1-001", "AD1-001", "AD1-001", "AD1-001", "AD1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await accepted.ready();
    accepted.state.turnSeat = 0;
    await advance(accepted.engine).runTurn(0);

    expect(accepted.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["BT15-031", "BT15-066"]);
    expect(accepted.state.players[1]!.trash).toHaveLength(4);
  });

  it("lets the turn player order EX10-012 MetalSeadramon's turn-end delete against its [End of Your Turn] (Q5036)", async () => {
    expect(await turnEndOutcomesByOrder("EX10-012")).toEqual(outcomesWhenTurnPlayerChoosesOrder);
  });

  it("lets the turn player order EX10-020 Puppetmon's turn-end delete against its [End of Your Turn] (Q5063)", async () => {
    expect(await turnEndOutcomesByOrder("EX10-020")).toEqual(outcomesWhenTurnPlayerChoosesOrder);
  });

  it("lets the turn player order EX10-035 Machinedramon's turn-end delete against its [End of Your Turn] (Q5110)", async () => {
    expect(await turnEndOutcomesByOrder("EX10-035")).toEqual(outcomesWhenTurnPlayerChoosesOrder);
  });

  it("lets the turn player order EX10-057 Piedmon's turn-end delete against its [End of Your Turn] (Q5155)", async () => {
    expect(await turnEndOutcomesByOrder("EX10-057")).toEqual(outcomesWhenTurnPlayerChoosesOrder);
  });

  it("can place EX10-072 Spiral Mountain from the battle area under it with its play cost reduction (Q6241)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT15-102", as: "apocalymon" }],
          battleArea: [
            { card: "EX10-072", as: "spiralMountain" },
            { card: "BT1-085", as: "unrelatedTamer" },
          ],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 11;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("apocalymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const selection = s.decisions.find(({ req }) => req.kind === "selectCards")!.req;
    const candidates = selection.options?.candidateInstanceIds ?? [];
    expect(candidates).toContain(s.inst("spiralMountain").instanceId);
    expect(candidates).not.toContain(s.inst("unrelatedTamer").instanceId);

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: selection.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("spiralMountain").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT15-102"));

    expect(s.perm("apocalymon").stack.map(({ cardId }) => cardId)).toEqual(["EX10-072"]);
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "EX10-072")).toBe(false);
    expect(s.state.memory).toBe(0);
  });
});
