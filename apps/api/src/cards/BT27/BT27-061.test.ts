import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { compiled } from "#api/cards/BT27/BT27-061";
import "#api/cards/index";

const handCardIds = (s: ReturnType<typeof setupEngine>) => s.state.players[0]!.hand.map((card) => card.cardId);
const battleCardIds = (s: ReturnType<typeof setupEngine>, seat: 0 | 1) =>
  s.state.players[seat]!.battleArea.map((permanent) => permanent.topCard.cardId);

async function deleteKnight(hand: string[], accept: boolean) {
  const s = setupEngine(
    { 0: { battleArea: [{ card: "BT27-061", as: "knight" }], hand } },
    { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
  );
  await s.ready();
  s.state.memory = 3;
  await advance(s.engine).verb.deletePermanent([s.perm("knight").permanentId]);
  await settle(() => s.state.pendingDecision === undefined);
  return s;
}

describe("KnightChessmon free Chessmon play on deletion", () => {
  it("declares Blocker, both alternate routes, and full coverage", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects[0]?.keywords).toEqual([{ keyword: "Blocker" }]);
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 3, names: ["Chessmon"], cost: 2, isAlternate: true },
      { level: 3, traits: ["DATA SQUAD"], cost: 2, isAlternate: true },
    ]);
  });

  it.each([true, false])("plays a play cost 4 Chessmon for free, accepted=%s", async (accept) => {
    const s = await deleteKnight(["BT27-039"], accept);
    expect(battleCardIds(s, 0)).toEqual(accept ? ["BT27-039"] : []);
    expect(handCardIds(s)).toEqual(accept ? [] : ["BT27-039"]);
    expect(s.state.memory).toBe(3);
    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toEqual(["BT27-061"]);
  });

  it("ignores a play cost 5 Chessmon and a DATA SQUAD card without Chessmon in its name", async () => {
    const s = await deleteKnight(["BT13-068", "BT27-074"], true);
    expect(battleCardIds(s, 0)).toEqual([]);
    expect(handCardIds(s)).toEqual(["BT13-068", "BT27-074"]);
    expect(s.decisions.some(({ req }) => req.sourceCardId === "BT27-061")).toBe(false);
  });

  it("prompts with its own On Deletion clause", async () => {
    const s = await deleteKnight(["BT27-039"], false);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-061")
        .map(({ req }) => req.options?.effectText),
    ).toEqual([
      "[On Deletion] You may play 1 play cost 4 or lower Digimon card with [Chessmon] in its name from your hand without paying the cost.",
    ]);
  });
});

describe("KnightChessmon inherited De-Digivolve on deletion", () => {
  it("peels the opponent's top card from a Chessmon stack without playing from hand", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT27-041", under: ["BT27-036", "BT27-061"], as: "bishop" }],
          hand: ["BT27-039"],
        },
        1: { battleArea: [{ card: "BT1-020", under: ["BT1-014"], as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("bishop").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("target").topCard.cardId).toBe("BT1-014");
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(["BT1-020"]);
    expect(handCardIds(s)).toEqual(["BT27-039"]);
  });

  it("does not De-Digivolve when KnightChessmon itself is deleted from the top", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-061", as: "knight" }] },
        1: { battleArea: [{ card: "BT1-020", under: ["BT1-014"], as: "target" }] },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("knight").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("target").topCard.cardId).toBe("BT1-020");
  });
});

describe("KnightChessmon digivolution", () => {
  it.each([
    ["a Chessmon name through the alternate route", "BT27-036", true, 8],
    ["a Chessmon name through its Black cost", "BT27-036", false, 7],
    ["a DATA SQUAD trait", "BT27-074", true, 8],
    ["only a Black level 3", "BT2-052", false, 7],
  ])("digivolves from %s", async (_label, base, useAlternateCost, memory) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "host" }], hand: [{ card: "BT27-061", as: "card" }], deck: ["BT1-009"] } },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("card").instanceId,
        useAlternateCost,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-061" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(memory);
    expect([...s.perm("host").keywords]).toContain("Blocker");
  });
});
