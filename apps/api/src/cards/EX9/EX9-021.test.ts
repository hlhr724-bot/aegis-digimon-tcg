import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle, type SetupEngineOptions } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import compiled from "./EX9-021.js";
import "../index.js";

describe("EX9-021", () => {
  it("encodes the complete behavior as compiled IR", () => {
    expect(compiled.residual).toEqual([]);
    expect(compiled.effects[0]).toMatchObject({
      trigger: "WhenDigivolving",
      actions: [
        {
          kind: "Restrict",
          restriction: "beAffected",
          byOpponentEffectsOnly: true,
          condition: { kind: "isDnaDigivolving" },
        },
        { kind: "Delete", target: { filter: { superlative: "highestLevel" }, count: "all" } },
      ],
    });
    expect(compiled.effects[1]).toMatchObject({
      trigger: "EndOfAttack",
      optional: true,
      actions: [
        {
          kind: "PlayWithoutCost",
          fromOwnDigivolutionStack: true,
          bindResultAs: "playedSources",
          additionalSimultaneousTargets: [{ count: 1 }],
        },
        { kind: "SecurityManipulation", op: "addTop" },
      ],
    });
  });

  it("DNA digivolving deletes every opposing highest-level Digimon and grants Digimon-effect immunity", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX9-013", as: "redMaterial" },
          { card: "EX9-020", as: "blueMaterial" },
        ],
        hand: [{ card: "EX9-021", as: "alterS" }],
      },
      1: {
        battleArea: [
          { card: "EX9-013", as: "highestA" },
          { card: "BT1-009", as: "lower" },
        ],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redMaterial").permanentId, s.perm("blueMaterial").permanentId],
        instanceId: s.inst("alterS").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea[0]!.topCard.cardId).toBe("BT1-009");
    const alterS = s.state.players[0]!.battleArea[0]!;
    expect(alterS.topCard.cardId).toBe("EX9-021");
    expect(observe(s.engine).hasRestriction(alterS, "beAffected", "Digimon")).toBe(true);
    expect(observe(s.engine).isRestrictedByEffect(alterS, "beAffected", "Option")).toBe(true);
    expect(observe(s.engine).isRestrictedByEffect(alterS, "beAffected", "Tamer")).toBe(true);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(expect.arrayContaining(["EX9-013"]));
  });

  it("ignores an opponent's Option security effect after DNA digivolving", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-013", as: "redMaterial" },
            { card: "EX9-020", as: "blueMaterial" },
          ],
          hand: [{ card: "EX9-021", as: "alterS" }],
        },
        1: { security: [{ card: "ST1-16", as: "gaiaForce", faceUp: true }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redMaterial").permanentId, s.perm("blueMaterial").permanentId],
        instanceId: s.inst("alterS").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 1 && s.state.pendingDecision === undefined);

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("gaiaForce"));
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["EX9-021"]);
  });

  it("is deleted by an opponent's Option security effect without DNA immunity", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX9-021", as: "alterS" }] },
        1: { security: [{ card: "ST1-16", as: "gaiaForce", faceUp: true }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("gaiaForce"));
    await settle(() => s.state.players[0]!.battleArea.length === 0);

    expect(s.state.players[0]!.trash.map((card) => card.cardId)).toContain("EX9-021");
  });

  it("normal digivolution with a stack of at least 2 does not grant DNA immunity", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "EX9-013", as: "alterS", under: ["BT1-009", "BT1-009"] }],
        hand: [{ card: "EX9-021", as: "evolver" }],
      },
      1: {
        battleArea: [
          { card: "EX9-013", as: "highest" },
          { card: "BT1-009", as: "lower" },
        ],
      },
    });
    s.state.memory = 10;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("alterS").permanentId,
        instanceId: s.inst("evolver").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("alterS").topCard?.cardId === "EX9-021" && s.state.players[1]!.battleArea.length === 1);
    expect(s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["BT1-009"]);
    expect(observe(s.engine).hasRestriction(s.perm("alterS"), "beAffected", "Digimon")).toBe(false);
  });

  it("Q4768-Q4769 lets an opponent choose the DNA-immune Digimon but ignores suspend and DP effects", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-013", as: "redMaterial" },
            { card: "EX9-020", as: "blueMaterial" },
          ],
          hand: [{ card: "EX9-021", as: "alterS" }],
        },
        1: {
          battleArea: [
            { card: "BT14-033", as: "base" },
            { card: "BT1-015", as: "deletedHighest" },
          ],
          hand: [
            { card: "BT14-036", as: "dpEffect" },
            { card: "BT1-070", as: "suspender" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redMaterial").permanentId, s.perm("blueMaterial").permanentId],
        instanceId: s.inst("alterS").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);
    const alterS = s.perm("alterS");
    expect(observe(s.engine).hasRestriction(alterS, "beAffected", "Digimon")).toBe(true);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(1, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("dpEffect").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "BT14-036");
    expect(alterS.isSuspended).toBe(false);
    expect(alterS.currentDP).toBe(15000);

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("suspender").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(alterS.isSuspended).toBe(false);
  });

  it.each([
    ["Greymon + Garurumon", ["AD1-001", "AD1-010"]],
    ["Greymon + Ver.2", ["AD1-001", "BT22-049"]],
    ["Ver.1 + Garurumon", ["EX9-016", "AD1-010"]],
    ["Ver.1 + Ver.2", ["EX9-016", "BT22-049"]],
  ] as const)("Q4765 plays the %s End of Attack combination, then becomes top security", async (_label, under) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX9-021", as: "alterS", under: [...under] }] },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    const alterS = s.perm("alterS");
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: alterS.permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security[0]?.cardId === "EX9-021");

    expect(s.state.players[0]!.security[0]!.cardId).toBe("EX9-021");
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(
      expect.arrayContaining([...under]),
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it.each([
    ["red watcher", ["EX9-012", "AD1-010"], "EX9-013", "EX9-013"],
    ["blue watcher", ["EX9-012", "AD1-010"], "EX9-019", "EX9-019"],
  ])("#5168 lets the %s react to the other simultaneously played source", async (_label, under, hand, evolved) => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX9-021", as: "alterS", under }], hand: [hand] },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alterS").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security[0]?.cardId === "EX9-021" && !s.state.pendingDecision);
    await settle();
    expect(s.state.players[0]!.battleArea.some(({ topCard }) => topCard.cardId === evolved)).toBe(true);
    expect(s.state.memory).toBe(0);
  });

  it.each([
    ["blue group alone", ["AD1-010"], ["AD1-010"]],
    ["one card from each group", ["AD1-001", "AD1-001", "AD1-010", "AD1-010", "BT1-009"], ["AD1-001", "AD1-010"]],
    ["no matching group", ["BT1-009"], ["EX9-021"]],
  ])("#5168 preserves separately counted selections: %s", async (_label, under, expected) => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX9-021", as: "alterS", under }] }, 1: { security: ["BT1-009", "BT1-009"] } },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alterS").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle();
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(expected.sort());
    expect(s.state.players[0]!.security.some(({ cardId }) => cardId === "EX9-021")).toBe(
      under.some((card) => card !== "BT1-009"),
    );
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("Q4767 may play only the available Greymon card from its stack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX9-021", as: "alterS", under: ["AD1-001"] }] },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alterS").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security[0]?.cardId === "EX9-021");

    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.cardId)).toEqual(["AD1-001"]);
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("can use End of Attack again after declining its first optional activation this turn", async () => {
    const options = {
      autoAcceptOptional: false,
      autoDeclineOptional: true,
      autoSelectCards: true,
      autoOrderTriggers: true,
    };
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-021", as: "alterS", under: ["AD1-001", "AD1-010"] }],
          hand: [{ card: "BT1-095", as: "braveShield" }],
        },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      options,
    );
    s.state.memory = 10;
    s.state.turnSeat = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alterS").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.security.length === 1 &&
        s.state.pendingDecision === undefined &&
        !observe(s.engine).isAttacking(),
    );

    expect(s.perm("alterS").stack.map(({ cardId }) => cardId)).toEqual(["AD1-001", "AD1-010"]);
    expect(s.state.players[0]!.security.some(({ cardId }) => cardId === "EX9-021")).toBe(false);

    options.autoAcceptOptional = true;
    options.autoDeclineOptional = false;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("braveShield").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.perm("alterS").isSuspended);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("alterS").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security[0]?.cardId === "EX9-021");

    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(["AD1-001", "AD1-010"]);
    expect(s.state.players[0]!.security[0]!.cardId).toBe("EX9-021");
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("digivolves from a non-Blue/Red Lv.6 [DM] trait Digimon for cost 5 and rejects a non-[DM] Lv.6", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT22-066", as: "base" }], hand: [{ card: "EX9-021", as: "source" }] },
    });
    s.state.memory = 5;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX9-021");
    expect(s.state.memory).toBe(0);

    const invalid = setupEngine({
      0: { battleArea: [{ card: "P-240", as: "base" }], hand: [{ card: "EX9-021", as: "source" }] },
    });
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("base").permanentId,
        instanceId: invalid.inst("source").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});

