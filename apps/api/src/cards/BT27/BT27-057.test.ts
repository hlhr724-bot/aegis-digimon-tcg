import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { compiled } from "./BT27-057.js";
import "#api/cards/index";

const cardId = "BT27-057";
const startText =
  "[Start of Your Main Phase] By trashing 1 card with [Chessmon] in its text from your hand, ＜Draw 1＞ and gain 1 memory.";

describe("BT27-057 PawnChessmon", () => {
  it("matches the catalog and compiles the start-of-main draw, inherited De-Digivolve, and alternate digivolve", () => {
    expect(getCardDefinition(cardId)).toMatchObject({
      nameEn: "PawnChessmon",
      colors: ["Black", "Yellow"],
      level: 3,
      playCost: 3,
      dp: 2000,
      types: ["Puppet", "DATA SQUAD"],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects.map(({ trigger, isInherited }) => [trigger, isInherited ?? false])).toEqual([
      ["StartOfYourMainPhase", false],
      ["OnDeletion", true],
    ]);
  });

  it.each([
    ["a Chessmon-named card", "BT27-036", true],
    ["a card with Chessmon only in its text", "BT27-004", true],
    ["a DATA SQUAD card without Chessmon in its text", "BT27-074", false],
  ] as const)("start of main trashes %s to draw 1 and gain 1 memory: %s", async (_label, card, paid) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "pawn" }],
          hand: [{ card, as: "cost" }],
          deck: [{ card: "BT1-009", as: "drawn" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("pawn"));
    await settle();

    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual(
      paid ? [s.inst("cost").instanceId] : [],
    );
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      paid ? s.inst("drawn").instanceId : s.inst("cost").instanceId,
    ]);
    expect(s.state.memory).toBe(paid ? 1 : 0);
    assertNoLoudGap(s);
  });

  it("declining the trash keeps the hand and grants nothing", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "pawn" }],
          hand: [{ card: "BT27-036", as: "cost" }],
          deck: ["BT1-009"],
        },
      },
      { autoDeclineOptional: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("pawn"));
    await settle();

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("cost").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
    expect(s.state.memory).toBe(0);
  });

  it("highlights the trash cost while the card is chosen", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: cardId, as: "pawn" }],
          hand: ["BT27-036", "BT27-004"],
          deck: ["BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireForPermanent(EffectTiming.OnStartMainPhase, s.perm("pawn"));
    await settle();

    const selection = s.decisions.find(({ req }) => req.kind === "selectCards" && req.sourceCardId === cardId);
    expect(selection?.req.options?.effectText).toBe(startText);
  });

  it.each([
    ["as an inherited source", true, "BT1-009"],
    ["while it is the top card", false, "BT1-019"],
  ] as const)("On Deletion de-digivolves 1 opponent Digimon %s: %s", async (_label, inherited, expectedTop) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [inherited ? { card: "BT2-052", as: "host", under: [cardId] } : { card: cardId, as: "host" }],
        },
        1: { battleArea: [{ card: "BT1-019", as: "target", under: ["BT1-009"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle();

    expect(s.perm("target").topCard.cardId).toBe(expectedTop);
    expect(s.state.players[1]!.trash.map(({ cardId: id }) => id)).toEqual(inherited ? ["BT1-019"] : []);
  });

  function digivolveSetup(host: string) {
    return setupEngine(
      {
        0: {
          battleArea: [{ card: host, as: "host" }],
          hand: [{ card: cardId, as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
  }

  it.each([
    ["a Blue DATA SQUAD level 2 through the alternate cost", "BT25-002", true, 5],
    ["a Black level 2 with Chessmon in its text through the alternate cost", "BT27-004", true, 5],
    ["a Black level 2 through its printed Black cost", "BT27-004", false, 4],
  ] as const)("digivolves from %s", async (_label, host, useAlternateCost, memoryAfter) => {
    const s = digivolveSetup(host);
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === cardId && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(memoryAfter);
  });

  it("rejects the alternate digivolve from a Red level 2 without Chessmon in its text or the DATA SQUAD trait", async () => {
    const s = digivolveSetup("BT1-001");
    await s.ready();
    s.state.memory = 5;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(s.perm("host").topCard.cardId).toBe("BT1-001");
    expect(s.state.memory).toBe(5);
  });
});
