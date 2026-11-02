import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { EffectTiming } from "@aegis/shared/schema/enums";
import "#api/cards/index";

describe("PawnChessmon text and DATA SQUAD search", () => {
  it("adds a Chessmon text card and a distinct DATA SQUAD card and bottoms the remainder", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-036", as: "pawn" }], deck: ["BT13-101", "BT27-074", "BT1-009", "BT1-011"] } },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pawn").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-036") &&
        s.state.pendingDecision === undefined,
    );
    expect(s.state.players[0]!.hand.map((c) => c.cardId)).toEqual(["BT13-101", "BT27-074"]);
    expect(s.state.players[0]!.deck.map((c) => c.cardId)).toEqual(["BT1-011", "BT1-009"]);
  });
  it("applies its inherited reduction only once per turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-039", under: ["BT27-036"], as: "host" }] },
        1: { battleArea: [{ card: "BT1-009", dp: 10000, as: "target" }] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderCards: true },
    );
    await s.ready();
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.perm("target").currentDP).toBe(8000);
    await advance(s.engine).fire(EffectTiming.OnUseAttack, s.perm("host"));
    expect(s.perm("target").currentDP).toBe(8000);
  });
  it("digivolves from a plain Black level 2 Digimon through its Black cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-005", as: "host" }],
          hand: [{ card: "BT27-036", as: "card" }],
          deck: ["BT1-009"],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-036" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(10);
  });
  it("highlights each search category while its card is chosen", async () => {
    const s = setupEngine(
      { 0: { hand: [{ card: "BT27-036", as: "pawn" }], deck: ["BT13-101", "BT27-074", "BT1-009", "BT1-011"] } },
      { autoSelectCards: true, autoAcceptOptional: true, autoOrderCards: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("pawn").instanceId })).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-036") &&
        s.state.pendingDecision === undefined,
    );
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "selectCards" && req.sourceCardId === "BT27-036")
        .map(({ req }) => req.options?.effectTextEmphasis),
    ).toEqual(["Add 1 card with [Chessmon] in its text", "1 [DATA SQUAD] trait card among them to the hand."]);
  });
});
