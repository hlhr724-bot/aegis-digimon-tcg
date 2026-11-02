import { describe, expect, it } from "vitest";
import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { advance } from "#api/engine/testkit/advance";
import { assertNoLoudGap, setupEngine, settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import { compiled } from "#api/cards/BT27/BT27-071";
import "#api/cards/index";

const darkdramon = "BT27-071";
const thunderbirdmon = "BT27-026";
const quetzalmon = "BT27-038";
const kurataTamer = "BT27-098";
const traitlessTamer = "BT1-085";
const blackUltimate = "BT2-060";
const greenUltimate = "BT3-053";
const filler = Array(20).fill("BT1-013");
const securityFiller = Array(3).fill("BT1-009");

describe("Darkdramon gains immunity, de-digivolves on attack or Counter, and can't digivolve", () => {
  it("prints black and purple Mega stats and compiles every clause", () => {
    expect(requireCardDefinition(darkdramon)).toMatchObject({
      nameEn: "Darkdramon",
      nameJp: "ダークドラモン",
      colors: ["Black", "Purple"],
      level: 6,
      playCost: 11,
      dp: 11000,
      evoCosts: [
        { color: "Black", level: 5, memoryCost: 4 },
        { color: "Purple", level: 5, memoryCost: 4 },
      ],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Cyborg", "Kurata's Army", "Bio"],
      rarity: "R",
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.digivolutionRequirement).toEqual([
      { namesExact: ["Thunderbirdmon"], traits: ["Bio"], cost: 5, isAlternate: true },
      { baseIsTamer: true, traits: ["Kurata's Army"], cost: 7, isAlternate: true },
    ]);
    const bodies = compiled.effects.filter(({ sharedUseKey }) => sharedUseKey === "BT27-071/de-digivolve");
    expect(bodies.map(({ trigger }) => trigger)).toEqual(["WhenAttacking", "Counter"]);
    expect(bodies.every(({ frequency, isFromHand }) => frequency === "OncePerTurn" && isFromHand === undefined)).toBe(
      true,
    );
  });

  it("has Reboot, Blocker, and Armor Purge and can't digivolve", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: darkdramon, as: "darkdramon" }] } });
    await s.ready();
    const view = observe(s.engine);
    expect(view.hasKeyword(s.perm("darkdramon"), "Reboot")).toBe(true);
    expect(view.hasKeyword(s.perm("darkdramon"), "Blocker")).toBe(true);
    expect(view.hasKeyword(s.perm("darkdramon"), "Armor Purge")).toBe(true);
    expect(view.isRestricted(s.perm("darkdramon"), "digivolve")).toBe(true);
  });

  it.each([
    ["a [Bio] Thunderbirdmon for 5", thunderbirdmon, true, true, 5],
    ["a [Bio] Armor Form with another name", quetzalmon, true, false, 0],
    ["a Kurata's Army Tamer for 7", kurataTamer, true, true, 7],
    ["a traitless Tamer", traitlessTamer, true, false, 0],
    ["a black level 5 Digimon for its printed 4", blackUltimate, false, true, 4],
    ["a green level 5 Digimon", greenUltimate, false, false, 0],
  ])("digivolves from %s", async (_label, base, useAlternateCost, allowed, cost) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: base, as: "base" }], hand: [{ card: darkdramon, as: "darkdramon" }], deck: filler },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 8;
    await s.ready();
    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("darkdramon").instanceId,
      useAlternateCost,
    });
    expect(result.ok).toBe(allowed);
    if (allowed) await settle(() => s.perm("base").topCard.cardId === darkdramon && !s.state.pendingDecision);
    expect(s.state.memory).toBe(8 - cost);
    expect(s.perm("base").topCard.cardId).toBe(allowed ? darkdramon : base);
  });

  it("is unaffected by opposing Digimon effects from digivolving until the end of their turn", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: darkdramon, as: "darkdramon" }, "BT1-013"],
          battleArea: [{ card: blackUltimate, as: "base" }],
          deck: filler,
          security: securityFiller,
        },
        1: { deck: filler, security: securityFiller },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["Attack"] },
    );
    await s.ready();
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;
    expect(s.perm("base").immuneToOpponentDigimonEffects).toBeFalsy();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("darkdramon").instanceId,
      }).ok,
    ).toBe(true);
    await settle(() => s.perm("base").topCard.cardId === darkdramon && !s.state.pendingDecision);
    expect(s.perm("base").immuneToOpponentDigimonEffects).toBe(true);
    assertNoLoudGap(s);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(s.perm("base").immuneToOpponentDigimonEffects).toBe(true);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(s.perm("base").immuneToOpponentDigimonEffects).toBeFalsy();
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("de-digivolves 1 opposing Digimon by 2 when attacking", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: darkdramon, as: "darkdramon" }], deck: filler, security: securityFiller },
        1: {
          battleArea: [{ card: "BT1-024", as: "target", under: ["BT1-009", "BT1-020"] }],
          security: securityFiller,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, declinePrompts: ["block"] },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("darkdramon").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision && s.state.players[1]!.security.length === 2);
    expect(s.perm("target").topCard.cardId).toBe("BT1-009");
    expect(s.perm("target").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId)).toEqual(
      expect.arrayContaining(["BT1-020", "BT1-024"]),
    );
  });

  it("de-digivolves the attacker from the Counter window on the opponent's turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: darkdramon, as: "darkdramon" }],
          deck: filler,
          security: securityFiller,
        },
        1: {
          battleArea: [{ card: "BT1-024", as: "attacker", under: ["BT1-009", "BT1-020"] }],
          deck: filler,
          security: securityFiller,
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
    );
    await s.ready();
    s.state.turnSeat = 1;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "counterWindowOpened"));
    const opened = s.events.find((event) => event.kind === "counterWindowOpened");
    if (opened?.kind !== "counterWindowOpened") throw new Error("counter window did not open");
    const eligible = opened.eligibleCounters.find(
      (entry) => entry.instanceId === s.perm("darkdramon").topCard.instanceId,
    );
    expect(eligible).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "respondCounter",
        sourceInstanceId: eligible!.instanceId,
        effectKey: eligible!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("attacker").topCard.cardId === "BT1-009");
    expect(s.perm("attacker").stack).toHaveLength(0);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT1-020", "BT1-024"]);
  });
});
