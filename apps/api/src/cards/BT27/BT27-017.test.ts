import { afterEach, describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { registerIrCard } from "#api/engine/effects/interpreter";
import { unregisterIrCard } from "#api/engine/effects/interpreter/registration/unregisterIrCard";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { syntheticDefinitions } from "#api/engine/testkit/syntheticDefinitions";
import { compiled } from "#api/cards/BT27/BT27-017";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const spinomon = "BT27-017";
const stegomon = "BT27-048";
const nonBioStegomon = "TEST-BT27-017-NON-BIO-STEGOMON";
const kurataTamer = "BT27-098";
const traitlessTamer = "BT1-085";
const vanillaMega = "BT1-080";
const filler = Array(20).fill("BT1-013");

function findSpinomon(s: Session) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === spinomon);
}

function defineNonBioStegomon() {
  syntheticDefinitions.set(nonBioStegomon, {
    ...getCardDefinition(stegomon)!,
    cardId: nonBioStegomon,
    types: ["Stegosaur", "Kurata's Army"],
    effectText: undefined,
  });
  registerIrCard(nonBioStegomon, { effects: [], coverage: "full", residual: [] });
}

async function opponentTurn(s: Session) {
  s.state.turnSeat = 1;
  await s.engine.recomputeContinuousEffects();
}

describe("Spinomon Stegomon and Kurata's Army digivolve, DP deletion, and suspended attack lock", () => {
  afterEach(() => {
    for (const id of syntheticDefinitions.keys()) unregisterIrCard(id);
    syntheticDefinitions.clear();
  });

  it("prints red and purple Mega stats with both level 5 digivolution costs", () => {
    expect(requireCardDefinition(spinomon)).toMatchObject({
      nameEn: "Spinomon",
      nameJp: "スピノモン",
      colors: ["Red", "Purple"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Red", level: 5, memoryCost: 4 },
        { color: "Purple", level: 5, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Dinosaur", "Kurata's Army", "Bio"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Stegomon"], traits: ["Bio"], cost: 5, isAlternate: true },
      { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
    ]);
  });

  it("has Security Attack +1, Armor Purge, Engage, and can't digivolve in play", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: spinomon, as: "spinomon" }] } });
    await s.ready();
    const view = observe(s.engine);
    expect(view.keywordAmount(s.perm("spinomon"), "SecurityAttack")).toBe(1);
    expect(view.hasKeyword(s.perm("spinomon"), "Armor Purge")).toBe(true);
    expect(view.hasKeyword(s.perm("spinomon"), "Engage")).toBe(true);
    expect(view.isRestricted(s.perm("spinomon"), "digivolve")).toBe(true);
  });

  it.each([
    ["a Bio Stegomon for 5", stegomon, true, true, 5],
    ["a Kurata's Army Tamer for 7", kurataTamer, true, true, 7],
    ["a red level 5 Digimon for its printed 4", "BT1-020", false, true, 4],
    ["a purple level 5 Digimon for its printed 4", "BT10-079", false, true, 4],
    ["a Stegomon without the Bio trait", nonBioStegomon, true, false, 0],
    ["a traitless Tamer", traitlessTamer, true, false, 0],
    ["a green level 5 Digimon", "BT3-053", false, false, 0],
  ])("digivolves from %s", async (_label, base, useAlternateCost, allowed, cost) => {
    if (base === nonBioStegomon) defineNonBioStegomon();
    const s = setupEngine(
      {
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: spinomon, as: "spinomon" }], deck: filler },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 7;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("spinomon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("base").topCard.cardId === spinomon && !s.state.pendingDecision);
    expect(s.state.memory).toBe(7 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? spinomon : base);
  });

  it.each([
    ["On Play", false],
    ["When Digivolving", true],
  ])("deletes an opposing Digimon with as much DP as itself or less on %s", async (_timing, digivolve) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: spinomon, as: "spinomon" }],
          battleArea: digivolve ? [{ card: "BT1-020", as: "base" }] : [],
          deck: filler,
        },
        1: {
          battleArea: [
            { card: vanillaMega, as: "larger" },
            { card: vanillaMega, as: "boundary", dp: 11000 },
          ],
        },
      },
      { autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("larger").permanentId, s.perm("larger").topCard.instanceId);
    s.state.memory = 11;
    await s.ready();
    const boundary = s.perm("boundary").topCard.instanceId;
    const intent = digivolve
      ? {
          type: "digivolve" as const,
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("spinomon").instanceId,
        }
      : { type: "playCard" as const, instanceId: s.inst("spinomon").instanceId };
    expect(s.engine.applyIntent(0, intent)).toEqual({ ok: true });
    await settle(() => findSpinomon(s) !== undefined && !s.state.pendingDecision);
    expect(s.state.players[1]!.trash.map(({ instanceId }) => instanceId)).toEqual([boundary]);
    expect(s.state.players[1]!.battleArea.map(({ permanentId }) => permanentId)).toEqual([
      s.perm("larger").permanentId,
    ]);
    assertNoLoudGap(s);
  });

  it("deletes nothing when every opposing Digimon has more DP", async () => {
    const s = setupEngine(
      {
        0: { hand: [{ card: spinomon, as: "spinomon" }], deck: filler },
        1: { battleArea: [{ card: vanillaMega, as: "larger" }] },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 11;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("spinomon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => findSpinomon(s) !== undefined && !s.state.pendingDecision);
    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("stops every opposing Digimon from attacking players only while suspended on the opponent's turn", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: spinomon, as: "spinomon", suspended: true }], security: ["BT1-009"] },
      1: {
        battleArea: [
          { card: "BT1-009", as: "first" },
          { card: "BT1-013", as: "second" },
        ],
      },
    });
    await s.ready();
    const view = observe(s.engine);
    expect(view.isRestricted(s.perm("first"), "attackPlayers")).toBe(false);

    await opponentTurn(s);
    expect(view.isRestricted(s.perm("first"), "attackPlayers")).toBe(true);
    expect(view.isRestricted(s.perm("second"), "attackPlayers")).toBe(true);
    expect(view.isRestricted(s.perm("spinomon"), "attackPlayers")).toBe(false);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("first").permanentId,
        target: { kind: "player" },
      }),
    ).toMatchObject({ ok: false });

    s.perm("spinomon").isSuspended = false;
    await s.engine.recomputeContinuousEffects();
    expect(view.isRestricted(s.perm("first"), "attackPlayers")).toBe(false);
  });

  it("still lets opposing Digimon attack it while suspended", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: spinomon, as: "spinomon", suspended: true }], security: ["BT1-009"] },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }] },
      },
      { autoSelectCards: true },
    );
    await s.ready();
    await opponentTurn(s);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: s.perm("spinomon").permanentId },
      }),
    ).toEqual({ ok: true });
  });
});
