import { describe, expect, it } from "vitest";
import { effectiveStaticTraits } from "@aegis/shared";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-048";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const stegomon = "BT27-048";
const kurataTamer = "BT27-098";
const traitlessTamer = "BT1-085";
const filler = Array(20).fill("BT1-013");
const greenRookie = "BT1-064";
const securityFiller = Array(3).fill("BT1-009");

function findStegomon(s: Session) {
  return s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === stegomon);
}

function trashIds(s: Session, seat: 0 | 1) {
  return s.state.players[seat]!.trash.map(({ instanceId }) => instanceId);
}

async function playStegomon(s: Session) {
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("stegomon").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => findStegomon(s) !== undefined && !s.state.pendingDecision);
}

function lockBoard(options: Parameters<typeof setupEngine>[1]) {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: stegomon, as: "stegomon" }, "BT1-013"],
        battleArea: [{ card: "BT1-009", as: "fodder", suspended: true }],
        deck: filler,
        security: securityFiller,
      },
      1: {
        battleArea: [
          { card: "BT1-009", as: "locked" },
          { card: "BT1-013", as: "bystander", suspended: true },
        ],
        deck: filler,
        security: securityFiller,
      },
    },
    options,
  );
  return s;
}

function preferLockTargets(s: Session, preferred: string[]) {
  preferred.push(s.perm("locked").permanentId, s.perm("locked").topCard.instanceId);
}

