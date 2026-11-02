import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-026";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const thunderbirdmon = "BT27-026";
const kurataTamer = "BT27-098";
const traitlessTamer = "BT1-085";
const blueRookie = "BT1-027";
const filler = Array(20).fill("BT1-013");
const securityFiller = Array(3).fill("BT1-009");

function findThunderbirdmon(s: Session) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === thunderbirdmon);
}

function trashIds(s: Session, seat: 0 | 1) {
  return s.state.players[seat]!.trash.map(({ instanceId }) => instanceId);
}

async function playThunderbirdmon(s: Session) {
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("thunderbirdmon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => findThunderbirdmon(s) !== undefined && !s.state.pendingDecision);
}

function sourceBoard(options: Parameters<typeof setupEngine>[1]) {
  return setupEngine(
    {
      0: {
        hand: [{ card: thunderbirdmon, as: "thunderbirdmon" }, "BT1-013"],
        battleArea: [{ card: "BT1-009", as: "fodder" }],
        deck: filler,
        security: securityFiller,
      },
      1: {
        battleArea: [
          { card: "BT1-041", as: "first", under: ["BT1-027"] },
          { card: "BT1-041", as: "second", under: ["BT1-028"] },
          { card: "BT1-013", as: "locked" },
        ],
        deck: filler,
        security: securityFiller,
      },
    },
    options,
  );
}

function preferFodderAndLocked(s: Session, preferred: string[]) {
  preferred.push(
    s.perm("fodder").permanentId,
    s.perm("fodder").topCard.instanceId,
    s.perm("locked").permanentId,
    s.perm("locked").topCard.instanceId,
  );
}

describe("Thunderbirdmon trashes opposing sources, deletes a chosen own Digimon, and locks suspension", () => {
  it("prints blue and purple Armor Form stats and compiles the shared once-per-turn body", () => {
    expect(requireCardDefinition(thunderbirdmon)).toMatchObject({
      nameEn: "Thunderbirdmon",
      nameJp: "サンダーバーモン",
      colors: ["Blue", "Purple"],
      level: 4,
      playCost: 5,
      dp: 6000,
      evoCosts: [
        { color: "Blue", level: 3, memoryCost: 3 },
        { color: "Purple", level: 3, memoryCost: 3 },
      ],
      forms: ["Armor Form"],
      attributes: ["Data"],
      types: ["Giant Bird", "Kurata's Army", "Bio"],
      rarity: "U",
    });
    expect(requireCardDefinition(thunderbirdmon).inheritedEffectText).toBeUndefined();
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { baseIsTamer: true, traits: ["Kurata's Army"], cost: 2, isAlternate: true },
    ]);
    const bodies = compiled.effects.filter(({ sharedUseKey }) => sharedUseKey === "BT27-026/trash-delete-lock");
    expect(bodies.map(({ trigger }) => trigger)).toEqual(["OnPlay", "WhenDigivolving", "WhenAttacking"]);
    expect(bodies.every(({ frequency }) => frequency === "OncePerTurn")).toBe(true);
  });

  it("has Armor Purge in play", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: thunderbirdmon, as: "thunderbirdmon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("thunderbirdmon"), "Armor Purge")).toBe(true);
  });

  it.each([
    ["a Kurata's Army Tamer for 2", kurataTamer, true, true, 2],
    ["a traitless Tamer", traitlessTamer, true, false, 0],
    ["a blue level 3 Digimon for its printed 3", blueRookie, false, true, 3],
    ["a red level 3 Digimon", "BT1-009", false, false, 0],
  ])("digivolves from %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: base, as: "base" }],
          hand: [{ card: thunderbirdmon, as: "thunderbirdmon" }],
          deck: filler,
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("thunderbirdmon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("base").topCard.cardId === thunderbirdmon && !s.state.pendingDecision);
    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? thunderbirdmon : base);
  });

  it("pools sources across opposing Digimon, deletes the chosen Digimon, and locks suspension through their turn", async () => {
    const preferred: string[] = [];
    const s = sourceBoard({ autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    preferFodderAndLocked(s, preferred);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    const fodder = s.perm("fodder").topCard.instanceId;
    await playThunderbirdmon(s);
    expect(s.perm("first").stack).toHaveLength(0);
    expect(s.perm("second").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT1-027", "BT1-028"]);
    expect(trashIds(s, 0)).toContain(fodder);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "suspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("first"), "suspend")).toBe(false);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("locked").permanentId,
        target: { kind: "player" },
      }).ok,
    ).toBe(false);
    expect(s.perm("locked").isSuspended).toBe(false);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "suspend")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("still deletes and locks when the optional source trash is declined", async () => {
    const preferred: string[] = [];
    const s = sourceBoard({
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
      declinePrompts: ["TrashDigivolution"],
    });
    preferFodderAndLocked(s, preferred);
    s.state.memory = 5;
    await s.ready();
    const fodder = s.perm("fodder").topCard.instanceId;
    await playThunderbirdmon(s);
    expect(s.perm("first").stack).toHaveLength(1);
    expect(s.perm("second").stack).toHaveLength(1);
    expect(trashIds(s, 0)).toContain(fodder);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "suspend")).toBe(true);
  });

  it("keeps the source trash but skips deletion and the lock when no Digimon is chosen", async () => {
    const preferred: string[] = [];
    const s = sourceBoard({
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
      declinePrompts: ["SelectBind"],
    });
    preferFodderAndLocked(s, preferred);
    s.state.memory = 5;
    await s.ready();
    await playThunderbirdmon(s);
    expect(s.state.players[1]!.trash).toHaveLength(2);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("fodder").permanentId,
    );
    expect(observe(s.engine).isRestricted(s.perm("locked"), "suspend")).toBe(false);
  });

  it("trashes the only available source when fewer than 2 exist", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: thunderbirdmon, as: "thunderbirdmon" }], battleArea: [{ card: "BT1-009", as: "fodder" }] },
        1: {
          battleArea: [
            { card: "BT1-041", as: "first", under: ["BT1-027"] },
            { card: "BT1-013", as: "locked" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferFodderAndLocked(s, preferred);
    s.state.memory = 5;
    await s.ready();
    await playThunderbirdmon(s);
    expect(s.perm("first").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(["BT1-027"]);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "suspend")).toBe(true);
  });

  it("shares one use per turn between When Digivolving and When Attacking", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: thunderbirdmon, as: "thunderbirdmon" }],
          battleArea: [
            { card: "BT1-009", as: "fodder" },
            { card: blueRookie, as: "base" },
            { card: "BT1-013", as: "second" },
          ],
          deck: filler,
          security: securityFiller,
        },
        1: {
          battleArea: [
            { card: "BT1-041", as: "first", under: ["BT1-027", "BT1-028", "BT1-028"] },
            { card: "BT1-013", as: "locked" },
          ],
          security: securityFiller,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferFodderAndLocked(s, preferred);
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("thunderbirdmon").instanceId,
      }).ok,
    ).toBe(true);
    const fodder = s.perm("fodder").topCard.instanceId;
    await settle(() => !s.state.pendingDecision && trashIds(s, 0).includes(fodder));
    expect(s.perm("first").stack).toHaveLength(1);

    const prompts = s.decisions.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length === 2);
    expect(s.decisions.slice(prompts).filter(({ req }) => req.sourceCardId === thunderbirdmon)).toHaveLength(0);
    expect(s.perm("first").stack).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("second").permanentId,
    );
  });
});
