import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, settleAcrossTimers } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX10-032.js";
import "../index.js";

const CARD_ID = "EX10-032";

const INERT_DECK = ["BT1-013", "BT1-014", "BT1-009"];

describe("EX10-032 Proganomon", () => {
  it("records the exact catalog", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Proganomon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [{ color: "Black", level: 4, memoryCost: 3 }],
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Mineral", "LIBERATOR"],
      maxCountInDeck: 4,
    });
  });

  it("maps every printed clause onto compiled IR", () => {
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);

    expect(compiled.effects?.find((effect) => effect.trigger === "Main")).toMatchObject({
      isFromHand: true,
      condition: { kind: "youHave", filter: { nameOrTrait: [{ tokens: ["Close"], match: "name" }] } },
      actions: [
        {
          kind: "DigivolveViaPlacement",
          cost: 3,
          ignoreDigivolutionRequirements: true,
          placeCost: {
            kind: "placeFromTrash",
            destination: "digivolutionStack",
            position: "bottom",
            target: { filter: { nameOrTrait: [{ tokens: ["Landramon"], match: "name" }] }, count: 1 },
            hostFilter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Sunarizamon"], match: "name" }],
            },
          },
          into: { isSelfRef: true },
        },
      ],
    });

    for (const trigger of ["OnPlay", "WhenDigivolving", "WhenAttacking"]) {
      expect(compiled.effects?.find((effect) => effect.trigger === trigger)).toMatchObject({
        actions: [
          {
            kind: "GainKeyword",
            keyword: { keyword: "Collision" },
            duration: "untilOpponentTurnEnd",
            target: {
              bindAs: "chosen",
              filter: { controller: "mine", nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }] },
            },
            cost: { kind: "trash", target: { from: ["digivolutionCards"], count: 1 } },
            optional: true,
            abortOnDecline: true,
          },
          { kind: "GainKeyword", keyword: { keyword: "Piercing" }, target: { fromSelectionRef: "chosen" } },
          { kind: "ModifyDP", amount: 3000, target: { fromSelectionRef: "chosen" } },
        ],
      });
    }

    expect(compiled.effects?.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "Static",
      actions: [
        {
          kind: "SubTrigger",
          event: "onDigivolutionCardsDiscardedBatch",
          sourceFilter: { isSelfRef: true },
          hostFilter: { nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }] },
          actions: [{ kind: "DeDigivolve", amount: 1, target: { filter: { controller: "opponent" } } }],
        },
      ],
    });
  });

  it("Q5091 places Landramon under Sunarizamon and hand-digivolves for the reduced cost 2", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-055", as: "suna" },
            { card: "EX10-063", as: "close" },
          ],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: INERT_DECK,
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    s.state.memory = 3;
    await s.ready();
    const [entry] = JSON.parse(s.inst("proganomon").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(entry).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("proganomon").instanceId,
        effectKey: entry!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("suna").topCard.cardId === CARD_ID);

    expect(s.state.memory).toBe(1);
    expect(s.perm("suna").stack.map(({ instanceId }) => instanceId)).toEqual([
      s.inst("landramon").instanceId,
      s.inst("suna").instanceId,
    ]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT1-013"]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("never places under the OPPONENT's Sunarizamon and needs [Close] in play", async () => {
    const withoutClose = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT21-055", as: "suna" }],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: INERT_DECK,
        },
      },
      { autoSelectCards: true },
    );
    withoutClose.state.memory = 3;
    await withoutClose.ready();
    expect(JSON.parse(withoutClose.inst("proganomon").activatableEffectsJson || "[]")).toHaveLength(0);

    const opponentHost = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-063", as: "close" }],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: INERT_DECK,
        },
        1: { battleArea: [{ card: "BT21-055", as: "theirSuna" }], deck: INERT_DECK },
      },
      { autoSelectCards: true },
    );
    opponentHost.state.memory = 3;
    await opponentHost.ready();
    expect(JSON.parse(opponentHost.inst("proganomon").activatableEffectsJson || "[]")).toHaveLength(0);
    expect(opponentHost.perm("theirSuna").topCard.cardId).toBe("BT21-055");
    expect(opponentHost.perm("theirSuna").stack).toHaveLength(0);
    expect(opponentHost.state.players[1]!.battleArea).toHaveLength(1);
    expect(opponentHost.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([
      opponentHost.inst("landramon").instanceId,
    ]);
    expect(opponentHost.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual([CARD_ID]);
    expect(opponentHost.state.memory).toBe(3);
    expect(opponentHost.state.pendingDecision).toBeUndefined();
  });

  it("Q5092 the [Hand] [Main] clause is self-contained: no other digivolve effect combines with it", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-055", as: "suna" },
            { card: "EX10-063", as: "close" },
            { card: "P-107", as: "training" },
          ],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("suna").permanentId,
        instanceId: s.inst("proganomon").instanceId,
      }),
    ).not.toEqual({ ok: true });
    expect(s.perm("suna").topCard.cardId).toBe("BT21-055");

    const [entry] = JSON.parse(s.inst("proganomon").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(entry).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("proganomon").instanceId,
        effectKey: entry!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("suna").topCard.cardId === CARD_ID);
    expect(s.state.memory).toBe(1);
  });

  it("[On Play] through the real playCard intent: trashes a Mineral source and buffs one trait Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX10-028", as: "costHost", under: [{ card: "EX10-025", as: "cost" }] },
            { card: "EX10-028", as: "target" },
            { card: "BT1-009", as: "near" },
          ],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("cost").instanceId, s.perm("target").topCard.instanceId);
    s.state.memory = 7;
    const targetBase = s.perm("target").currentDP;
    const nearBase = s.perm("near").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proganomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === targetBase + 3000 && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.perm("costHost").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.perm("target").currentDP).toBe(targetBase + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("target"))).toBe(true);
    expect(s.perm("near").currentDP).toBe(nearBase);
    expect(observe(s.engine).hasKeyword(s.perm("near"), "Collision")).toBe(false);
    expect(observe(s.engine).hasPierce(s.perm("near"))).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[When Digivolving] through the real digivolve intent from a Lv.4 Black source", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-028", as: "source", under: [{ card: "EX10-025", as: "cost" }] }],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("cost").instanceId, s.perm("source").topCard.instanceId);
    s.state.memory = 3;
    const handBefore = s.state.players[0]!.hand.length;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("proganomon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard.cardId === CARD_ID && s.state.pendingDecision === undefined);

    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.perm("source").stack.map(({ cardId }) => cardId)).toEqual(["EX10-028"]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.perm("source").currentDP).toBe(7000 + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("source"))).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("[When Attacking] pays from ANOTHER stack (Q5093) and that trash fires this card's inherited De-Digivolve", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "attacker" },
            { card: "EX10-028", as: "costHost", under: [{ card: CARD_ID, as: "cost" }] },
            { card: "BT1-009", as: "near" },
          ],
          deck: INERT_DECK,
        },
        1: {
          battleArea: [{ card: "BT1-019", as: "victim", under: [{ card: "BT1-009", as: "victimBase" }] }],
          deck: INERT_DECK,
          security: ["BT1-013"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(
      s.inst("cost").instanceId,
      s.perm("attacker").topCard.instanceId,
      s.perm("victim").topCard.instanceId,
    );
    const attackerBase = s.perm("attacker").currentDP;
    const nearBase = s.perm("near").currentDP;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settleAcrossTimers(() => s.state.players[1]!.security.length === 0 && s.state.pendingDecision === undefined);
    expect(s.events.some((event) => event.kind === "blockWindowOpened")).toBe(true);

    expect(s.perm("costHost").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("cost").instanceId);
    expect(s.perm("attacker").currentDP).toBe(attackerBase + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("attacker"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("attacker"))).toBe(true);
    expect(s.perm("near").currentDP).toBe(nearBase);
    expect(observe(s.engine).hasPierce(s.perm("near"))).toBe(false);
    expect(s.perm("victim").topCard.instanceId).toBe(s.inst("victimBase").instanceId);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toContain("BT1-019");
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it('reads "1 of your such Digimon" as the TRAIT, not "has such a card in its digivolution cards"', async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-019", as: "stackOnly", under: [{ card: "EX10-025", as: "cost" }] },
            { card: "EX10-028", as: "traitTarget" },
          ],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(
      s.inst("cost").instanceId,
      s.perm("stackOnly").topCard.instanceId,
      s.perm("traitTarget").topCard.instanceId,
    );
    s.state.memory = 7;
    const stackOnlyDp = s.perm("stackOnly").currentDP;
    const traitTargetDp = s.perm("traitTarget").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proganomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () => s.perm("traitTarget").currentDP === traitTargetDp + 3000 && s.state.pendingDecision === undefined,
    );

    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("cost").instanceId);
    expect(s.perm("stackOnly").currentDP).toBe(stackOnlyDp);
    expect(observe(s.engine).hasKeyword(s.perm("stackOnly"), "Collision")).toBe(false);
    expect(observe(s.engine).hasPierce(s.perm("stackOnly"))).toBe(false);
    expect(s.perm("traitTarget").currentDP).toBe(traitTargetDp + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("traitTarget"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("traitTarget"))).toBe(true);
  });

  it("never spends the OPPONENT's digivolution cards and never buffs their [Mineral] Digimon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX10-028", as: "mine", under: [{ card: "BT10-062", as: "myCost" }] }],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          deck: INERT_DECK,
        },
        1: {
          battleArea: [{ card: "BT10-062", as: "theirs", under: [{ card: "BT10-062", as: "theirCost" }] }],
          deck: INERT_DECK,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(
      s.inst("theirCost").instanceId,
      s.perm("theirs").topCard.instanceId,
      s.inst("myCost").instanceId,
      s.perm("mine").topCard.instanceId,
    );
    s.state.memory = 7;
    const mineBase = s.perm("mine").currentDP;
    const theirsBase = s.perm("theirs").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proganomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 0 && s.state.pendingDecision === undefined);

    expect(s.perm("mine").stack).toHaveLength(0);
    expect(s.perm("theirs").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("theirCost").instanceId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("myCost").instanceId]);
    expect(s.state.players[1]!.trash).toHaveLength(0);
    expect(s.perm("mine").currentDP).toBe(mineBase + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("mine"), "Collision")).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("mine"))).toBe(true);
    expect(s.perm("theirs").currentDP).toBe(theirsBase);
    expect(observe(s.engine).hasKeyword(s.perm("theirs"), "Collision")).toBe(false);
    expect(observe(s.engine).hasPierce(s.perm("theirs"))).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("the buffs expire when the opponent's turn ends, proved through the real turn loop", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX10-028", as: "costHost", under: [{ card: "EX10-025", as: "cost" }] },
            { card: "EX10-028", as: "target" },
          ],
          hand: [
            { card: CARD_ID, as: "proganomon" },
            { card: "BT1-013", as: "spare" },
          ],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK, security: ["BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("cost").instanceId, s.perm("target").topCard.instanceId);
    const targetBase = s.perm("target").currentDP;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 7;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proganomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === targetBase + 3000);
    expect(s.perm("target").currentDP).toBe(targetBase + 3000);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("target").currentDP).toBe(targetBase + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(true);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });

    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("target").currentDP).toBe(targetBase);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(false);
    expect(observe(s.engine).hasPierce(s.perm("target"))).toBe(false);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("declining the optional cost leaves the board untouched", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX10-028", as: "costHost", under: [{ card: "EX10-025", as: "cost" }] },
            { card: "EX10-028", as: "target" },
          ],
          hand: [{ card: CARD_ID, as: "proganomon" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await s.ready();
    s.state.memory = 7;
    const targetBase = s.perm("target").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("proganomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.length === 0 && s.state.pendingDecision === undefined);

    expect(s.perm("costHost").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.perm("target").currentDP).toBe(targetBase);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q5092 P-107's ＜Delay＞, played and activated publicly, reaches this card only by the ORDINARY route", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT3-067", as: "host" }],
          hand: [
            { card: "P-107", as: "training" },
            { card: CARD_ID, as: "proganomon" },
          ],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: ["BT2-064", ...INERT_DECK],
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("proganomon").instanceId, s.perm("host").topCard.instanceId);
    const trainingId = s.inst("training").instanceId;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: trainingId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === trainingId) &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("host").topCard.cardId).toBe("BT3-067");

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    const handBefore = s.state.players[0]!.hand.length;
    s.state.memory = 5;
    const ability = JSON.parse(s.perm("training").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(ability).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trainingId,
        effectKey: ability[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === CARD_ID && s.state.pendingDecision === undefined);

    expect(s.perm("host").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("host").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("host").instanceId]);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("landramon").instanceId);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === trainingId)).toBe(false);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).not.toContain(s.inst("proganomon").instanceId);
    expect(s.state.players[0]!.hand).toHaveLength(handBefore);
    expect(s.state.pendingDecision).toBeUndefined();

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    expect(s.state.memory).toBe(4);
  });

  it("Q5092 negative: the activated ＜Delay＞ cannot put this card onto a Lv.3 [Sunarizamon], and the [Hand] [Main] clause still resolves on its own", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-055", as: "suna" },
            { card: "EX10-063", as: "close" },
          ],
          hand: [
            { card: "P-107", as: "training" },
            { card: "EX10-063", as: "negativeReplacementClose" },
            { card: "EX10-063", as: "negativeSecondReplacementClose" },
            { card: CARD_ID, as: "proganomon" },
          ],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: ["BT2-064", ...INERT_DECK],
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("proganomon").instanceId, s.perm("suna").topCard.instanceId);
    const trainingId = s.inst("training").instanceId;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: trainingId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === trainingId) &&
        s.state.pendingDecision === undefined,
    );

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    s.state.memory = 3;
    // CR 15-7-5: the ＜Delay＞ trash is still payable; only its digivolution has no legal target.
    const [delay] = JSON.parse(s.perm("training").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(delay).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trainingId,
        effectKey: delay!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.trash.some(({ instanceId }) => instanceId === trainingId) &&
        s.state.pendingDecision === undefined,
    );

    expect(s.perm("suna").topCard.cardId).toBe("BT21-055");
    expect(s.perm("suna").stack).toHaveLength(0);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toContain(s.inst("proganomon").instanceId);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("landramon").instanceId);
    expect(s.state.memory).toBe(3);

    const [entry] = JSON.parse(s.inst("proganomon").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(entry).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("proganomon").instanceId,
        effectKey: entry!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("suna").topCard.cardId === CARD_ID);
    expect(s.perm("suna").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("suna").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("landramon").instanceId]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT21-055");

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("Q5092 leak: P-107's spent -2 must not reduce this card's [Hand] [Main] cost", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT21-055", as: "suna" },
            { card: "BT3-067", as: "host" },
            { card: "EX10-063", as: "close" },
          ],
          hand: [
            { card: "P-107", as: "training" },
            { card: "EX10-063", as: "replacementClose" },
            { card: "EX10-063", as: "secondReplacementClose" },
            { card: "BT10-064", as: "delayTarget" },
            { card: CARD_ID, as: "proganomon" },
          ],
          trash: [{ card: "EX10-028", as: "landramon" }],
          deck: ["BT2-064", ...INERT_DECK],
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(
      s.inst("delayTarget").instanceId,
      s.perm("host").topCard.instanceId,
      s.inst("proganomon").instanceId,
      s.perm("suna").topCard.instanceId,
    );
    const trainingId = s.inst("training").instanceId;

    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 5;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: trainingId })).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === trainingId) &&
        s.state.pendingDecision === undefined,
    );
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);

    s.state.memory = 5;
    const ability = JSON.parse(s.perm("training").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(ability).toHaveLength(1);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: trainingId,
        effectKey: ability[0]!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === trainingId) &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("host").topCard.cardId).toBe("BT10-064");
    expect(s.state.memory).toBe(4);

    s.state.memory = 3;
    const [entry] = JSON.parse(s.inst("proganomon").activatableEffectsJson || "[]") as Array<{ effectKey: string }>;
    expect(entry).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.inst("proganomon").instanceId,
        effectKey: entry!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("suna").topCard.cardId === CARD_ID);
    expect(s.perm("suna").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("suna").stack.map(({ instanceId }) => instanceId)).toEqual([s.inst("landramon").instanceId]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toContain("BT21-055");

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    const digivolvePayments = s.events.filter(
      (event) => event.kind === "memoryChanged" && event.reason === "digivolve",
    );
    expect(digivolvePayments.at(-1)).toMatchObject({ from: 3, to: 1 });
    expect(s.state.memory).toBe(2);
  });

  it("peer: EX10-028 Landramon spends the same [Mineral] cost pool but grants ＜Reboot＞/＜Blocker＞, not ＜Collision＞/＜Piercing＞", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX10-028", as: "costHost", under: [{ card: "BT10-062", as: "cost" }] },
            { card: "EX10-028", as: "target" },
          ],
          hand: [{ card: "EX10-028", as: "peer" }],
          deck: INERT_DECK,
        },
        1: { deck: INERT_DECK },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    await s.ready();
    preferred.push(s.inst("cost").instanceId, s.perm("target").topCard.instanceId);
    s.state.memory = 4;
    const targetBase = s.perm("target").currentDP;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("peer").instanceId })).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === targetBase + 3000 && s.state.pendingDecision === undefined);

    expect(s.perm("costHost").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(s.inst("cost").instanceId);
    expect(s.perm("target").currentDP).toBe(targetBase + 3000);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Reboot")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Collision")).toBe(false);
    expect(observe(s.engine).hasPierce(s.perm("target"))).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
