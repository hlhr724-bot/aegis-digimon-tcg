import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT14-030.js";

const TOKEN = "TOKEN-Amon-of-Crimson-Flame";

describe("BT14-030", () => {
  it("preserves MarineAngemon's catalog identity and exact IR", () => {
    expect(getCardDefinition("BT14-030")).toMatchObject({
      nameEn: "MarineAngemon",
      colors: ["Blue"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Blue", level: 5, memoryCost: 3 },
        { color: "Yellow", level: 5, memoryCost: 3 },
      ],
      attributes: ["Vaccine"],
      types: ["Fairy"],
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    for (const trigger of ["OnPlay", "WhenDigivolving"])
      expect(compiled.effects.find((effect) => effect.trigger === trigger)?.actions[0]).toMatchObject({
        kind: "Return",
        optional: true,
        abortOnDecline: true,
        allowCostWithoutTarget: true,
        target: { filter: { levelLte: "returned" } },
        cost: { kind: "return", storeAs: "returned" },
      });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenDigimonReturnsToHand",
          sourceFilter: { controller: "any", kind: ["Digimon"], excludeSelf: true },
        },
      ],
    });
  });

  it("Q2400 returns an own Digimon of any level and only an opponent at or below that level", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-028", as: "ownLevel5" }],
          hand: [{ card: "BT14-030", as: "marine" }],
          deck: ["BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT14-026", as: "level5" },
            { card: "BT14-029", as: "level6" },
          ],
        },
      },
      {},
    );
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optionalDecision = s.state.pendingDecision;
    if (optionalDecision?.kind !== "optional") throw new Error("optional activation did not open");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optionalDecision.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const costDecision = s.state.pendingDecision;
    if (costDecision?.kind !== "chooseTargets") throw new Error("return-cost selection did not open");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: costDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("ownLevel5").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT14-028");
    expect(s.state.players[1]!.hand.map((card) => card.cardId)).toContain("BT14-026");
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain("BT14-029");
    expect(s.state.memory).toBe(4);
    assertNoLoudGap(s);
  });

  it("Q2401 may return its controller's Digimon even with no opposing Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT14-026", as: "base" },
            { card: "BT14-020", as: "own" },
          ],
          hand: [{ card: "BT14-030", as: "marine" }],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 6;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("marine").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const ownDecision = s.state.pendingDecision;
    if (ownDecision?.kind !== "chooseTargets") throw new Error("own return-cost selection did not open");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: ownDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("own").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "BT14-020"));
    expect(s.perm("base").topCard.cardId).toBe("BT14-030");
    expect(s.state.memory).toBe(3);
    assertNoLoudGap(s);
  });

  it("also evolves legally from the alternate yellow level 5 requirement", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-037", as: "yellowBase" }],
          hand: [{ card: "BT14-030", as: "marine" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("yellowBase").permanentId,
        instanceId: s.inst("marine").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("yellowBase").topCard.cardId === "BT14-030");
    expect(s.perm("yellowBase").stack.map((card) => card.cardId)).toEqual(["BT14-037"]);
    expect(s.state.memory).toBe(2);
    assertNoLoudGap(s);
  });

  it("Q2402 accepts Mother D-Reaper as the return cost but has no level for the follow-up", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-007", as: "mother" }],
          hand: [{ card: "BT14-030", as: "marine" }],
          eggDeck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT14-020", as: "opponent" }] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const motherDecision = s.state.pendingDecision;
    if (motherDecision?.kind !== "chooseTargets") throw new Error("Mother return-cost selection did not open");
    const motherResponse = s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: motherDecision.decisionId,
      response: { kind: "chooseTargets", instanceIds: [s.perm("mother").permanentId] },
    });
    if (!motherResponse.ok)
      throw new Error(
        JSON.stringify({ motherResponse, pending: s.state.pendingDecision, request: s.decisions.at(-1)?.req }),
      );
    await settle(() => s.state.players[0]!.eggDeck.at(-1)?.cardId === "EX2-007");
    expect(s.state.players[0]!.eggDeck.map((card) => card.cardId)).toEqual(["BT1-009", "EX2-007"]);
    expect(s.state.players[0]!.eggDeck.at(-1)?.faceUp).toBe(false);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).not.toContain("EX2-007");
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain("BT14-020");
    assertNoLoudGap(s);
  });

  it("rejects an ordinary no-DP Digi-Egg as a Digimon return cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-001", as: "ordinaryEgg" },
            { card: "BT14-020", as: "validDigimon" },
          ],
          hand: [{ card: "BT14-030", as: "marine" }],
        },
      },
      { autoAcceptOptional: true },
    );
    const eggPermanentId = s.perm("ordinaryEgg").permanentId;
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const decision = s.state.pendingDecision;
    if (decision?.kind !== "chooseTargets") throw new Error("return-cost selection did not open");
    const request = s.decisions.at(-1)?.req;
    if (request?.kind !== "chooseTargets") throw new Error("return-cost request was not captured");
    expect(request.options?.candidateInstanceIds).toContain(s.perm("validDigimon").permanentId);
    expect(request.options?.candidateInstanceIds).not.toContain(eggPermanentId);
    assertNoLoudGap(s);
  });

  it("Q2404 accepts a level-less token as the return cost and removes it from the game", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: TOKEN, as: "token" }], hand: [{ card: "BT14-030", as: "marine" }] },
        1: { battleArea: [{ card: "BT14-020", as: "opponent" }] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const tokenDecision = s.state.pendingDecision;
    if (tokenDecision?.kind !== "chooseTargets") throw new Error("token return-cost selection did not open");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: tokenDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("token").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.every((permanent) => permanent.topCard.cardId !== TOKEN));
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).not.toContain(TOKEN);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).not.toContain(TOKEN);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toContain("BT14-020");
    assertNoLoudGap(s);
  });

  it("may decline the optional return processing without moving either side", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT14-028", as: "own" }], hand: [{ card: "BT14-030", as: "marine" }] },
        1: { battleArea: [{ card: "BT14-020", as: "opponent" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 12;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT14-030")).toBe(false);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId).sort()).toEqual([
      "BT14-028",
      "BT14-030",
    ]);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT14-020"]);
    assertNoLoudGap(s);
  });

  it("recovers for another opponent Digimon returning, only on its turn and once per turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT14-030", as: "marine" }], deck: ["BT1-009", "BT1-009"] },
      1: {
        battleArea: [
          { card: "BT14-020", as: "first" },
          { card: "BT14-021", as: "second" },
        ],
      },
    });
    s.state.turnSeat = 0;
    await s.ready();
    await advance(s.engine).verb.returnToHand([s.perm("first").topCard.instanceId]);
    await settle(() => s.state.players[0]!.security.length === 1);
    await advance(s.engine).verb.returnToHand([s.perm("second").topCard.instanceId]);
    await settle();
    expect(s.state.players[0]!.security).toHaveLength(1);
    assertNoLoudGap(s);
  });

  it("recovers for another own Digimon, excludes itself, and does not trigger on the opponent's turn", async () => {
    const own = setupEngine({
      0: {
        battleArea: [
          { card: "BT14-030", as: "marine" },
          { card: "BT14-020", as: "other" },
        ],
        deck: ["BT1-009"],
      },
    });
    own.state.turnSeat = 0;
    await own.ready();
    await advance(own.engine).verb.returnToHand([own.perm("other").topCard.instanceId]);
    await settle(() => own.state.players[0]!.security.length === 1);
    expect(own.state.players[0]!.security).toHaveLength(1);

    const self = setupEngine({
      0: { battleArea: [{ card: "BT14-030", as: "marine" }], deck: ["BT1-009"] },
    });
    self.state.turnSeat = 0;
    await self.ready();
    await advance(self.engine).verb.returnToHand([self.perm("marine").topCard.instanceId]);
    await settle();
    expect(self.state.players[0]!.security).toHaveLength(0);

    const opponentTurn = setupEngine({
      0: {
        battleArea: [
          { card: "BT14-030", as: "marine" },
          { card: "BT14-021", as: "ownReturned" },
        ],
        deck: ["BT1-009"],
      },
      1: { battleArea: [{ card: "BT14-020", as: "opponentReturned" }] },
    });
    opponentTurn.state.turnSeat = 1;
    await opponentTurn.ready();
    await advance(opponentTurn.engine).verb.returnToHand([opponentTurn.perm("opponentReturned").topCard.instanceId]);
    await settle();
    expect(opponentTurn.state.players[0]!.security).toHaveLength(0);
    await advance(opponentTurn.engine).verb.returnToHand([opponentTurn.perm("ownReturned").topCard.instanceId]);
    await settle();
    expect(opponentTurn.state.players[0]!.security).toHaveLength(0);
    assertNoLoudGap(own);
    assertNoLoudGap(self);
    assertNoLoudGap(opponentTurn);
  });

  it("resets recovery after another Digimon returns on the next natural turn", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-030", as: "marine", under: ["BT14-026"] }],
          hand: [{ card: "ST2-16", as: "firstOption" }, { card: "ST2-16", as: "secondOption" }, "BT1-009"],
          security: ["BT1-009"],
          deck: Array(8).fill("BT1-009"),
        },
        1: {
          hand: ["BT1-009"],
          battleArea: [
            { card: "BT14-020", as: "firstTarget" },
            { card: "BT14-021", as: "secondTarget" },
          ],
          deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    s.state.memory = 10;
    preferInstanceIds.push(s.perm("firstTarget").topCard.instanceId);

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 2);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    expect(s.state.players[0]!.security).toHaveLength(2);
    s.state.turnSeat = 0;
    s.state.memory = 10;
    preferInstanceIds.splice(0, preferInstanceIds.length, s.perm("secondTarget").topCard.instanceId);

    const secondTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondOption").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 3);
    expect(s.state.players[0]!.security).toHaveLength(3);
    advance(s.engine).endMainPhaseIfOpen(0);
    await secondTurn;
    assertNoLoudGap(s);
  });
});

