import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { compiled } from "#api/cards/BT27/BT27-065";
import "#api/cards/index";

type Setup = ReturnType<typeof setupEngine>;
type Seat = 0 | 1;

const battleCardIds = (s: Setup, seat: Seat) => s.state.players[seat]!.battleArea.map(({ topCard }) => topCard.cardId);
const trashCardIds = (s: Setup, seat: Seat) => s.state.players[seat]!.trash.map(({ cardId }) => cardId);

async function digivolveMamemonX(
  board: Parameters<typeof setupEngine>[0],
  options: { accept: boolean; prefer?: string; useAlternateCost?: boolean },
) {
  const preferInstanceIds: string[] = [];
  const s = setupEngine(board, {
    autoSelectCards: true,
    autoAcceptOptional: options.accept,
    autoDeclineOptional: !options.accept,
    preferInstanceIds,
  });
  await s.ready();
  s.state.memory = 10;
  if (options.prefer !== undefined) preferInstanceIds.push(s.perm(options.prefer).topCard.instanceId);
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("host").permanentId,
      instanceId: s.inst("mamemonX").instanceId,
      useAlternateCost: options.useAlternateCost ?? true,
    }),
  ).toEqual({ ok: true });
  await settle(
    () =>
      s.state.players[0]!.hand.length === 0 &&
      s.engine.combat?.isAttacking !== true &&
      s.state.pendingDecision === undefined,
  );
  return s;
}

describe("Mamemon (X Antibody) catalog and digivolution", () => {
  it("matches the printed catalog entry and IR contract", () => {
    expect(getCardDefinition("BT27-065")).toMatchObject({
      nameEn: "Mamemon (X Antibody)",
      nameJp: "マメモンX抗体",
      colors: ["Black", "Red"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      evoCosts: [
        { color: "Black", level: 4, memoryCost: 4 },
        { color: "Red", level: 4, memoryCost: 4 },
      ],
      forms: ["Ultimate"],
      attributes: ["Data"],
      types: ["Mutant", "X Antibody"],
      rarity: "U",
    });
    expect(compiled.effects.map(({ trigger, isInherited }) => [trigger, isInherited ?? false])).toEqual([
      ["WhenDigivolving", false],
      ["OnDeletion", false],
      ["AllTurns", true],
    ]);
    expect(compiled.digivolutionRequirement).toEqual([
      { level: 5, names: ["Mamemon"], excludeTraits: ["X Antibody"], cost: 1, isAlternate: true },
    ]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it.each([
    ["a level 5 Mamemon through the cost 1 route", "BT6-063", 9],
    ["a level 5 MetalMamemon through the cost 1 route", "BT3-071", 9],
    ["a level 4 Mamemon-named Thundermon only through its printed cost", "BT8-061", 6],
  ])("digivolves from %s", async (_label, base, memory) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: base, as: "host" }], hand: [{ card: "BT27-065", as: "mamemonX" }] } },
      { autoDeclineOptional: true },
    );
    await s.ready();
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("mamemonX").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("host").topCard.cardId === "BT27-065" && s.state.pendingDecision === undefined);
    expect(s.state.memory).toBe(memory);
  });

  it.each([
    ["another Mamemon (X Antibody)", "BT27-065"],
    ["a level 5 without Mamemon in its name", "BT1-020"],
  ])("rejects the cost 1 route from %s", (_label, base) => {
    const s = setupEngine({
      0: { battleArea: [{ card: base, as: "host" }], hand: [{ card: "BT27-065", as: "mamemonX" }] },
    });
    s.state.memory = 10;
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("host").permanentId,
      instanceId: s.inst("mamemonX").instanceId,
      useAlternateCost: true,
    });
    expect(result.ok).toBe(false);
    expect(s.state.memory).toBe(10);
  });
});

