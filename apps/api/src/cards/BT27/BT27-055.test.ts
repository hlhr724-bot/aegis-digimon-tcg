import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-055";
import "#api/cards/index";

type Session = ReturnType<typeof setupEngine>;

const lotosmon = "BT27-055";
const bioQuetzalmon = "BT27-038";
const traitlessQuetzalmon = "BT10-074";
const kurataTamer = "BT27-098";
const traitlessTamer = "BT1-085";
const greenUltimate = "BT3-053";
const filler = Array(20).fill("BT1-013");
const securityFiller = Array(3).fill("BT1-009");

function prefer(s: Session, preferred: string[], aliases: string[]) {
  for (const alias of aliases) preferred.push(s.perm(alias).permanentId, s.perm(alias).topCard.instanceId);
}

async function digivolveLotosmon(s: Session) {
  expect(
    s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("lotosmon").instanceId,
    }).ok,
  ).toBe(true);
  await settle(() => s.perm("base").topCard.cardId === lotosmon && !s.state.pendingDecision);
}

async function attackPlayer(s: Session, alias: string) {
  const securityBefore = s.state.players[1]!.security.length;
  expect(
    s.engine.applyIntent(0, {
      type: "attack",
      attackerPermanentId: s.perm(alias).permanentId,
      target: { kind: "player" },
    }),
  ).toEqual({ ok: true });
  await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length < securityBefore);
}

describe("Lotosmon suspends and locks opposing cards and unsuspends itself once per turn", () => {
  it("prints green and purple Mega stats and compiles every clause", () => {
    expect(requireCardDefinition(lotosmon)).toMatchObject({
      nameEn: "Lotosmon",
      nameJp: "ロトスモン",
      colors: ["Green", "Purple"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Green", level: 5, memoryCost: 4 },
        { color: "Purple", level: 5, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Data"],
      types: ["Fairy", "Kurata's Army", "Bio"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Quetzalmon"], traits: ["Bio"], cost: 5, isAlternate: true },
      { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
    ]);
    const bodies = compiled.effects.filter(({ sharedUseKey }) => sharedUseKey === "BT27-055/suspend-lock");
    expect(bodies.map(({ trigger }) => trigger)).toEqual(["WhenDigivolving", "WhenAttacking"]);
  });

  it("has Piercing, Vortex, and Armor Purge and can't digivolve", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: lotosmon, as: "lotosmon" }] } });
    await s.ready();
    const view = observe(s.engine);
    expect(view.hasKeyword(s.perm("lotosmon"), "Piercing")).toBe(true);
    expect(view.hasKeyword(s.perm("lotosmon"), "Vortex")).toBe(true);
    expect(view.hasKeyword(s.perm("lotosmon"), "Armor Purge")).toBe(true);
    expect(view.isRestricted(s.perm("lotosmon"), "digivolve")).toBe(true);
  });

  it.each([
    ["a [Bio] Quetzalmon for 5", bioQuetzalmon, true, true, 5],
    ["a Quetzalmon without [Bio]", traitlessQuetzalmon, true, false, 0],
    ["a Kurata's Army Tamer for 7", kurataTamer, true, true, 7],
    ["a traitless Tamer", traitlessTamer, true, false, 0],
    ["a green level 5 Digimon for its printed 4", greenUltimate, false, true, 4],
    ["a red level 5 Digimon", "BT1-020", false, false, 0],
  ])("digivolves from %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: lotosmon, as: "lotosmon" }], deck: filler },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 8;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("lotosmon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("base").topCard.cardId === lotosmon && !s.state.pendingDecision);
    expect(s.state.memory).toBe(8 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? lotosmon : base);
  });

  it("suspends up to 2 opposing Digimon or Tamers and locks 1 of them through their turn", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: lotosmon, as: "lotosmon" }, "BT1-013"],
          battleArea: [{ card: greenUltimate, as: "base" }],
          deck: filler,
          security: securityFiller,
        },
        1: {
          battleArea: [
            { card: "BT1-013", as: "locked" },
            { card: traitlessTamer, as: "tamer" },
            { card: "BT1-009", as: "untouched" },
          ],
          deck: filler,
          security: securityFiller,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred, declinePrompts: ["Attack"] },
    );
    prefer(s, preferred, ["locked", "tamer"]);
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    await digivolveLotosmon(s);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(s.perm("tamer").isSuspended).toBe(true);
    expect(s.perm("untouched").isSuspended).toBe(false);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(true);
    expect(observe(s.engine).isRestricted(s.perm("tamer"), "unsuspend")).toBe(false);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("locked").isSuspended).toBe(true);
    expect(s.perm("tamer").isSuspended).toBe(false);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).isRestricted(s.perm("locked"), "unsuspend")).toBe(false);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("can lock an opposing Digimon it did not suspend", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: { hand: [{ card: lotosmon, as: "lotosmon" }], battleArea: [{ card: greenUltimate, as: "base" }] },
        1: { battleArea: [{ card: "BT1-013", as: "alreadySuspended", suspended: true }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    prefer(s, preferred, ["alreadySuspended"]);
    s.state.memory = 4;
    await s.ready();
    await digivolveLotosmon(s);
    expect(observe(s.engine).isRestricted(s.perm("alreadySuspended"), "unsuspend")).toBe(true);
  });

  it("unsuspends itself after attacking only once per turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: lotosmon, as: "lotosmon" }], deck: filler, security: securityFiller },
        1: { security: Array(4).fill("BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await attackPlayer(s, "lotosmon");
    expect(s.perm("lotosmon").isSuspended).toBe(false);

    await attackPlayer(s, "lotosmon");
    expect(s.perm("lotosmon").isSuspended).toBe(true);
  });

  it("stays suspended when the unsuspend is declined", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: lotosmon, as: "lotosmon" }], deck: filler, security: securityFiller },
        1: { security: securityFiller },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Unsuspend"] },
    );
    await s.ready();
    await attackPlayer(s, "lotosmon");
    expect(s.perm("lotosmon").isSuspended).toBe(true);
  });

  it("shares one use per turn between When Digivolving and When Attacking", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          hand: [{ card: lotosmon, as: "lotosmon" }],
          battleArea: [{ card: greenUltimate, as: "base" }],
          deck: filler,
          security: securityFiller,
        },
        1: {
          battleArea: [
            { card: "BT1-013", as: "first" },
            { card: "BT1-013", as: "second" },
            { card: "BT1-013", as: "third" },
          ],
          security: securityFiller,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred },
    );
    prefer(s, preferred, ["first", "second"]);
    s.state.memory = 4;
    await s.ready();
    await digivolveLotosmon(s);
    expect(s.perm("first").isSuspended).toBe(true);
    expect(s.perm("second").isSuspended).toBe(true);

    await attackPlayer(s, "base");
    expect(s.perm("third").isSuspended).toBe(false);
  });
});
