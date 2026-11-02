import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { setupEngine, settle, type EngineSetup } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { advance } from "../../engine/testkit/advance.js";
import { compiled as BT25_016 } from "./BT25-016.js";
import "../index.js";

describe("BT25-016 GrapLeomon", () => {
  it("matches the catalog and alternate TS evolution requirement", () => {
    expect(getCardDefinition("BT25-016")).toMatchObject({
      cardId: "BT25-016",
      nameEn: "GrapLeomon",
      colors: ["Red", "Green"],
      kinds: ["Digimon"],
      level: 5,
      playCost: 7,
      dp: 7000,
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Beastkin", "Iliad", "TS"],
      rarity: "R",
      dualEffect: "GrapLeomon",
    });
    expect(digivolutionRequirementsFor("BT25-016")).toContainEqual({
      level: 4,
      traits: ["TS"],
      cost: 3,
      isAlternate: true,
    });
  });

  it("boosts one own Digimon and then offers an attack on play and digivolving", () => {
    for (const trigger of ["OnPlay", "WhenDigivolving"] as const) {
      const effect = BT25_016.effects?.find((entry) => entry.trigger === trigger);
      expect(effect?.actions?.[0]).toMatchObject({
        kind: "ModifyDP",
        amount: 3000,
        duration: "forTheTurn",
        target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
      });
      expect(effect?.actions?.[1]).toMatchObject({
        kind: "Attack",
        optional: true,
        withoutSuspending: false,
        target: { filter: { controller: "mine", kind: ["Digimon"] }, count: 1 },
      });
    }
  });

  it("responds to any 13000+ DP Digimon attacking and digivolves from hand for free", () => {
    const effect = BT25_016.effects?.find((entry) => entry.trigger === "AllTurns");
    const watcher = effect?.actions?.[0];
    expect(watcher).toMatchObject({
      event: "whenAttacking",
      sourceFilter: { controllerDefault: "any", kind: ["Digimon"], dp: { op: "gte", value: 13000 } },
    });
    const subTrigger = watcher as { actions?: unknown[] } | undefined;
    expect(subTrigger?.actions?.[0]).toMatchObject({
      kind: "Digivolve",
      from: ["hand"],
      payCost: false,
      optional: true,
      into: { nameOrTrait: [{ tokens: ["Marsmon", "Callismon"], match: "nameExact" }] },
    });
  });

  it("preserves inherited Security Attack +1", () => {
    expect(BT25_016.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isInherited: true,
          keywords: [{ keyword: "SecurityAttack", amount: 1, raw: "＜Security Attack +1＞" }],
        }),
      ]),
    );
  });

  it("applies inherited Security Attack +1 from a realistic evolution stack", async () => {
    const s = setupEngine({ 0: { battleArea: [{ card: "BT1-026", as: "host", under: ["BT25-016"] }] } });
    await s.ready();
    expect(observe(s.engine).keywordAmount(s.perm("host"), "SecurityAttack")).toBe(1);
  });

  it("boosts one own Digimon, then independently attacks another on play", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-011", as: "boost" },
            { card: "BT1-010", as: "attacker" },
          ],
          hand: [{ card: "BT25-016", as: "source" }],
        },
        1: { security: ["BT1-001"] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;
    await s.ready();

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const boostDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: boostDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("boost").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const attackDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("attacker").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const forcedAttackTarget = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: forcedAttackTarget.decisionId,
        response: { kind: "selectCards", instanceIds: ["player"] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("boost").currentDP).toBe(8000);
    expect(s.perm("attacker").isSuspended).toBe(true);
    expect(s.perm("attacker").currentDP).toBe(2000);
    await advance(s.engine).runTurn(0);
    expect(s.perm("boost").currentDP).toBe(getCardDefinition("BT24-011")!.dp);
  });

  it("applies the same two entry clauses after a legal alternate TS digivolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT24-011", as: "base" },
            { card: "BT1-010", as: "boost" },
            { card: "BT1-010", as: "attacker" },
          ],
          hand: [{ card: "BT25-016", as: "source" }],
        },
        1: { security: ["BT1-001"] },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("source").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const boostDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: boostDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("boost").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const attackDecision = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: attackDecision.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("attacker").permanentId] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const forcedAttackTarget = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: forcedAttackTarget.decisionId,
        response: { kind: "selectCards", instanceIds: ["player"] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.perm("base").topCard?.cardId).toBe("BT25-016");
    expect(s.perm("boost").currentDP).toBe(5000);
    expect(s.perm("attacker").isSuspended).toBe(true);
  });

  it("free-digivolves into Marsmon when an opponent's 13000 DP Digimon attacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-016", as: "source" }],
          hand: [{ card: "BT25-020", as: "marsmon" }],
          security: ["BT1-001"],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 13000 }] },
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
    await settle(() => s.perm("source").topCard?.cardId === "BT25-020");
    expect(s.perm("source").topCard?.cardId).toBe("BT25-020");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).not.toContain("BT25-020");
  });

  it("free-digivolves into Callismon as the second printed destination", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-016", as: "source" }],
          hand: [{ card: "BT25-058", as: "callismon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 13000 }] },
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
    await settle(() => s.state.players[0]!.battleArea.some((perm) => perm.topCard?.cardId === "BT25-058"));
    const evolved = s.state.players[0]!.battleArea.find((perm) => perm.topCard?.cardId === "BT25-058");
    expect(evolved?.topCard?.cardId).toBe("BT25-058");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).not.toContain("BT25-058");
  });

  it("preserves the hand destination when the optional attack-time evolution is declined", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-016", as: "source" }],
          hand: [{ card: "BT25-020", as: "marsmon" }],
        },
        1: { battleArea: [{ card: "BT1-010", as: "attacker", dp: 13000 }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
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
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("source").topCard?.cardId).toBe("BT25-016");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT25-020");
  });

  it("keeps the inherited Security Attack +1 after a legal public TS evolution stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-013", as: "base" }],
          hand: [
            { card: "BT25-016", as: "grap" },
            { card: "BT25-020", as: "lv6" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("grap").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT25-016");
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("lv6").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard?.cardId === "BT25-020");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["BT25-013", "BT25-016"]);
    expect(observe(s.engine).keywordAmount(s.perm("base").permanentId, "SecurityAttack")).toBe(1);
  });

  it("does not use a 12000 DP attack that only becomes 13000 after When Attacking", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-016", as: "source" }],
          hand: [{ card: "BT25-020", as: "marsmon" }],
          security: ["BT1-001"],
        },
        1: {
          battleArea: [{ card: "BT15-075", as: "attacker", dp: 12000 }],
          hand: [{ card: "BT1-010", as: "whenAttackingCost" }],
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
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    await settle(() => !observe(s.engine).isAttacking());
    expect(s.perm("source").topCard?.cardId).toBe("BT25-016");
  });

  it("triggers at exactly 13000 after suspension grants an inherited +1000 DP", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT25-016", as: "source" }],
          hand: [{ card: "BT25-020", as: "marsmon" }],
          security: ["BT1-001"],
        },
        1: {
          battleArea: [{ card: "BT1-076", as: "attacker", dp: 12000, under: ["BT16-042"] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    expect(s.perm("attacker").currentDP).toBe(12000);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    await settle(() => s.perm("source").topCard?.cardId === "BT25-020");
    expect(s.perm("source").topCard?.cardId).toBe("BT25-020");
  });
});

