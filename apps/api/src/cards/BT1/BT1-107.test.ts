import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT1-107.js";
import "../ST9/ST9-13.js";
import "../BT4/BT4-088.js";
import "../BT4/BT4-097.js";

describe("BT1-107 Holy Wave", () => {
  it("matches the catalog and compiles Main Recovery +1 plus Security Main activation", () => {
    expect(getCardDefinition("BT1-107")).toMatchObject({
      cardId: "BT1-107",
      set: "BT1",
      nameEn: "Holy Wave",
      colors: ["Yellow"],
      kinds: ["Option"],
      playCost: 6,
      dp: 0,
      evoCosts: [],
      effectText:
        "[Main] Trigger ＜Recovery +1 (Deck)＞. (Place the top card of your deck on top of your security stack.)",
      securityEffectText: "[Security] Activate this card's [Main] effect.",
      rarity: "C",
      maxCountInDeck: 4,
      imageId: "BT1-107",
    });
    expect(compiled).toEqual({
      effects: [
        {
          trigger: "Main",
          actions: [
            {
              effectTextPart:
                "[Main] Trigger ＜Recovery +1 (Deck)＞. (Place the top card of your deck on top of your security stack.)",
              kind: "SecurityManipulation",
              op: "addTop",
              controller: "mine",
              source: "deck",
              amount: 1,
            },
          ],
        },
        { trigger: "Security", actions: [{ kind: "ActivateMain" }], isSecurity: true },
      ],
      coverage: "full",
      residual: [],
    });
  });

  it("recovers the top deck card", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-047"],
        hand: [{ card: "BT1-107", as: "option" }],
        deck: [
          { card: "BT1-009", as: "top" },
          { card: "BT1-010", as: "second" },
          { card: "BT1-011", as: "third" },
        ],
      },
    });
    const topId = s.inst("top").instanceId;
    const secondId = s.inst("second").instanceId;
    const thirdId = s.inst("third").instanceId;
    s.state.memory = 6;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 1);
    expect(s.state.players[0]!.security).toHaveLength(1);
    expect(s.state.players[0]!.security[0]).toMatchObject({ instanceId: topId, faceUp: false });
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([secondId, thirdId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("recovers the top deck card from security", async () => {
    const s = setupEngine({
      0: {
        security: [{ card: "BT1-107", as: "securityOption", faceUp: true }],
        deck: [{ card: "BT1-009", as: "recovered" }],
      },
    });
    const recoveredId = s.inst("recovered").instanceId;
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityOption"));
    expect(s.state.players[0]!.security.some((card) => card.instanceId === recoveredId)).toBe(true);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });

  it("continues a multi-check attack into the card recovered by its Security effect", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST9-13", as: "attacker", dp: 20000 }] },
      1: {
        security: ["BT1-107"],
        deck: [{ card: "BT1-010", as: "recovered" }],
      },
    });
    await s.ready();
    const recoveredInstanceId = s.inst("recovered").instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.security.length === 0 &&
        s.state.players[1]!.trash.some((card) => card.instanceId === recoveredInstanceId),
    );

    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === recoveredInstanceId)).toBe(true);
    expect(s.events.filter((event) => event.kind === "securityChecked")).toHaveLength(2);
  });

  it("still fires security-removal effects when its recovery leaves the security count unchanged (Q1237/Q1249)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-010", as: "attacker", dp: 5000 }],
          security: [{ card: "BT1-009", as: "opponentSecurity" }],
        },
        1: {
          battleArea: [
            { card: "BT4-088", as: "danDevimon" },
            { card: "BT4-097", as: "kari" },
          ],
          security: [{ card: "BT1-107", as: "holyWave" }],
          deck: [{ card: "BT1-010", as: "recovered" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.perm("kari").isSuspended);

    expect(s.state.players[1]!.security.map((card) => card.instanceId)).toEqual([s.inst("recovered").instanceId]);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(s.inst("opponentSecurity").instanceId);
    expect(s.perm("kari").isSuspended).toBe(true);
  });

  it("can be used with an empty deck and resolves without recovering a card", async () => {
    const s = setupEngine({
      0: {
        battleArea: ["BT1-047"],
        hand: [{ card: "BT1-107", as: "option" }],
        deck: [],
      },
    });
    s.state.memory = 6;
    const option = s.inst("option");

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: option.instanceId })).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === option.instanceId));

    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.state.players[0]!.deck).toHaveLength(0);
  });
});

describe("BT1-107 Holy Wave — KB Q&A rulings", () => {
  async function checkedCardsAfterSecurityAttackPlusOne(deck: string[]) {
    const s = setupEngine({
      0: { battleArea: [{ card: "ST9-13", as: "attacker", dp: 20000 }] },
      1: { security: ["BT1-107"], deck },
    });
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking());

    return {
      checkedCardIds: s.events.flatMap((event) => (event.kind === "securityChecked" ? [event.revealedCardId] : [])),
      remainingSecurity: s.state.players[1]!.security.length,
    };
  }

  it("keeps checking the card its Recovery added to an emptied security stack (Q977)", async () => {
    expect(await checkedCardsAfterSecurityAttackPlusOne(["BT1-010"])).toEqual({
      checkedCardIds: ["BT1-107", "BT1-010"],
      remainingSecurity: 0,
    });
    expect(await checkedCardsAfterSecurityAttackPlusOne([])).toEqual({
      checkedCardIds: ["BT1-107"],
      remainingSecurity: 0,
    });
  });
});
