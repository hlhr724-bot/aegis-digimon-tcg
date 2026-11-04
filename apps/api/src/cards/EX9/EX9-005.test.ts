import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./EX9-005.js";

async function activateBreedingMain(s: ReturnType<typeof setupEngine>) {
  await s.ready();
  const source = s.perm("negamon");
  const ability = observe(s.engine).activatableEffects(source)[0]!;
  expect(ability).toBeDefined();
  expect(
    s.engine.applyIntent(0, {
      type: "activateEffect",
      sourceInstanceId: source.topCard.instanceId,
      effectKey: ability.effectKey,
    }),
  ).toEqual({ ok: true });
}

describe("EX9-005", () => {
  it("matches the catalog and maps both printed breeding clauses to IR", () => {
    const card = getCardDefinition("EX9-005");
    expect(card).toBeDefined();
    if (card === undefined) return;
    expect(card).toMatchObject({
      cardId: "EX9-005",
      nameEn: "Negamon",
      colors: ["Black"],
      kinds: ["DigiEgg"],
      level: 2,
      forms: ["In-Training"],
      attributes: ["-"],
      types: ["Unknown"],
    });
    expect(card.effectText?.replaceAll("\u00a0", " ")).toContain(
      "[Breeding] [Main] [Once Per Turn] You may play 1 Digimon card with [Negamon] in its text from your hand with the play cost reduced by 2.",
    );
    expect(card.effectText?.replaceAll("\u00a0", " ")).toContain(
      "[Breeding] [All Turns] This Digimon can't digivolve and effects can't delete or trash it.",
    );
    expect(card.inheritedEffectText?.replaceAll("\u00a0", " ")).toBe(
      "[Opponent's Turn] [Once Per Turn] When one of your opponent's Digimon attacks, you may change the attack target to 1 of your Digimon with [Negamon] in its text.",
    );
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it("once per breeding turn may play a Negamon-text Digimon from hand with cost reductions and place it underneath itself", () => {
    const actions = compiled.effects?.find((entry) => entry.isBreeding && entry.trigger === "Main")?.actions ?? [];
    expect(actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      from: ["hand"],
      payCost: true,
      reduceCostBy: 2,
      reduceCostByScaling: {
        per: 1,
        unit: "cards",
        filter: {
          zone: ["trash", "digivolutionCards"],
          kind: ["Digimon", "DigiEgg"],
          nameOrTrait: [{ tokens: ["Negamon"], match: "nameExact" }],
        },
      },
    });
    expect(actions[1]).toMatchObject({ kind: "PlaceUnder" });
  });
  it("restricts itself from digivolving, being deleted, and being trashed, and redirects opponent attacks", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "AllTurns")?.actions).toHaveLength(3);
    expect(compiled.effects?.find((entry) => entry.trigger === "OpponentsTurn")?.actions[0]).toMatchObject({
      kind: "SubTrigger",
      event: "whenOpponentAttacks",
    });
  });

  it("keeps the breeding card from digivolving or leaving by effects", async () => {
    const s = setupEngine({ 0: { breeding: { card: "EX9-005", as: "negamon" } } });
    await s.ready();
    const breeding = s.state.players[0]!.breeding!;
    expect(observe(s.engine).isRestricted(breeding, "digivolve")).toBe(true);
    expect(observe(s.engine).isRestricted(breeding, "beDeleted")).toBe(true);
    expect(observe(s.engine).isRestricted(breeding, "beTrashed")).toBe(true);
  });

  it("does not expose the breeding Main effect after Negamon is placed under the played Digimon", async () => {
    const s = setupEngine(
      { 0: { breeding: { card: "EX9-005", as: "negamon" }, hand: [{ card: "EX9-046", as: "played" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;
    await s.ready();
    const ability = observe(s.engine).activatableEffects(s.perm("negamon"))[0]!;
    expect(ability).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("negamon").topCard.instanceId,
        effectKey: ability.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea[0]?.stack.some((card) => card.cardId === "EX9-005"));
    const played = s.perm("played");
    expect(played.topCard.cardId).toBe("EX9-046");
    expect(played.stack.map(({ cardId }) => cardId)).toContain("EX9-005");
    expect(observe(s.engine).activatableEffects(played)).toHaveLength(0);
  });

  it("redirects one opponent attack to an inherited Negamon-text Digimon per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-047", as: "host", under: ["EX9-005"], dp: 10000 },
            { card: "BT1-012", as: "nonMatching" },
          ],
          security: ["BT1-012", "BT1-012"],
        },
        1: {
          battleArea: [
            { card: "BT1-016", as: "attacker", dp: 1000 },
            { card: "BT1-016", as: "second", dp: 1000 },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.perm("nonMatching").topCard.cardId).toBe("BT1-012");

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("second").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 1);
  });

  it("plays a Negamon-text Digimon from hand and places Negamon underneath it", async () => {
    const s = setupEngine(
      { 0: { breeding: { card: "EX9-005", as: "negamon" }, hand: [{ card: "EX9-046", as: "played" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;
    await s.ready();
    const ability = observe(s.engine).activatableEffects(s.perm("negamon"))[0]!;
    expect(ability).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("negamon").topCard.instanceId,
        effectKey: ability.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea[0]?.stack.some((card) => card.cardId === "EX9-005"), 100);
    expect(s.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("EX9-046");
    expect(s.state.players[0]!.battleArea[0]!.stack.map((card) => card.cardId)).toContain("EX9-005");
  });

  it("may decline the breeding Main play without moving or paying anything", async () => {
    const s = setupEngine(
      { 0: { breeding: { card: "EX9-005", as: "negamon" }, hand: ["EX9-046"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 1;
    await activateBreedingMain(s);
    await settle();
    expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("EX9-005");
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["EX9-046"]);
    expect(s.state.memory).toBe(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("counts named Negamon Digi-Eggs in trash and Digimon stacks for the extra reduction", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          battleArea: [{ card: "BT1-009", under: ["EX9-005"] }],
          hand: [{ card: "EX9-047", as: "played" }],
          trash: ["EX9-005"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047"));

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047")).toBe(true);
    expect(s.state.memory).toBe(-3);
  });

  it("counts a named Negamon Digi-Egg in trash for the extra reduction", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          hand: [{ card: "EX9-047", as: "played" }],
          trash: ["EX9-005"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047"));
    expect(s.state.memory).toBe(-4);
  });

  it("counts a named Negamon Digi-Egg in a Digimon stack for the extra reduction", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          battleArea: [{ card: "BT1-009", under: ["EX9-005"] }],
          hand: [{ card: "EX9-047", as: "played" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047"));
    expect(s.state.memory).toBe(-4);
  });

  it("does not count a card that only mentions Negamon in its text", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          hand: [{ card: "EX9-047", as: "played" }],
          trash: ["EX9-047"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047"));
    expect(s.state.memory).toBe(-5);
  });

  it("does not play a hand Digimon without Negamon in its text", async () => {
    const s = setupEngine({
      0: { breeding: { card: "EX9-005", as: "negamon" }, hand: ["BT1-009"] },
    });
    s.state.memory = 5;
    await s.ready();
    const ability = observe(s.engine).activatableEffects(s.perm("negamon"))[0]!;
    expect(ability).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: s.perm("negamon").topCard.instanceId,
        effectKey: ability.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("EX9-005");
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT1-009"]);
    expect(s.state.memory).toBe(5);
  });
});

describe("EX9-005 Negamon — KB Q&A rulings", () => {
  it("reduces the play cost by 2 more for one Negamon in trash and one in a Digimon's stack (Q4744)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          battleArea: [{ card: "BT1-009", under: ["EX9-005"] }],
          hand: [{ card: "EX9-047", as: "played" }],
          trash: ["EX9-005"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX9-047"));

    expect(s.perm("played").topCard.cardId).toBe("EX9-047");
    expect(s.state.memory).toBe(-(7 - 2 - 2));
  });

  it("keeps the bred Negamon from digivolving or being deleted or trashed by effects in either turn (Q4745)", async () => {
    for (const turnSeat of [0, 1] as const) {
      const s = setupEngine({
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          hand: [{ card: "EX9-046", as: "rookie" }],
        },
      });
      s.state.turnSeat = turnSeat;
      await s.ready();
      const negamon = s.perm("negamon");
      for (const restriction of ["digivolve", "beDeleted", "beTrashed"] as const) {
        expect(observe(s.engine).isRestricted(negamon, restriction)).toBe(true);
      }

      advance(s.engine).verb.enterEffectResolution(1);
      const removed = await advance(s.engine).verb.deletePermanent([negamon.permanentId]);
      advance(s.engine).verb.leaveEffectResolution();
      expect(removed).toBe(0);
      expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("EX9-005");
    }

    const s = setupEngine({
      0: {
        breeding: { card: "EX9-005", as: "negamon" },
        hand: [{ card: "EX9-046", as: "rookie" }],
      },
    });
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("negamon").permanentId,
        instanceId: s.inst("rookie").instanceId,
      }).ok,
    ).toBe(false);
    expect(s.state.players[0]!.breeding?.topCard.cardId).toBe("EX9-005");

    const control = setupEngine({
      0: {
        breeding: { card: "BT10-005", as: "egg" },
        hand: [{ card: "EX9-046", as: "rookie" }],
      },
    });
    control.state.memory = 3;
    await control.ready();
    expect(
      control.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: control.perm("egg").permanentId,
        instanceId: control.inst("rookie").instanceId,
      }),
    ).toEqual({ ok: true });
  });

  it("plays a Digimon whose effect text names Negamon, but never one without it (Q4746)", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "EX9-005", as: "negamon" },
          hand: [
            { card: "EX9-046", as: "textOnly" },
            { card: "BT1-009", as: "unrelated" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 5;
    await activateBreedingMain(s);
    await settle(() => s.state.players[0]!.battleArea.length > 0);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX9-046"]);
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("unrelated").instanceId]);
    expect(s.decisions.flatMap(({ req }) => req.options?.candidateInstanceIds ?? [])).not.toContain(
      s.inst("unrelated").instanceId,
    );
  });

  it("neither activates nor restricts once Negamon leaves the breeding area (Q4747)", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX9-046", as: "host", under: ["EX9-005"] }],
        hand: ["EX9-047"],
      },
    });
    s.state.memory = 5;
    await s.ready();
    const host = s.perm("host");

    expect(observe(s.engine).activatableEffects(host)).toHaveLength(0);
    for (const restriction of ["digivolve", "beDeleted", "beTrashed"] as const) {
      expect(observe(s.engine).isRestricted(host, restriction)).toBe(false);
    }
    expect(await advance(s.engine).verb.deletePermanent([host.permanentId])).toBe(1);
  });
});