describe("BT14-030 MarineAngemon — KB Q&A rulings", () => {
  async function playMarineReturning(ownCost: "EX2-007" | "BT14-020") {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ownCost, as: "returnedOwn" }],
          hand: [{ card: "BT14-030", as: "marine" }],
          eggDeck: ["BT1-001"],
        },
        1: { battleArea: [{ card: "BT14-020", as: "opponentLevel3" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds },
    );
    preferInstanceIds.push(s.perm("returnedOwn").topCard.instanceId);
    s.state.memory = 12;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("marine").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.battleArea.length === 1);
    await settle();
    return s;
  }

  it("returns no opponent Digimon after Mother D-Reaper, which has no level, pays the return cost (Q2403)", async () => {
    const mother = await playMarineReturning("EX2-007");
    expect(mother.state.players[0]!.eggDeck.map((card) => card.cardId)).toContain("EX2-007");
    expect(mother.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT14-020"]);
    expect(mother.state.players[1]!.hand).toHaveLength(0);
    assertNoLoudGap(mother);

    const levelThree = await playMarineReturning("BT14-020");
    expect(levelThree.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT14-020"]);
    expect(levelThree.state.players[1]!.battleArea).toHaveLength(0);
    expect(levelThree.state.players[1]!.hand.map((card) => card.cardId)).toEqual(["BT14-020"]);
    assertNoLoudGap(levelThree);
  });
});
