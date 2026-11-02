import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-066";
import "#api/cards/index";

type Engine = ReturnType<typeof setupEngine>;

const opponentBoard = [
  { card: "BT1-080", under: ["BT1-019", "BT1-024"], as: "target" },
  { card: "BT1-038", as: "costFive" },
  { card: "BT1-059", as: "costSix" },
];
const trashIds = (s: Engine, seat: 0 | 1) => s.state.players[seat]!.trash.map((card) => card.cardId);
const battleIds = (s: Engine, seat: 0 | 1) => s.state.players[seat]!.battleArea.map((p) => p.topCard.cardId);

async function playRook(allies: string[]) {
  const s = setupEngine(
    {
      0: { battleArea: allies.map((card) => ({ card })), hand: [{ card: "BT27-066", as: "rook" }] },
      1: { battleArea: opponentBoard },
    },
    { autoSelectCards: true, autoDeclineOptional: true },
  );
  await s.ready();
  s.state.memory = 10;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("rook").instanceId })).toEqual({ ok: true });
  await settle(
    () =>
      s.events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "BT27-066") && !s.state.pendingDecision,
  );
  return s;
}

describe("RookChessmon De-Digivolve then delete", () => {
  it("declares Reboot, Blocker, both alternate routes, and full coverage", () => {
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects[0]?.keywords).toEqual([{ keyword: "Reboot" }, { keyword: "Blocker" }]);
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 4, names: ["Chessmon"], cost: 3, isAlternate: true },
      { level: 4, traits: ["DATA SQUAD"], cost: 3, isAlternate: true },
    ]);
  });

  it("peels once per other Chessmon-name Digimon, ignoring DATA SQUAD-only allies, then deletes a play cost 5", async () => {
    const s = await playRook(["BT27-039", "BT13-068", "BT27-074"]);
    expect(s.state.memory).toBe(3);
    expect(s.perm("target").topCard.cardId).toBe("BT1-019");
    expect(trashIds(s, 1)).toEqual(expect.arrayContaining(["BT1-080", "BT1-024", "BT1-038"]));
    expect(trashIds(s, 1)).toHaveLength(3);
    expect(battleIds(s, 1)).toEqual(["BT1-019", "BT1-059"]);
    expect([...s.perm("rook").keywords]).toEqual(expect.arrayContaining(["Reboot", "Blocker"]));
  });

  it("does not count itself, but still deletes when no other Chessmon is present", async () => {
    const s = await playRook(["BT27-074"]);
    expect(s.perm("target").topCard.cardId).toBe("BT1-080");
    expect(trashIds(s, 1)).toEqual(["BT1-038"]);
    expect(battleIds(s, 1)).toEqual(["BT1-080", "BT1-059"]);
  });

  it("counts the remaining other Chessmon when it resolves on deletion", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT27-066", as: "rook" }, { card: "BT27-039" }] },
        1: { battleArea: opponentBoard },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("rook").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(trashIds(s, 0)).toEqual(["BT27-066"]);
    expect(s.perm("target").topCard.cardId).toBe("BT1-024");
    expect(trashIds(s, 1)).toEqual(expect.arrayContaining(["BT1-080", "BT1-038"]));
    expect(battleIds(s, 1)).toEqual(["BT1-024", "BT1-059"]);
  });
});

async function attackInto(defender: { card: string; under?: string[] }, accept: boolean, attackers = 1) {
  const s = setupEngine(
    {
      0: {
        battleArea: Array.from({ length: attackers }, (_, index) => ({
          card: "BT1-009",
          as: `attacker${index}`,
          dp: 3000,
        })),
      },
      1: { battleArea: [{ ...defender, as: "defender" }], security: ["BT1-009", "BT1-009"] },
    },
    { autoSelectCards: true, autoAcceptOptional: accept, autoDeclineOptional: !accept },
  );
  await s.ready();
  for (let index = 0; index < attackers; index++) {
    const attackerPermanentId = s.perm(`attacker${index}`).permanentId;
    expect(s.engine.applyIntent(0, { type: "attack", attackerPermanentId, target: { kind: "player" } })).toEqual({
      ok: true,
    });
    await advance(s.engine).finishAttack();
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  }
  return s;
}

const redirectPrompts = (s: Engine) =>
  s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-066").length;

describe("RookChessmon inherited attack redirect", () => {
  const stack = { card: "BT1-080", under: ["BT27-036", "BT27-061", "BT27-066"] };

  it("changes the attack target to the Digimon carrying the inherited effect", async () => {
    const s = await attackInto(stack, true);
    expect(redirectPrompts(s)).toBe(1);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(battleIds(s, 0)).toEqual([]);
    expect(battleIds(s, 1)).toEqual(["BT1-080"]);
  });

  it("lets the attack continue when declined", async () => {
    const s = await attackInto(stack, false);
    expect(redirectPrompts(s)).toBe(1);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("redirects only once per turn", async () => {
    const s = await attackInto(stack, true, 2);
    expect(redirectPrompts(s)).toBe(1);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("does not redirect while RookChessmon is the top card", async () => {
    const s = await attackInto({ card: "BT27-066" }, true);
    expect(redirectPrompts(s)).toBe(0);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});

describe("RookChessmon digivolution", () => {
  it.each([
    ["a Chessmon name through the alternate route", "BT27-061", true, 7],
    ["a Chessmon name through its Black cost", "BT27-061", false, 6],
    ["a DATA SQUAD trait", "BT27-078", true, 7],
  ])("digivolves from %s", async (_label, base, useAlternateCost, memory) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "host" }], hand: [{ card: "BT27-066", as: "card" }], deck: ["BT1-009"] } },
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
    await settle(() => s.perm("host").topCard.cardId === "BT27-066" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(memory);
  });
});
