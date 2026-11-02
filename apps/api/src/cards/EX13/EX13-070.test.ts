import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { compiled } from "./EX13-070.js";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";

const CARD_ID = "EX13-070";

describe("EX13-070 Davis Motomiya & Ken Ichijoji", () => {
  async function acceptOptional(s: ReturnType<typeof setupEngine>) {
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
  }

  it("matches the catalog and maps every printed clause", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      nameEn: "Davis Motomiya & Ken Ichijoji",
      colors: ["Blue", "Green"],
      kinds: ["Tamer"],
      playCost: 4,
      effectText: expect.stringContaining("[End of Your Turn] By suspending this Tamer"),
      securityEffectText: "[Security] Play this card without paying the cost.",
    });
    expect(compiled).toMatchObject({ cardId: CARD_ID, coverage: "full", residual: [] });
    expect(compiled.effects).toHaveLength(3);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "StartOfYourTurn",
      actions: [{ kind: "SetMemory", value: 3, condition: { kind: "memoryAtMost", value: 2 } }],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "EndOfYourTurn",
      actions: [
        {
          kind: "CostGatedBlock",
          optional: true,
          abortOnDecline: true,
          cost: { kind: "suspend", target: { filter: { isSelfRef: true }, isSelf: true } },
          actions: [{ kind: "Modal", choose: 1, options: [[{ kind: "Digivolve" }], [{ kind: "DnaDigivolve" }]] }],
        },
      ],
    });
    expect(compiled.effects[2]).toMatchObject({
      trigger: "Security",
      isSecurity: true,
      actions: [{ kind: "PlayWithoutCost", payCost: false }],
    });
  });

  it("sets memory to 3 at 2 or less and never lowers a higher gauge", async () => {
    for (const startingMemory of [2, 1, 0]) {
      const s = setupEngine({
        0: { battleArea: [{ card: CARD_ID, as: "tamer" }], deck: ["BT1-010"] },
        1: { deck: ["BT1-011"] },
      });
      s.state.memory = startingMemory;
      await s.ready();
      await advance(s.engine).fire(EffectTiming.StartOfYourTurn, s.perm("tamer"));
      expect(s.state.memory).toBe(3);
    }

    const high = setupEngine({
      0: { battleArea: [{ card: CARD_ID, as: "tamer" }], deck: ["BT1-010"] },
      1: { deck: ["BT1-011"] },
    });
    high.state.memory = 4;
    await high.ready();
    await advance(high.engine).fire(EffectTiming.StartOfYourTurn, high.perm("tamer"));
    expect(high.state.memory).toBe(4);
  });

  it("plays itself from security and fires its normal Tamer identity", async () => {
    const s = setupEngine({
      0: { security: [{ card: CARD_ID, as: "securityTamer" }], deck: ["BT1-010"] },
      1: { deck: ["BT1-011"] },
    });
    await s.ready();
    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("securityTamer"));
    await settle();
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([CARD_ID]);
    expect(s.state.players[0]!.security).toHaveLength(0);
  });

  it.each([0, 1, 2])("ordinary evolution pays the reduced cost at %s opposing Digimon", async (opponentCount) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamer" },
            { card: "BT12-021", as: "source" },
          ],
          hand: [{ card: "BT12-022", as: "result" }],
          deck: ["BT1-010"],
        },
        1: {
          battleArea: Array.from({ length: opponentCount }, () => ({ card: "BT1-009" })),
          deck: ["BT1-011"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("tamer"));
    await settle(() => s.perm("source").topCard.cardId === "BT12-022");
    expect(s.perm("source").topCard.cardId).toBe("BT12-022");
    expect(s.perm("source").stack.map(({ cardId }) => cardId)).toEqual(["BT12-021"]);
    expect(s.state.memory).toBe(8 + opponentCount);
    expect(s.perm("tamer").isSuspended).toBe(true);
  });

  it("Q7440 still digivolves but pays full cost while Syakomon blocks digivolution-cost reductions", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamer" },
            { card: "BT12-021", as: "source" },
          ],
          hand: [{ card: "BT12-022", as: "result" }],
          deck: ["BT1-010"],
        },
        1: { battleArea: [{ card: "BT5-021", as: "syakomon" }], deck: ["BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("tamer"));
    await settle(() => s.perm("source").topCard.cardId === "BT12-022");

    expect(s.perm("source").topCard.cardId).toBe("BT12-022");
    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.state.memory).toBe(8);
  });

  it("Q7441 does not combine two Tamer reductions onto one end-of-turn digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamerA" },
            { card: CARD_ID, as: "tamerB" },
            { card: "BT12-021", as: "source" },
          ],
          hand: [{ card: "BT12-022", as: "result" }],
          deck: ["BT1-010", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: ["BT1-012", "BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    await s.ready();

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.perm("source").topCard.cardId === "BT12-022");
    await settle();

    expect(s.perm("source").topCard.cardId).toBe("BT12-022");
    expect(s.perm("tamerA").isSuspended).toBe(true);
    expect(s.perm("tamerB").isSuspended).toBe(true);
    expect(s.state.memory).toBe(-4);
    await turn;
  });

  it("refuses an exhausted Tamer and an explicitly declined suspension cost", async () => {
    const exhausted = setupEngine({
      0: {
        battleArea: [
          { card: CARD_ID, as: "tamer", suspended: true },
          { card: "BT12-021", as: "source" },
        ],
        hand: [{ card: "BT12-022", as: "result" }],
      },
    });
    await exhausted.ready();
    await advance(exhausted.engine).fire(EffectTiming.EndOfYourTurn, exhausted.perm("tamer"));
    expect(exhausted.perm("source").topCard.cardId).toBe("BT12-021");
    expect(exhausted.state.pendingDecision).toBeUndefined();

    const declined = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamer" },
            { card: "BT12-021", as: "source" },
          ],
          hand: [{ card: "BT12-022", as: "result" }],
        },
      },
      { autoDeclineOptional: true },
    );
    await declined.ready();
    await advance(declined.engine).fire(EffectTiming.EndOfYourTurn, declined.perm("tamer"));
    expect(declined.perm("source").topCard.cardId).toBe("BT12-021");
    expect(declined.perm("tamer").isSuspended).toBe(false);
  });

  it("chooses the DNA branch and merges two own materials into a Free result", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamer" },
            { card: "BT12-022", as: "blue" },
            { card: "BT12-050", as: "green" },
          ],
          hand: [{ card: "BT12-028", as: "result" }],
          deck: ["BT1-010", "BT1-011"],
        },
        1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: ["BT1-012"] },
      },
      { autoAcceptOptional: false, autoSelectCards: true, autoChooseOption: false },
    );
    s.state.memory = 10;
    await s.ready();

    const effect = advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("tamer"));
    await acceptOptional(s);
    await settle(() => s.state.pendingDecision?.kind === "chooseOption");
    const pending = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "chooseOption", optionIndex: 1 },
      }),
    ).toEqual({ ok: true });
    await acceptOptional(s);
    await effect;
    await settle(() => s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === "BT12-028"));

    const result = s.state.players[0]!.battleArea.find(({ topCard }) => topCard.cardId === "BT12-028")!;
    expect(result.topCard.cardId).toBe("BT12-028");
    expect(result.stack.map(({ cardId }) => cardId)).toEqual(expect.arrayContaining(["BT12-022", "BT12-050"]));
    expect(s.perm("tamer").isSuspended).toBe(true);
  });

  it("fires the ordinary route from a real public end-of-turn transition", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "tamer" },
            { card: "BT12-021", as: "source" },
          ],
          hand: [{ card: "BT12-022", as: "result" }],
          deck: ["BT1-010", "BT1-011"],
        },
        1: { deck: ["BT1-012", "BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    s.state.memory = 10;
    await s.ready();

    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await settle(() => s.perm("source").topCard.cardId === "BT12-022");
    expect(s.perm("source").stack.map(({ cardId }) => cardId)).toEqual(["BT12-021"]);
    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.state.memory).toBe(-5);
    await turn;
  });

  it("plays from security through a real public attack", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT1-019", as: "attacker", dp: 20000 }],
        deck: ["BT1-010"],
      },
      1: {
        security: [{ card: CARD_ID, as: "securityTamer" }],
        deck: ["BT1-011"],
      },
    });
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === CARD_ID));
    expect(s.state.players[1]!.security).toHaveLength(0);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toContain(CARD_ID);
  });
});

describe("Davis and Ken end-of-turn breeding boundary", () => {
  it("leaves the breeding Digimon unchanged when it is the only possible evolution base", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: CARD_ID, as: "tamer" }],
          breeding: { card: "BT12-021", as: "breeding" },
          hand: [{ card: "BT12-022", as: "evolution" }],
          deck: ["BT1-010"],
        },
        1: { battleArea: [{ card: "BT1-009" }], deck: ["BT1-011"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    const memoryBefore = s.state.memory;
    await advance(s.engine).fire(EffectTiming.EndOfYourTurn, s.perm("tamer"));
    expect(s.perm("breeding").topCard.cardId).toBe("BT12-021");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("evolution").instanceId);
    expect(s.state.memory).toBe(memoryBefore);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
