import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/index";

describe("BishopChessmon scaled weakening", () => {
  it("counts its own Chessmon and other named Digimon while excluding DATA SQUAD alone", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-036" }, { card: "BT27-074" }], hand: [{ card: "BT27-041", as: "bishop" }] },
        1: { battleArea: [{ card: "BT1-009", dp: 15000, as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bishop").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.perm("target").currentDP === 9000 && s.state.pendingDecision === undefined);
    expect([...s.perm("target").keywords]).toContain("SecurityAttack");
    expect(s.state.memory).toBe(3);
    const bishop = s.state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT27-041")!;
    expect([...bishop.keywords]).toEqual(expect.arrayContaining(["Barrier", "Ascension"]));
  });
  it("reduces DP once when another Chessmon is deleted beneath a host", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-084", under: ["BT27-041"], as: "host" },
            { card: "BT27-036", as: "pawn" },
            { card: "BT27-036", as: "other" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", dp: 15000, as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("pawn").permanentId]);
    expect(s.perm("target").currentDP).toBe(10000);
    await advance(s.engine).verb.deletePermanent([s.perm("other").permanentId]);
    expect(s.perm("target").currentDP).toBe(10000);
  });
  it("evolves the complete Chessmon stack and retains weakening until the opponent turn ends", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-004", as: "host" }],
          hand: [
            { card: "BT27-036", as: "pawn" },
            { card: "BT27-039", as: "knight" },
            { card: "BT27-041", as: "bishop" },
          ],
          deck: Array(8).fill("BT1-009"),
        },
        1: { battleArea: [{ card: "BT1-009", dp: 15000, as: "target" }], deck: Array(8).fill("BT1-009") },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    for (const [alias, cardId] of [
      ["pawn", "BT27-036"],
      ["knight", "BT27-039"],
      ["bishop", "BT27-041"],
    ]) {
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("host").permanentId,
          instanceId: s.inst(alias!).instanceId,
          alternateRequirementIndex: 1,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("host").topCard.cardId === cardId && s.state.pendingDecision === undefined);
    }
    await settle(() => s.perm("target").currentDP === 12000);
    expect(s.state.memory).toBe(5);
    expect(s.perm("host").stack.map((c) => c.cardId)).toEqual(["BT27-004", "BT27-036", "BT27-039"]);
    await advance(s.engine).runTurn(0);
    expect(s.perm("target").currentDP).toBe(12000);
    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    expect(s.perm("target").currentDP).toBe(15000);
    expect([...s.perm("target").keywords]).not.toContain("SecurityAttack");
  });
  it.each([true, false])("may ascend its top card on deletion, accepted=%s", async (accept) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-041", under: ["BT27-036", "BT27-039"], as: "bishop" }], security: ["BT1-009"] },
      },
      { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bishop").permanentId]);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.security.map((c) => c.cardId)).toEqual(accept ? ["BT27-041", "BT1-009"] : ["BT1-009"]);
    expect(s.state.players[0]!.trash.map((c) => c.cardId)).toEqual(expect.arrayContaining(["BT27-036", "BT27-039"]));
    expect(s.state.players[0]!.trash.some((c) => c.cardId === "BT27-041")).toBe(!accept);
  });
  it("digivolves from a plain Black level 4 Digimon through its Black cost", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-062", as: "host" }],
          hand: [{ card: "BT27-041", as: "card" }],
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
    await settle(() => s.perm("host").topCard.cardId === "BT27-041" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(7);
  });
  it("highlights the Security Attack clause while choosing the weakened Digimon", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: "BT27-041", as: "bishop" }] },
        1: {
          battleArea: [
            { card: "BT1-009", dp: 15000 },
            { card: "BT1-010", dp: 15000 },
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("bishop").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-041") &&
        s.state.pendingDecision === undefined,
    );
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "chooseTargets" && req.sourceCardId === "BT27-041")
        .map(({ req }) => req.options?.effectTextEmphasis),
    ).toEqual([
      "[On Play] [When Digivolving] Until your opponent's turn ends, give 1 of their Digimon ＜Security A. -1＞",
    ]);
  });
});
