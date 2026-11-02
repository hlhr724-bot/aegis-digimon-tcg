import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { drainMicrotasks, settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { compiled } from "./EX13-033.js";
import "../index.js";

const CARD_ID = "EX13-033";

const WITCHELNY_LV4 = "BT18-036";
const WITCHELNY_TEXT_ONLY = "BT18-030";
const ILLEGAL_SOURCE = "BT11-051";
const OWN_SECURITY_REMOVER = "BT19-029";
const OPPONENT = "BT1-037";
const INERT = "BT1-009";
const DECK = ["BT1-011", "BT1-012", "BT1-013", "BT1-014"];
const AUTOMATION = { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true };

describe("EX13-033 Mistymon", () => {
  it("matches the catalog printed text, stats and evolution costs", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      cardId: CARD_ID,
      nameEn: "Mistymon",
      colors: ["Yellow", "Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      forms: ["Ultimate"],
      attributes: ["Virus"],
      types: ["Magic Warrior", "Witchelny"],
      evoCosts: [
        { color: "Yellow", level: 4, memoryCost: 4 },
        { color: "Red", level: 4, memoryCost: 4 },
      ],
      effectText:
        "[Digivolve] Lv.4 w/[Witchelny] in text: Cost 3 \n\n＜Barrier＞ \n[On Play] [When Digivolving] You may place 1 [Witchelny] text card from your hand as the bottom security card. Then, by trashing your top security card, 1 of your Digimon may attack.\n[All Turns] [Once Per Turn] When your security stack is removed from, 1 of your opponent's Digimon gets -6000 DP for the turn. Then, if you have 3 or fewer security cards, delete 1 of their 6000 DP or lower Digimon.",
      inheritedEffectText:
        "[All Turns] [Once Per Turn] When your security stack is removed from, this Digimon may unsuspend.",
    });
  });

  it("compiles every printed clause", () => {
    expect(runtimeCompiledCard(CARD_ID)).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(5);
    expect(compiled.digivolutionRequirement).toEqual([{ level: 4, texts: ["Witchelny"], cost: 3, isAlternate: true }]);

    expect(compiled.effects[0]).toMatchObject({
      trigger: "Static",
      actions: [],
      keywords: [{ keyword: "Barrier", raw: "＜Barrier＞" }],
    });

    for (const [index, trigger] of [
      [1, "OnPlay"],
      [2, "WhenDigivolving"],
    ] as const) {
      const effect = compiled.effects[index];
      expect(effect).toMatchObject({
        trigger,
        actions: [
          {
            kind: "SecurityManipulation",
            op: "addBottom",
            controller: "mine",
            amount: 1,
            optional: true,
            source: {
              filter: {
                controller: "mine",
                zone: "hand",
                nameOrTrait: [{ tokens: ["Witchelny"], match: "text" }],
              },
              count: 1,
            },
          },
          {
            kind: "Attack",
            target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
            optional: true,
            abortOnDecline: true,
            cost: {
              kind: "trash",
              target: { filter: { controller: "mine", zone: "security", position: "top" }, count: 1 },
            },
          },
        ],
      });
      expect(effect?.frequency).toBeUndefined();
      expect(effect?.sharedUseKey).toBeUndefined();
      expect(effect?.actions[1]).not.toHaveProperty("withoutSuspending");
      expect(effect?.actions[0]).not.toHaveProperty("abortOnDecline");
    }

    expect(compiled.effects[3]).toMatchObject({
      trigger: "AllTurns",
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
          actions: [
            {
              kind: "ModifyDP",
              target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
              amount: -6000,
              duration: "forTheTurn",
            },
            {
              kind: "Delete",
              target: {
                filter: { controller: "opponent", kind: ["Digimon"], dp: { op: "lte", value: 6000 } },
                count: 1,
              },
              condition: { kind: "zoneCount", seat: "mine", zone: "security", op: "lte", value: 3 },
            },
          ],
        },
      ],
    });
    expect(compiled.effects[3]?.isInherited).toBeUndefined();

    expect(compiled.effects[4]).toMatchObject({
      trigger: "AllTurns",
      isInherited: true,
      frequency: "OncePerTurn",
      actions: [
        {
          kind: "SubTrigger",
          event: "whenSecurityRemoved",
          fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
          actions: [
            {
              kind: "Unsuspend",
              target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
              optional: true,
            },
          ],
        },
      ],
    });
  });

  it("digivolves through the alternate header for 3 off a Lv.4 with [Witchelny] in its text", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_LV4, as: "source" }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: WITCHELNY_LV4, as: "toPlace" },
          ],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("source").permanentId,
        instanceId: s.inst("mistymon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("source").topCard.cardId === CARD_ID);

    expect(s.perm("source").stack.map((card) => card.cardId)).toEqual([WITCHELNY_LV4]);
    expect(s.state.memory).toBe(7);
  });

  it("refuses a Lv.4 that matches neither the catalog EvoCosts nor the printed header", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: ILLEGAL_SOURCE, as: "green" }],
          hand: [{ card: CARD_ID, as: "mistymon" }],
          security: [INERT, INERT],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("green").permanentId,
        instanceId: s.inst("mistymon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("green").topCard.cardId).toBe(ILLEGAL_SOURCE);
    expect(s.state.memory).toBe(10);
  });

  it("places a [Witchelny] hand card at the bottom of security, then trashes the top card to attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: WITCHELNY_LV4, as: "toPlace" },
          ],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 2);

    const securityIds = s.state.players[0]!.security.map((card) => card.instanceId);
    expect(securityIds).toEqual([s.inst("bottom").instanceId, s.inst("toPlace").instanceId]);
    expect(s.events.filter((event) => event.kind === "cardRevealed")).toEqual([
      expect.objectContaining({ seat: 0, cardId: WITCHELNY_LV4, sourceCardId: CARD_ID }),
    ]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("top").instanceId);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("attacker"))).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === CARD_ID)
        .map(({ req }) => req.options?.effectTextEmphasis),
    ).toEqual([
      "[On Play] [When Digivolving] You may place 1 [Witchelny] text card from your hand as the bottom security card.",
      "Then, by trashing your top security card",
      "1 of your Digimon may attack",
    ]);
  });

  it.each([false, true])("can pay security and decline the attack after digivolving=%s", async (digivolving) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_LV4, as: "source" }],
          hand: [{ card: CARD_ID, as: "mistymon" }],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      { autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    const result = digivolving
      ? s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("source").permanentId,
          instanceId: s.inst("mistymon").instanceId,
          useAlternateCost: true,
        })
      : s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId });
    expect(result).toEqual({ ok: true });

    async function answerOptional(accept: boolean) {
      await settle(() => s.state.pendingDecision?.kind === "optional");
      const decisionId = s.state.pendingDecision!.decisionId;
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.decisionId !== decisionId);
    }

    await answerOptional(false);
    await answerOptional(true);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("bottom").instanceId]);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("top").instanceId);
    await answerOptional(false);
    await drainMicrotasks();

    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.events.filter((event) => event.kind === "attackDeclared")).toEqual([]);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("source"))).toBe(false);
    expect(s.perm("source").isSuspended).toBe(false);
  });

  it("declines both halves without touching either stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: WITCHELNY_LV4, as: "toPlace" },
          ],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([
      s.inst("top").instanceId,
      s.inst("bottom").instanceId,
    ]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("toPlace").instanceId]);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("attacker"))).toBe(false);
  });

  it("debuffs and deletes when the controller's own security stack is removed from", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [{ card: OWN_SECURITY_REMOVER, as: "remover" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim", dp: 9000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("remover").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("respects the printed 6000 DP ceiling and the 3-security gate", async () => {
    const ceiling = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [{ card: OWN_SECURITY_REMOVER, as: "remover" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "survivor", dp: 20_000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    ceiling.state.memory = 10;
    await ceiling.ready();

    expect(ceiling.engine.applyIntent(0, { type: "playCard", instanceId: ceiling.inst("remover").instanceId })).toEqual(
      { ok: true },
    );
    await settle(() => ceiling.state.players[0]!.security.length === 1);

    expect(ceiling.state.players[1]!.battleArea).toHaveLength(1);
    expect(ceiling.perm("survivor").currentDP).toBe(14_000);

    const gate = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [{ card: OWN_SECURITY_REMOVER, as: "remover" }],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim", dp: 9000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    gate.state.memory = 10;
    await gate.ready();

    expect(gate.engine.applyIntent(0, { type: "playCard", instanceId: gate.inst("remover").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => gate.state.players[0]!.security.length === 4);

    expect(gate.state.players[1]!.battleArea).toHaveLength(1);
    expect(gate.perm("victim").currentDP).toBe(3000);
  });

  it("ignores a removal from the OPPONENT's security stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "mistymon" },
            { card: INERT, as: "attacker", dp: 20_000 },
          ],
          security: ["BT1-010"],
          deck: DECK,
        },
        1: { battleArea: [{ card: OPPONENT, as: "victim" }], security: [INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
    expect(s.perm("victim").currentDP).toBe(6000);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("fires the watcher only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [
            { card: OWN_SECURITY_REMOVER, as: "first" },
            { card: OWN_SECURITY_REMOVER, as: "second" },
          ],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OPPONENT, as: "firstVictim", dp: 9000 },
            { card: OPPONENT, as: "secondVictim", dp: 9000 },
          ],
          security: [INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    s.state.memory = 20;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    const survivorId = s.state.players[1]!.battleArea[0]!.permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([survivorId]);
    expect(s.state.players[1]!.battleArea[0]!.currentDP).toBe(9000);
  });

  it("unsuspends a carrier through the inherited clause when your security stack is removed from", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: WITCHELNY_LV4, as: "carrier", under: [CARD_ID], suspended: true }],
          hand: [{ card: OWN_SECURITY_REMOVER, as: "remover" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: { security: [INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.perm("carrier").isSuspended).toBe(true);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("remover").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("carrier").isSuspended === false);

    expect(s.perm("carrier").isSuspended).toBe(false);
    expect(s.state.players[0]!.security).toHaveLength(1);
  });

  it("Q7309: reads the whole printed TEXT, not just the traits, and places the card face down", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: WITCHELNY_TEXT_ONLY, as: "toPlace" },
          ],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 2);

    const textOnlyCard = getCardDefinition(WITCHELNY_TEXT_ONLY)!;
    expect(textOnlyCard.nameEn).not.toContain("Witchelny");
    expect(textOnlyCard.types).not.toContain("Witchelny");
    expect(`${textOnlyCard.effectText} ${textOnlyCard.inheritedEffectText}`).toContain("Witchelny");
    const security = s.state.players[0]!.security;
    expect(security.map((card) => card.instanceId)).toEqual([
      s.inst("bottom").instanceId,
      s.inst("toPlace").instanceId,
    ]);
    expect(security.every((card) => card.faceUp === false)).toBe(true);
  });

  it("places nothing when the hand holds no [Witchelny] text card, and still grants the attack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: INERT, as: "spare" },
          ],
          security: [
            { card: "BT1-010", as: "top" },
            { card: "BT1-011", as: "bottom" },
          ],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.security.length === 2);

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("spare").instanceId]);
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("bottom").instanceId]);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("attacker"))).toBe(true);
  });

  it("grants no attack when the security stack is empty, because the printed cost cannot be paid", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          hand: [
            { card: CARD_ID, as: "mistymon" },
            { card: INERT, as: "spare" },
          ],
          security: [],
          deck: DECK,
        },
        1: { security: [INERT, INERT, INERT], deck: DECK },
      },
      AUTOMATION,
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(observe(s.engine).hasAttackedThisTurn(s.perm("attacker"))).toBe(false);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("can send the granted attack into a suspended opponent Digimon instead of the player", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: INERT, as: "attacker", dp: 40_000 }],
          hand: [{ card: CARD_ID, as: "mistymon" }],
          security: [{ card: "BT1-010", as: "top" }, "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "suspendedDefender", dp: 30_000, suspended: true }],
          security: [INERT, INERT, INERT],
          deck: DECK,
        },
      },
      { ...AUTOMATION, preferInstanceIds },
    );
    s.state.memory = 10;
    await s.ready();
    preferInstanceIds.push(s.perm("suspendedDefender").permanentId);

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("mistymon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security).toHaveLength(4);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("top").instanceId);
  });

  it("survives battle deletion through ＜Barrier＞ by trashing its controller's top security card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          security: [{ card: "BT1-010", as: "top" }, "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: INERT, as: "attacker", dp: 11_000 }],
          security: [INERT, INERT],
          deck: DECK,
        },
      },
      AUTOMATION,
    );
    await s.ready();
    const mistymonId = s.perm("mistymon").permanentId;
    const combat = (s.engine as unknown as { combat: { hasOpenBarrierDecision: boolean } }).combat;

    expect(
      s.engine.applyIntent(0, { type: "attack", attackerPermanentId: mistymonId, target: { kind: "player" } }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());
    await settle();
    expect(s.perm("mistymon").isSuspended).toBe(true);

    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: mistymonId },
      }),
    ).toEqual({ ok: true });
    await settle(() => combat.hasOpenBarrierDecision);
    expect(s.engine.applyIntent(0, { type: "respondBarrier", permanentId: mistymonId, accept: true })).toEqual({
      ok: true,
    });
    await settle(() => !observe(s.engine).isAttacking());
    await settle();

    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([mistymonId]);
    expect(s.state.players[0]!.security).toHaveLength(4);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("top").instanceId);
    expect(s.perm("attacker").currentDP).toBe(5000);
  });

  it("Q7310: fires after the opponent finishes checking your security stack", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: INERT, as: "attacker", dp: 20_000 },
            { card: OPPONENT, as: "victim", dp: 9000 },
          ],
          security: [INERT],
          deck: DECK,
        },
      },
      { ...AUTOMATION, preferInstanceIds },
    );
    await s.ready();
    preferInstanceIds.push(s.perm("victim").topCard.instanceId);
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("attacker").permanentId,
    ]);
  });

  it("Q7311: finishes the printed deletion before the 0-DP rules check", async () => {
    const preferred: string[] = [];
    let zeroDpStillPresentWhenAfterTargetWasDeleted = false;
    let s!: ReturnType<typeof setupEngine>;
    s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [{ card: OWN_SECURITY_REMOVER, as: "remover" }],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OPPONENT, as: "zeroTarget", dp: 6000 },
            { card: INERT, as: "afterTarget", dp: 3000 },
          ],
          security: [INERT],
          deck: DECK,
        },
      },
      {
        ...AUTOMATION,
        preferInstanceIds: preferred,
        onEvent(event) {
          if (event.kind !== "cardsMoved" || !event.instanceIds.includes(s.inst("afterTarget").instanceId)) return;
          zeroDpStillPresentWhenAfterTargetWasDeleted = s.state.players[1]!.battleArea.some(
            ({ permanentId }) => permanentId === s.perm("zeroTarget").permanentId,
          );
        },
      },
    );
    preferred.includes = (id: string) =>
      s.perm("zeroTarget").currentDP === 6000
        ? id === s.perm("zeroTarget").permanentId
        : id === s.perm("afterTarget").permanentId;
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("remover").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(zeroDpStillPresentWhenAfterTargetWasDeleted).toBe(true);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining([s.inst("zeroTarget").instanceId, s.inst("afterTarget").instanceId]),
    );
  });

  it("Q7312: cannot activate after EX13-004 digivolves Mistymon before its simultaneous trigger", async () => {
    const preferred: string[] = [];
    const automation = { ...AUTOMATION, autoOrderTriggers: false, preferInstanceIds: preferred };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon", under: ["EX13-004"] }],
          hand: [
            { card: WITCHELNY_LV4, as: "securityPlacement" },
            { card: "EX13-037", as: "dynasmon" },
          ],
          security: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: OPPONENT, as: "victim", dp: 20_000 }],
          security: [INERT, INERT],
          deck: DECK,
        },
      },
      automation,
    );
    s.state.memory = 10;
    preferred.push(s.inst("securityPlacement").instanceId);
    await s.ready();

    const resolution = advance(s.engine).fire(EffectTiming.OnPlay, s.perm("mistymon"));
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const order = s.decisions.findLast(({ req }) => req.kind === "orderTriggers")!.req;
    expect(order.options?.triggerCardIds).toEqual(expect.arrayContaining([CARD_ID, "EX13-004"]));
    const demiMeramonIndex = order.options!.triggerCardIds!.findIndex((id) => id === "EX13-004");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderTriggers", order: [order.options!.triggerKeys![demiMeramonIndex]!] },
      }),
    ).toEqual({ ok: true });
    automation.autoOrderTriggers = true;
    await resolution;
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("mistymon").topCard.cardId).toBe("EX13-037");
    // Dynasmon's own security-removal watcher supplies -12000; Mistymon's stale -6000
    // trigger must not activate after Mistymon becomes a digivolution card.
    expect(s.perm("victim").currentDP).toBe(8000);
  });

  it("resets the watcher on the controller's next turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "mistymon" }],
          hand: [
            { card: OWN_SECURITY_REMOVER, as: "first" },
            { card: OWN_SECURITY_REMOVER, as: "second" },
            { card: OWN_SECURITY_REMOVER, as: "third" },
          ],
          security: ["BT1-010", "BT1-011", "BT1-012"],
          deck: DECK,
        },
        1: {
          battleArea: [
            { card: OPPONENT, as: "firstVictim", dp: 9000 },
            { card: OPPONENT, as: "secondVictim", dp: 9000 },
          ],
          security: [INERT, INERT, INERT, INERT],
          deck: [...DECK, ...DECK],
        },
      },
      AUTOMATION,
    );
    s.state.memory = 20;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("first").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    const survivorId = s.state.players[1]!.battleArea[0]!.permanentId;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("second").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();

    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([survivorId]);
    expect(s.state.players[1]!.battleArea[0]!.currentDP).toBe(9000);

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);

    s.state.turnSeat = 0;
    s.state.memory = 20;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 20;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("third").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("declines the inherited unsuspend and never touches a Digimon without the source card", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: WITCHELNY_LV4, as: "carrier", under: [CARD_ID], suspended: true },
            { card: INERT, as: "bystander", suspended: true },
          ],
          security: ["BT1-010", "BT1-011"],
          deck: DECK,
        },
        1: {
          battleArea: [{ card: INERT, as: "attacker", dp: 20_000 }],
          security: [INERT],
          deck: DECK,
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.turnSeat = 1;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
    await settle();

    expect(s.perm("carrier").isSuspended).toBe(true);
    expect(s.perm("bystander").isSuspended).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("declares ＜Barrier＞ live on the top card only", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: CARD_ID, as: "mistymon" },
          { card: WITCHELNY_LV4, as: "carrier", under: [CARD_ID] },
        ],
        security: [INERT],
        deck: DECK,
      },
      1: { security: [INERT], deck: DECK },
    });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("mistymon"), "Barrier")).toBe(true);
    expect(compiled.effects.some((effect) => effect.isInherited === true && effect.keywords !== undefined)).toBe(false);
  });
});
