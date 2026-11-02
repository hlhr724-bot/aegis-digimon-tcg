import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled as BT25_067 } from "./BT25-067.js";
import "../index.js";

const CARD_ID = "BT25-067";

describe("BT25-067 Sealsdramon", () => {
  it("matches the complete catalog, alternate evolution, and inherited-effect contract", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      set: "BT25",
      nameEn: "Sealsdramon",
      colors: ["Black", "Purple"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 4,
      dp: 5000,
      evoCosts: [
        { color: "Black", level: 3, memoryCost: 3 },
        { color: "Purple", level: 3, memoryCost: 3 },
      ],
      forms: ["Champion"],
      attributes: ["Virus"],
      types: ["Cyborg", "D-Brigade", "ACCEL"],
      rarity: "C",
      maxCountInDeck: 4,
      dualEffect: "Sealsdramon",
    });
    const card = getCardDefinition(CARD_ID)!;
    expect(card.effectText?.replace(/\u00a0/g, " ")).toContain(
      "[Your Turn] When any of your [D-Brigade] or [ACCEL] trait Digimon are played",
    );
    expect(card.inheritedEffectText).toBe("[All Turns] This Digimon gets +1000 DP.");
    expect(digivolutionRequirementsFor(CARD_ID)).toContainEqual({
      level: 3,
      traits: ["D-Brigade", "ACCEL"],
      cost: 2,
      isAlternate: true,
    });

    const effect = BT25_067.effects?.find((entry) => entry.trigger === "YourTurn");
    expect(effect).toMatchObject({ trigger: "YourTurn" });
    const subTrigger = effect!.actions[0]!;
    expect(subTrigger).toMatchObject({
      kind: "SubTrigger",
      event: "whenPlayed",
      sourceFilter: {
        controller: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["D-Brigade", "ACCEL"], match: "trait" }],
      },
    });
    expect((subTrigger as { actions?: unknown[] }).actions?.[0]).toMatchObject({
      kind: "Digivolve",
      target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
      from: ["hand"],
      payCost: true,
      reduceCost: 2,
      optional: true,
      into: {
        controllerDefault: "mine",
        kind: ["Digimon"],
        nameOrTrait: [{ tokens: ["D-Brigade", "ACCEL"], match: "trait" }],
      },
    });
    expect(BT25_067.effects?.find((entry) => entry.isInherited)).toMatchObject({
      trigger: "AllTurns",
      actions: [{ kind: "ModifyDP", amount: 1000, duration: "permanent" }],
    });
  });

  it("Q6365: its own play triggers immediately, pays the reduced evolution cost, and carries inherited DP", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: CARD_ID, as: "seals" },
            { card: "BT25-074", as: "tank" },
          ],
          deck: ["BT1-001"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 0 },
    );
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("seals").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-074" && p.currentDP === 8000),
    );
    const evolved = s.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === "BT25-074")!;

    expect(evolved.topCard?.cardId).toBe("BT25-074");
    expect(evolved.stack.map((card) => card.cardId)).toContain(CARD_ID);
    expect(s.state.memory).toBe(0);
    expect(evolved.currentDP).toBe(8000);
  });

  it("accepts an ACCEL-only play as the OR trigger, but never a trait near-match", async () => {
    const valid = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "seals" }],
          hand: [
            { card: "BT20-031", as: "accelTrigger" },
            { card: "BT25-074", as: "tank" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 0 },
    );
    await valid.ready();
    await advance(valid.engine).verb.playInstances([valid.inst("accelTrigger").instanceId], CARD_ID);
    await settle(() => valid.perm("seals").topCard?.cardId === "BT25-074");
    expect(valid.perm("seals").topCard?.cardId).toBe("BT25-074");

    const nearMatch = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "seals" }],
          hand: [
            { card: "BT25-072", as: "nearMatch" },
            { card: "BT25-074", as: "tank" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await nearMatch.ready();
    await advance(nearMatch.engine).verb.playInstances([nearMatch.inst("nearMatch").instanceId], CARD_ID);
    await settle(() => nearMatch.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === "BT25-072"));
    expect(nearMatch.perm("seals").topCard?.cardId).toBe(CARD_ID);
    expect(nearMatch.state.players[0]!.hand.map((card) => card.instanceId)).toContain(
      nearMatch.inst("tank").instanceId,
    );
  });

  it("digivolves after a D-Brigade-only Commandramon is played", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "seals" }],
          hand: [
            { card: "BT4-063", as: "commandramon" },
            { card: "BT25-074", as: "tank" },
          ],
          deck: ["BT1-001", "BT1-001", "BT1-001", "BT1-001"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, preferOptionIndex: 0 },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("commandramon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("seals").topCard?.cardId === "BT25-074" && s.state.pendingDecision === undefined);

    expect(s.perm("seals").topCard?.cardId).toBe("BT25-074");
    expect(s.perm("seals").stack.map((card) => card.cardId)).toEqual([CARD_ID]);
    expect(s.perm("seals").currentDP).toBe(8000);
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "BT4-063")).toBe(true);
  });

  it.each([
    ["black", "BT10-058"],
    ["purple", "BT10-071"],
  ] as const)("uses the ordinary %s Lv3 evolution at exact cost 3", async (_color, source) => {
    const s = setupEngine({
      0: { battleArea: [{ card: source, as: "source" }], hand: [{ card: CARD_ID, as: "seals" }] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("seals").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard?.cardId === CARD_ID);
    expect(s.state.memory).toBe(2);
    expect(s.perm("source").topCard?.cardId).toBe(CARD_ID);
  });

  it("rejects an off-color ordinary Lv3 source without changing payment state", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "source" }], hand: [{ card: CARD_ID, as: "seals" }] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("seals").instanceId,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(5);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain(CARD_ID);
  });

  it("accepts the printed D-Brigade/ACCEL alternate at exact cost 2", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-063", as: "source" }], hand: [{ card: CARD_ID, as: "seals" }] },
    });
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("seals").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard?.cardId === CARD_ID);
    expect(s.state.memory).toBe(0);
    expect(s.perm("source").topCard?.cardId).toBe(CARD_ID);
  });

  it("rejects the alternate when neither color nor required trait matches", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "source" }], hand: [{ card: CARD_ID, as: "seals" }] },
    });
    s.state.memory = 2;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("seals").instanceId,
        useAlternateCost: true,
        alternateRequirementIndex: 2,
      }),
    ).toMatchObject({ ok: false });
    expect(s.state.memory).toBe(2);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toContain(CARD_ID);
  });

  it("does not trigger during the opponent's turn, and declining leaves the optional evolution untouched", async () => {
    const opponentTurn = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "seals" }],
          hand: [
            { card: "BT20-031", as: "accelTrigger" },
            { card: "BT25-074", as: "tank" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    opponentTurn.state.turnSeat = 1;
    await opponentTurn.ready();
    await advance(opponentTurn.engine).verb.playInstances([opponentTurn.inst("accelTrigger").instanceId], CARD_ID);
    expect(opponentTurn.perm("seals").topCard?.cardId).toBe(CARD_ID);
    expect(opponentTurn.state.players[0]!.hand.map((card) => card.instanceId)).toContain(
      opponentTurn.inst("tank").instanceId,
    );

    const opponentTurnSelfPlay = setupEngine(
      {
        0: {
          hand: [
            { card: CARD_ID, as: "seals" },
            { card: "BT25-074", as: "tank" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    opponentTurnSelfPlay.state.turnSeat = 1;
    await opponentTurnSelfPlay.ready();
    await advance(opponentTurnSelfPlay.engine).verb.playInstances(
      [opponentTurnSelfPlay.inst("seals").instanceId],
      CARD_ID,
    );
    expect(opponentTurnSelfPlay.state.players[0]!.battleArea[0]?.topCard?.cardId).toBe(CARD_ID);
    expect(opponentTurnSelfPlay.state.players[0]!.hand.map((card) => card.instanceId)).toContain(
      opponentTurnSelfPlay.inst("tank").instanceId,
    );

    const declined = setupEngine(
      {
        0: {
          hand: [
            { card: CARD_ID, as: "seals" },
            { card: "BT25-074", as: "tank" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    declined.state.memory = 4;
    expect(declined.engine.applyIntent(0, { type: "playCard", instanceId: declined.inst("seals").instanceId })).toEqual(
      { ok: true },
    );
    await settle(() => declined.state.players[0]!.battleArea.some((p) => p.topCard?.cardId === CARD_ID));
    expect(declined.state.players[0]!.battleArea.find((p) => p.topCard?.cardId === CARD_ID)?.topCard?.cardId).toBe(
      CARD_ID,
    );
    expect(declined.state.players[0]!.hand.map((card) => card.instanceId)).toContain(declined.inst("tank").instanceId);
  });
});