describe("EX9-021 Omnimon Alter-S — KB Q&A rulings", () => {
  const frosGrant = "[When Attacking] Trash the bottom digivolution card of this Digimon.";

  function stackIds(s: ReturnType<typeof setupEngine>, alias: string) {
    return s.perm(alias).stack.map(({ instanceId }) => instanceId);
  }

  function dnaBoard(options: SetupEngineOptions = {}) {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-013", as: "redMaterial", under: ["BT1-009"] },
            { card: "EX9-020", as: "blueMaterial" },
            { card: "BT1-014", as: "control", under: [{ card: "BT1-001", as: "controlBottom" }] },
          ],
          hand: [{ card: "EX9-021", as: "alterS" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: {
          battleArea: [
            { card: "BT8-031", as: "fros" },
            { card: "EX9-021", as: "highest" },
          ],
          security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true, ...options },
    );
    s.state.memory = 10;
    return s;
  }

  async function dnaDigivolve(s: ReturnType<typeof dnaBoard>) {
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redMaterial").permanentId, s.perm("blueMaterial").permanentId],
        instanceId: s.inst("alterS").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    expect(s.state.players[1]!.battleArea[0]!.topCard.cardId).toBe("BT8-031");
  }

  async function attackPlayer(s: ReturnType<typeof setupEngine>, alias: string) {
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm(alias).permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.state.pendingDecision === undefined);
  }

  it("still deletes the highest-level Digimon after 'then' without DNA digivolving (Q4764)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX9-013", as: "host", under: ["BT1-009"] }],
          hand: [{ card: "EX9-021", as: "evolver" }],
        },
        1: {
          battleArea: [
            { card: "EX9-020", as: "highestA" },
            { card: "BT8-031", as: "highestB" },
            { card: "BT1-009", as: "lower" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolver").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(observe(s.engine).hasRestriction(s.perm("host"), "beAffected", "Digimon")).toBe(false);
    expect(s.state.players[1]!.battleArea.map(({ topCard }) => topCard.cardId)).toEqual(["BT1-009"]);
    expect(s.state.players[1]!.trash.map(({ cardId }) => cardId).sort()).toEqual(["BT8-031", "EX9-020"]);
  });

  it("must play both the Greymon and the Garurumon card when both are available (Q4766)", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX9-021", as: "alterS", under: ["AD1-001", "AD1-010"] }] },
        1: { security: ["BT1-009", "BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: true },
    );
    await s.ready();
    await attackPlayer(s, "alterS");

    const partialPlayOffers = s.decisions.filter(
      ({ req }) =>
        (req.kind === "selectCards" || req.kind === "chooseTargets") &&
        req.sourceCardId === "EX9-021" &&
        req.options?.min === 0,
    );
    expect(partialPlayOffers).toEqual([]);
    expect(s.state.players[0]!.battleArea.map(({ topCard }) => topCard.cardId).sort()).toEqual(["AD1-001", "AD1-010"]);
    expect(s.state.players[0]!.security[0]!.cardId).toBe("EX9-021");
  });

  it("can be chosen for an opponent's <Security A. -1> grant but is not considered to have it (Q4770)", async () => {
    const preferInstanceIds: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX9-013", as: "redMaterial" },
            { card: "EX9-020", as: "blueMaterial" },
            { card: "BT1-009", as: "bystander" },
          ],
          hand: [{ card: "EX9-021", as: "alterS" }],
        },
        1: {
          battleArea: [
            { card: "BT14-033", as: "yellow" },
            { card: "EX9-021", as: "highest" },
          ],
          hand: [{ card: "BT10-099", as: "therapy" }],
          security: ["BT1-009", "BT1-009", "BT1-009"],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds },
    );
    s.state.memory = 10;
    expect(
      s.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [s.perm("redMaterial").permanentId, s.perm("blueMaterial").permanentId],
        instanceId: s.inst("alterS").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 1 && s.state.pendingDecision === undefined);
    const alterS = s.perm("alterS");
    preferInstanceIds.push(alterS.permanentId);

    s.state.turnSeat = 1;
    s.state.memory = 10;
    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("therapy").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some(({ cardId }) => cardId === "BT10-099"));
    const therapyTargets = s.decisions.filter(({ req }) => req.sourceCardId === "BT10-099" && req.kind !== "optional");
    expect(therapyTargets.flatMap(({ req }) => req.options?.candidateInstanceIds ?? [])).toContain(alterS.permanentId);

    s.state.turnSeat = 0;
    s.state.memory = 10;
    expect(observe(s.engine).keywordAmount(s.perm("bystander"), "SecurityAttack")).toBe(0);
    expect(observe(s.engine).keywordAmount(alterS, "SecurityAttack")).toBe(1);
    await attackPlayer(s, "alterS");
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("stops being affected by an opponent's granted effect as soon as it gains immunity (Q4771)", async () => {
    let grantsWhenImmunityTriggered: number | undefined;
    const s = dnaBoard({
      onEvent(event) {
        if (grantsWhenImmunityTriggered !== undefined) return;
        if (event.kind !== "effectTriggered" || event.sourceCardId !== "EX9-021") return;
        grantsWhenImmunityTriggered = observe(s.engine)
          .customEffectGrants(s.perm("alterS"))
          .filter((grant) => grant.token === frosGrant).length;
      },
    });
    await s.ready();
    await dnaDigivolve(s);
    expect(grantsWhenImmunityTriggered).toBe(1);

    const stackBefore = stackIds(s, "alterS");
    await attackPlayer(s, "alterS");
    expect(stackIds(s, "alterS")).toEqual(stackBefore);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });

  it("is affected by the granted effect again once its immunity ends (Q4772)", async () => {
    const s = dnaBoard();
    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await dnaDigivolve(s);
    const stackWhileImmune = stackIds(s, "alterS");
    await attackPlayer(s, "alterS");
    expect(stackIds(s, "alterS")).toEqual(stackWhileImmune);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = -s.state.memory;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = -s.state.memory;

    const thirdTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(observe(s.engine).hasRestriction(s.perm("alterS"), "beAffected", "Digimon")).toBe(false);
    const [bottom, ...rest] = stackIds(s, "alterS");
    await attackPlayer(s, "alterS");
    expect(stackIds(s, "alterS")).toEqual(rest);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toContain(bottom);
    advance(s.engine).endMainPhaseIfOpen(0);
    await thirdTurn;
  });

  it("does not trigger a granted [When Attacking] effect while immune, unlike an unprotected Digimon (Q4773)", async () => {
    const s = dnaBoard();
    await s.ready();
    await dnaDigivolve(s);

    await attackPlayer(s, "control");
    expect(s.perm("control").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("controlBottom").instanceId]);

    const stackBefore = stackIds(s, "alterS");
    await attackPlayer(s, "alterS");
    expect(stackIds(s, "alterS")).toEqual(stackBefore);
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("controlBottom").instanceId]);
  });
});