describe("BT25-016 GrapLeomon — KB Q&A rulings", () => {
  async function attackPlayer(
    attackerSeat: 0 | 1,
    attacker: { card: string; dp: number; under?: string[] },
    attackerHand: string[] = [],
    onEvent?: (engine: EngineSetup) => void,
  ) {
    const defenderSeat = attackerSeat === 0 ? 1 : 0;
    const attackerSpec = { ...attacker, as: "attacker" };
    const s = setupEngine(
      {
        [attackerSeat]: {
          battleArea: attackerSeat === 0 ? [{ card: "BT25-016", as: "grapLeomon" }, attackerSpec] : [attackerSpec],
          hand: attackerSeat === 0 ? [{ card: "BT25-020", as: "marsmon" }, ...attackerHand] : attackerHand,
        },
        [defenderSeat]: {
          battleArea: attackerSeat === 1 ? [{ card: "BT25-016", as: "grapLeomon" }] : [],
          hand: attackerSeat === 1 ? [{ card: "BT25-020", as: "marsmon" }] : [],
          security: ["BT1-001"],
        },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        onEvent: () => onEvent?.(s),
      },
    );
    s.state.turnSeat = attackerSeat;
    await s.ready();
    expect(
      s.engine.applyIntent(attackerSeat, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "attackDeclared"));
    return s;
  }

  it("triggers when a 12000 DP attacker reaches 13000 DP from its own while-suspended bonus (Q6262)", async () => {
    let attackerDpWhenGrapLeomonDigivolved: number | undefined;
    const s = await attackPlayer(1, { card: "BT1-076", dp: 12000, under: ["BT16-042"] }, [], (engine) => {
      if (attackerDpWhenGrapLeomonDigivolved !== undefined) return;
      if (engine.perm("grapLeomon").topCard.cardId !== "BT25-020") return;
      attackerDpWhenGrapLeomonDigivolved = engine.perm("attacker").currentDP;
    });

    await settle(() => s.perm("grapLeomon").topCard.cardId === "BT25-020");
    expect(attackerDpWhenGrapLeomonDigivolved).toBe(13000);
    expect(s.perm("grapLeomon").stack.map((card) => card.cardId)).toEqual(["BT25-016"]);
  });

  it("does not trigger when a [When Attacking] effect raises a 12000 DP attacker to 13000 or more (Q6263)", async () => {
    const s = await attackPlayer(1, { card: "BT15-075", dp: 12000 }, ["BT1-010"]);
    await settle(() => !observe(s.engine).isAttacking());

    expect(s.perm("attacker").currentDP).toBe(14000);
    expect(s.perm("grapLeomon").topCard.cardId).toBe("BT25-016");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("marsmon").instanceId);
  });

  it.each([
    { side: "your", attackerSeat: 0 as const },
    { side: "your opponent's", attackerSeat: 1 as const },
  ])("triggers when $side 13000 DP Digimon attacks (Q6264)", async ({ attackerSeat }) => {
    const s = await attackPlayer(attackerSeat, { card: "BT1-024", dp: 13000 });

    await settle(() => s.perm("grapLeomon").topCard.cardId === "BT25-020");
    expect(s.perm("grapLeomon").stack.map((card) => card.cardId)).toEqual(["BT25-016"]);
  });
});