describe("Stegomon Kurata's Army Tamer digivolve and suspend, delete, and unsuspend lock", () => {
  it("prints green and purple Armor Form stats with the Dinosaur rule trait", () => {
    expect(requireCardDefinition(stegomon)).toMatchObject({
      nameEn: "Stegomon",
      nameJp: "ステゴモン",
      colors: ["Green", "Purple"],
      level: 4,
      playCost: 5,
      dp: 6000,
      evoCosts: [
        { color: "Green", level: 3, memoryCost: 3 },
        { color: "Purple", level: 3, memoryCost: 3 },
      ],
      forms: ["Armor Form"],
      attributes: ["Free"],
      types: ["Stegosaur", "Kurata's Army", "Bio"],
      rarity: "U",
    });
    expect(requireCardDefinition(stegomon).inheritedEffectText).toBeUndefined();
    expect(effectiveStaticTraits(requireCardDefinition(stegomon))).toEqual(
      expect.arrayContaining(["Stegosaur", "Kurata's Army", "Bio", "Dinosaur"]),
    );
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { baseIsTamer: true, traits: ["Kurata's Army"], cost: 2, isAlternate: true },
    ]);
  });

  it("has Armor Purge in play", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: stegomon, as: "stegomon" }] } });
    await s.ready();
    expect(observe(s.engine).hasKeyword(s.perm("stegomon"), "Armor Purge")).toBe(true);
  });

  it.each([
    ["a Kurata's Army Tamer for 2", kurataTamer, true, true, 2],
    ["a traitless Tamer", traitlessTamer, true, false, 0],
    ["a green level 3 Digimon for its printed 3", greenRookie, false, true, 3],
    ["a red level 3 Digimon", "BT1-009", false, false, 0],
  ])("digivolves from %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: stegomon, as: "stegomon" }], deck: filler },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 5;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("stegomon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("base").topCard.cardId === stegomon && !s.state.pendingDecision);
    expect(s.state.memory).toBe(5 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? stegomon : base);
  });

  it("triggers When Digivolving after digivolving from a Kurata's Army Tamer", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT1-009", as: "fodder", suspended: true },
            { card: kurataTamer, as: "base" },
          ],
          hand: [{ card: stegomon, as: "stegomon" }],
          deck: filler,
        },
        1: { battleArea: [{ card: "BT1-009", as: "locked" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferLockTargets(s, preferred);
    s.state.memory = 5;
    await s.ready();
    const fodder = s.perm("fodder").topCard.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("stegomon").instanceId,
        useAlternateCost: true,
      }).ok,
    ).toBe(true);
    await settle(() => !s.state.pendingDecision && trashIds(s, 0).includes(fodder));
    expect(s.state.memory).toBe(3);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(true);
  });

  it("suspends any Digimon, deletes the chosen own Digimon, and locks 1 opposing Digimon through their turn", async () => {
    const preferred: string[] = [];
    const s = lockBoard({ autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    preferLockTargets(s, preferred);
    s.state.memory = 10;
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.perm("fodder").isSuspended = true;
    const fodder = s.perm("fodder").topCard.instanceId;
    await playStegomon(s);
    expect(trashIds(s, 0)).toContain(fodder);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("bystander"), "unsuspend")).toBe(false);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(s.perm("bystander").isSuspended).toBe(false);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("can lock an opposing Tamer", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: stegomon, as: "stegomon" }], battleArea: [{ card: "BT1-009", as: "fodder" }] },
        1: { battleArea: [{ card: traitlessTamer, as: "tamer", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("fodder").permanentId, s.perm("fodder").topCard.instanceId);
    s.state.memory = 5;
    await s.ready();
    await playStegomon(s);
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "unsuspend")).toBe(true);
  });

  it("keeps the suspension but skips deletion and the lock when no Digimon is chosen", async () => {
    const preferred: string[] = [];
    const s = lockBoard({
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
      declinePrompts: ["SelectBind"],
    });
    preferLockTargets(s, preferred);
    s.state.memory = 5;
    await s.ready();
    await playStegomon(s);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("fodder").permanentId,
    );
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(false);
  });

  it("declines every optional step without changing the board", async () => {
    const s = lockBoard({ autoDeclineOptional: true });
    s.state.memory = 5;
    await s.ready();
    await playStegomon(s);
    expect(s.perm("locked").isSuspended).toBe(false);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(false);
  });

  it("survives choosing itself through Armor Purge and still applies the lock", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: greenRookie, as: "base" }],
          hand: [{ card: stegomon, as: "stegomon" }],
          deck: filler,
        },
        1: { battleArea: [{ card: "BT1-009", as: "locked" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("locked").permanentId, s.perm("locked").topCard.instanceId);
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("stegomon").instanceId,
      }).ok,
    ).toBe(true);
    await settle(() => !s.state.pendingDecision && trashIds(s, 0).includes(s.inst("stegomon").instanceId));
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual([greenRookie]);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(true);
  });

  it("shares one use per turn between When Digivolving and When Attacking", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: stegomon, as: "stegomon" }],
          battleArea: [
            { card: "BT1-009", as: "fodder", suspended: true },
            { card: greenRookie, as: "base" },
            { card: "BT1-013", as: "second" },
          ],
          deck: filler,
          security: securityFiller,
        },
        1: { battleArea: [{ card: "BT1-009", as: "locked" }], security: securityFiller },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    preferLockTargets(s, preferred);
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("stegomon").instanceId,
      }).ok,
    ).toBe(true);
    const fodder = s.perm("fodder").topCard.instanceId;
    await settle(() => !s.state.pendingDecision && trashIds(s, 0).includes(fodder));

    const prompts = s.decisions.length;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length === 2);
    expect(s.decisions.slice(prompts).filter(({ req }) => req.sourceCardId === stegomon)).toHaveLength(0);
    expect(s.state.players[0]!.battleArea.map(({ permanentId }) => permanentId)).toContain(
      s.perm("second").permanentId,
    );
  });

  it("keeps the once-per-turn use when When Digivolving is declined, so When Attacking still resolves", async () => {
    const preferred: string[] = [];
    const declined: string[] = ["Stegomon", "SelectBind"];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: stegomon, as: "stegomon" }],
          battleArea: [
            { card: "BT1-009", as: "fodder", suspended: true },
            { card: greenRookie, as: "base" },
          ],
          deck: filler,
          security: securityFiller,
        },
        1: { battleArea: [{ card: "BT1-009", as: "locked" }], security: securityFiller },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred, declinePrompts: declined },
    );
    preferLockTargets(s, preferred);
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("stegomon").instanceId,
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("base").topCard.cardId === stegomon && !s.state.pendingDecision);
    expect(s.perm("locked").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(false);

    declined.length = 0;
    const fodder = s.perm("fodder").topCard.instanceId;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length === 2);
    expect(trashIds(s, 0)).toContain(fodder);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(true);
  });
});