describe("Mamemon (X Antibody) When Digivolving Rush attack", () => {
  it("lets another Mamemon gain Rush and attack, then deletes it at the end of that attack", async () => {
    const s = await digivolveMamemonX(
      {
        0: {
          battleArea: [
            { card: "BT6-063", as: "host" },
            { card: "BT6-063", as: "attacker" },
          ],
          hand: [{ card: "BT27-065", as: "mamemonX" }],
        },
        1: { security: ["BT1-010", "BT1-010"] },
      },
      { accept: true, prefer: "attacker" },
    );
    expect(s.state.memory).toBe(9);
    expect(battleCardIds(s, 0)).toEqual(["BT27-065"]);
    expect(trashCardIds(s, 0)).toEqual(["BT6-063"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("deletes this Digimon after its own attack and resolves its On Deletion", async () => {
    const s = await digivolveMamemonX(
      {
        0: { battleArea: [{ card: "BT6-063", as: "host" }], hand: [{ card: "BT27-065", as: "mamemonX" }] },
        1: { security: ["BT1-010", "BT1-010", "BT1-010"] },
      },
      { accept: true },
    );
    expect(battleCardIds(s, 0)).toEqual([]);
    expect(trashCardIds(s, 0).sort()).toEqual(["BT27-065", "BT6-063"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("keeps the Digimon and attacks with nobody when declined", async () => {
    const s = await digivolveMamemonX(
      {
        0: {
          battleArea: [
            { card: "BT6-063", as: "host" },
            { card: "BT6-063", as: "attacker" },
          ],
          hand: [{ card: "BT27-065", as: "mamemonX" }],
        },
        1: { security: ["BT1-010", "BT1-010"] },
      },
      { accept: false, prefer: "attacker" },
    );
    expect(battleCardIds(s, 0)).toEqual(["BT27-065", "BT6-063"]);
    expect(s.perm("attacker").isSuspended).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("does not offer the attack without a Mamemon-named digivolution card", async () => {
    const s = await digivolveMamemonX(
      {
        0: {
          battleArea: [
            { card: "BT1-018", as: "host" },
            { card: "BT6-063", as: "attacker" },
          ],
          hand: [{ card: "BT27-065", as: "mamemonX" }],
        },
        1: { security: ["BT1-010", "BT1-010"] },
      },
      { accept: true, prefer: "attacker", useAlternateCost: false },
    );
    expect(s.state.memory).toBe(6);
    expect(battleCardIds(s, 0)).toEqual(["BT27-065", "BT6-063"]);
    expect(s.decisions.some(({ req }) => req.kind === "optional" && req.sourceCardId === "BT27-065")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(2);
  });

  it("counts a Thundermon (X Antibody) rule name in the digivolution cards", async () => {
    const s = await digivolveMamemonX(
      {
        0: {
          battleArea: [
            { card: "BT1-018", under: ["BT27-060"], as: "host" },
            { card: "BT6-063", as: "attacker" },
          ],
          hand: [{ card: "BT27-065", as: "mamemonX" }],
        },
        1: { security: ["BT1-010", "BT1-010"] },
      },
      { accept: true, prefer: "attacker", useAlternateCost: false },
    );
    expect(trashCardIds(s, 0)).toEqual(["BT6-063"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});

describe("Mamemon (X Antibody) On Deletion", () => {
  async function deleteMamemonX(board: Parameters<typeof setupEngine>[0]) {
    const s = setupEngine(board, { autoSelectCards: true, autoDeclineOptional: true });
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("mamemonX").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    return s;
  }

  it("deletes the opponent's lowest DP Digimon and keeps their security", async () => {
    const s = await deleteMamemonX({
      0: { battleArea: [{ card: "BT27-065", as: "mamemonX" }] },
      1: {
        battleArea: [
          { card: "BT6-063", as: "high" },
          { card: "BT1-010", as: "low" },
        ],
        security: ["BT1-010"],
      },
    });
    expect(battleCardIds(s, 1)).toEqual(["BT6-063"]);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("trashes the opponent's top security card when nothing is deleted", async () => {
    const s = await deleteMamemonX({
      0: { battleArea: [{ card: "BT27-065", as: "mamemonX" }] },
      1: {
        security: [
          { card: "BT1-010", as: "bottom" },
          { card: "BT6-063", as: "top" },
        ],
      },
    });
    expect(trashCardIds(s, 1)).toHaveLength(1);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });
});

describe("Mamemon (X Antibody) inherited deletion response", () => {
  function inheritedBoard(victims: { card: string; as: string }[]) {
    return setupEngine(
      {
        0: { battleArea: [{ card: "BT6-063", under: ["BT27-065"], as: "host" }, ...victims] },
        1: {
          battleArea: [
            { card: "BT6-063", as: "expensive" },
            { card: "BT1-010", as: "cheap" },
            { card: "BT1-010", as: "cheapSecond" },
          ],
        },
      },
      { autoSelectCards: true, autoDeclineOptional: true },
    );
  }

  it("deletes the opponent's lowest play cost Digimon once per turn when other Mamemon are deleted", async () => {
    const s = inheritedBoard([
      { card: "BT6-063", as: "firstVictim" },
      { card: "BT3-071", as: "secondVictim" },
    ]);
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("firstVictim").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(battleCardIds(s, 1)).toEqual(["BT6-063", "BT1-010"]);
    await advance(s.engine).verb.deletePermanent([s.perm("secondVictim").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(battleCardIds(s, 1)).toEqual(["BT6-063", "BT1-010"]);
  });

  it("ignores a deleted Digimon without Mamemon in its name", async () => {
    const s = inheritedBoard([{ card: "BT1-010", as: "victim" }]);
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("victim").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(battleCardIds(s, 1)).toEqual(["BT6-063", "BT1-010", "BT1-010"]);
  });

  it("ignores the deletion of the Digimon that carries it", async () => {
    const s = inheritedBoard([]);
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId]);
    await settle(() => s.state.pendingDecision === undefined);
    expect(battleCardIds(s, 1)).toEqual(["BT6-063", "BT1-010", "BT1-010"]);
  });
});
