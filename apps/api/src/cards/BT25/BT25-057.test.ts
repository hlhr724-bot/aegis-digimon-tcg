import { digivolutionRequirementsFor, getCardDefinition } from "@aegis/shared";
import { irNode } from "../../engine/testkit/irNode.js";
import { advance } from "../../engine/testkit/advance.js";
import { describe, expect, it } from "vitest";
import { setupEngine, settle, type EngineSetup, type PermanentSpec } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT25-057.js";
import "./BT25-041.js";

const CARD_ID = "BT25-057";

describe("BT25-057 Monarchlizamon / Final Judgment", () => {
  it.each(["hand", "BT25-041"] as const)("offers Arts Digivolve onto a Lv.4 after Option use via %s", async (route) => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-049", as: "base" },
            { card: "BT25-041", as: "murasame" },
            { card: "ST23-13", as: "tamer", under: [{ card: "BT25-046", faceUp: false }] },
          ],
          hand: [{ card: CARD_ID, as: "dual" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-001", "BT1-001", "BT1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferOptionIndex: 1, preferInstanceIds: preferred },
    );
    const dualId = s.inst("dual").instanceId;
    preferred.push(dualId, s.inst("base").instanceId);
    await s.ready();
    s.state.memory = 10;
    const intent =
      route === "hand"
        ? { type: "playCard", instanceId: s.inst("dual").instanceId, useAs: "option" }
        : { type: "attack", attackerPermanentId: s.perm("murasame").permanentId, target: { kind: "player" } };
    expect(s.engine.applyIntent(0, intent as never)).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.instanceId === dualId);
    expect(s.decisions.some(({ req }) => req.promptText?.includes("Arts Digivolve"))).toBe(true);
    const declaredAttack = s.events.find(
      (event) => event.kind === "attackDeclared" && event.attackerPermanentId === s.perm("base").permanentId,
    );
    expect(declaredAttack !== undefined).toBe(route === "hand");
    const artsMovement = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(dualId) && event.to === "battleArea",
    );
    const completedAttack = s.events.findIndex(
      (event) => event.kind === "securityRevealed" && event.attackerPermanentId === s.perm("base").permanentId,
    );
    expect(artsMovement).toBeGreaterThanOrEqual(0);
    expect(completedAttack === -1 || artsMovement < completedAttack).toBe(true);
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "WhenAttacking",
      ),
    ).toBe(false);
    expect(s.perm("base").stack).toContainEqual(expect.objectContaining({ cardId: "BT25-049" }));
    expect(s.state.players[0]!.trash).not.toContainEqual(expect.objectContaining({ instanceId: dualId }));
  });

  it("offers Arts before security and does not ask again when declined during the forced attack", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-049", as: "base" }], hand: [{ card: CARD_ID, as: "dual" }] },
        1: { security: ["BT1-001", "BT1-001", "BT1-001"] },
      },
      { autoAcceptOptional: true },
    );
    const dualId = s.inst("dual").instanceId;
    await s.ready();
    s.state.memory = 4;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: dualId, useAs: "option" } as never)).toEqual({
      ok: true,
    });
    let declined = false;
    let artsBeforeSecurity = false;
    for (let step = 0; step < 6 && !declined; step += 1) {
      await settle(
        () => s.state.pendingDecision?.kind === "selectCards" || s.state.pendingDecision?.kind === "chooseTargets",
      );
      const pending = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
      declined = request.promptText?.includes("Arts Digivolve") === true;
      if (declined) {
        artsBeforeSecurity =
          s.events.some((event) => event.kind === "attackDeclared") &&
          !s.events.some((event) => event.kind === "securityRevealed");
      }
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: pending.decisionId,
          response: {
            kind: request.kind,
            instanceIds: declined ? [] : request.options!.candidateInstanceIds!.slice(0, 1),
          },
        } as never),
      ).toEqual({ ok: true });
    }
    expect(declined).toBe(true);
    expect(artsBeforeSecurity).toBe(true);
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === dualId));
    expect(s.decisions.filter(({ req }) => req.promptText?.includes("Arts Digivolve"))).toHaveLength(1);
    expect(s.perm("base").topCard.cardId).toBe("BT25-049");
  });

  it("matches catalog, erratum, alternate evolution, and the shared physical OPT", () => {
    expect(getCardDefinition(CARD_ID)).toMatchObject({
      colors: ["Green", "Black"],
      kinds: ["Digimon", "Option"],
      level: 5,
      playCost: 4,
      dp: 8000,
      types: ["Cyborg", "Glowing Dawn", "BEATBREAK"],
      optionColorRequirements: ["Green"],
    });
    expect(digivolutionRequirementsFor(CARD_ID)).toContainEqual({
      level: 4,
      traits: ["Glowing Dawn"],
      cost: 3,
      isAlternate: true,
    });
    const shared = compiled.effects.filter(
      (effect) =>
        ["WhenDigivolving", "WhenAttacking"].includes(effect.trigger) && effect.sharedUseKey === "ir-shared-0",
    );
    expect(shared).toHaveLength(2);
    expect(shared.every((effect) => effect.frequency === "OncePerTurn")).toBe(true);
  });

  it("evolves for 3 from an off-color Glowing Dawn Lv.4 and rejects a plain Lv.4", async () => {
    const legal = setupEngine({
      0: { breeding: { card: "BT25-035", as: "base" }, hand: [{ card: CARD_ID, as: "monarch" }], deck: ["BT1-009"] },
    });
    legal.state.memory = 3;
    expect(
      legal.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: legal.perm("base").permanentId,
        instanceId: legal.inst("monarch").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => legal.perm("base").topCard.cardId === CARD_ID);
    expect(legal.state.memory).toBe(0);

    const invalid = setupEngine({
      0: { breeding: { card: "BT1-010", as: "plain" }, hand: [{ card: CARD_ID, as: "monarch" }] },
    });
    invalid.state.memory = 3;
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("plain").permanentId,
        instanceId: invalid.inst("monarch").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("supports both ordinary color routes at cost 4 and rejects the wrong color", async () => {
    for (const [source, as] of [
      ["BT1-069", "greenBase"],
      ["BT10-061", "blackBase"],
    ] as const) {
      const s = setupEngine({ 0: { battleArea: [{ card: source, as }], hand: [{ card: CARD_ID, as: "monarch" }] } });
      s.state.memory = 5;
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm(as).permanentId,
          instanceId: s.inst("monarch").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm(as).topCard?.cardId === CARD_ID);
      expect(s.state.memory).toBe(1);
    }
    const wrong = setupEngine({
      0: { battleArea: [{ card: "BT1-015", as: "redBase" }], hand: [{ card: CARD_ID, as: "monarch" }] },
    });
    wrong.state.memory = 5;
    expect(
      wrong.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: wrong.perm("redBase").permanentId,
        instanceId: wrong.inst("monarch").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("pays the true bottom face-down Tamer source, De-Digivolves, then performs a rules battle", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-088", as: "tamer", under: [{ card: "BT1-009", faceUp: false, as: "cost" }] },
            { card: "BT25-035", as: "base" },
          ],
          hand: [{ card: CARD_ID, as: "monarch" }],
          deck: ["BT1-013"],
        },
        1: { battleArea: [{ card: "BT25-041", as: "opponent", under: ["BT25-035"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
    );
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("monarch").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
    const orderDecision = s.state.pendingDecision!;
    const orderRequest = s.decisions.find(({ req }) => req.decisionId === orderDecision.decisionId)!.req;
    const keys = orderRequest.options?.triggerKeys ?? [];
    expect(keys).toHaveLength(2);
    expect(orderRequest.options?.triggerTimings).toEqual(["WhenDigivolving", "WhenDigivolving"]);
    expect(orderRequest.options?.triggerDescriptions).toEqual([
      "[When Digivolving] [When Attacking] [Once Per Turn] By trashing the bottom face-down card under any of your Tamers, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.",
      "[When Digivolving] This Digimon may battle 1 of your opponent's Digimon.",
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: orderDecision.decisionId,
        response: { kind: "orderTriggers", order: [keys[0]!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length === 0, 1200);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);
    expect(s.state.players[1]!.battleArea).toHaveLength(0);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT25-041", "BT25-035"]),
    );
    expect(s.decisions.some(({ req }) => req.kind === "orderTriggers")).toBe(true);
  });

  it("uses Final Judgment only with Glowing Dawn and applies all errata grants to one target", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-049", as: "requirement" },
            { card: "BT1-010", as: "target" },
          ],
          hand: [{ card: CARD_ID, as: "option" }],
        },
        1: { security: ["BT1-001"] },
      },
      { autoSelectCards: true, autoAcceptOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("target").permanentId);
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 7000);
    expect(s.state.memory).toBe(0);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Rush")).toBe(true);
    expect(observe(s.engine).keywordAmount(s.perm("target"), "SecurityAttack")).toBe(1);

    const denied = setupEngine({
      0: { battleArea: [{ card: "BT1-010", as: "plain" }], hand: [{ card: CARD_ID, as: "option" }] },
    });
    denied.state.memory = 4;
    expect(
      denied.engine.applyIntent(0, {
        type: "playCard",
        instanceId: denied.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual(expect.objectContaining({ ok: false, reason: "color-requirement-unmet" }));
  });

  it("fires When Attacking once, pays its bottom face-down Tamer cost, then shares the budget", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: CARD_ID, as: "monarch" },
            { card: "BT25-088", as: "tamer", under: [{ card: "BT1-009", faceUp: false, as: "cost" }] },
          ],
        },
        1: {
          battleArea: [
            { card: "BT24-017", as: "first", under: ["BT1-020"], suspended: true },
            { card: "BT24-017", as: "second", under: ["BT1-020"], suspended: true },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("monarch").permanentId,
        target: { kind: "permanent", permanentId: s.perm("first").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.battleArea.length < 2, 1200);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("cost").instanceId)).toBe(true);

    await advance(s.engine).verb.unsuspend([s.perm("monarch").permanentId]);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("monarch").permanentId,
        target: { kind: "permanent", permanentId: s.perm("second").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => false, 120);
    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === s.perm("second").permanentId),
    ).toBe(true);
  });

  it("expires Final Judgment's grants at the end of the turn and refuses without an eligible target", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-049", as: "requirement" },
            { card: "BT1-010", as: "target" },
          ],
          hand: [{ card: CARD_ID, as: "option" }],
        },
        1: { deck: ["BT1-001"], security: ["BT1-001"] },
      },
      { autoSelectCards: true, autoDeclineOptional: true, preferInstanceIds: preferred },
    );
    preferred.push(s.perm("target").permanentId);
    s.state.memory = 4;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" } as never),
    ).toEqual({ ok: true });
    await settle(() => s.perm("target").currentDP === 7000);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Rush")).toBe(true);
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    expect(s.perm("target").currentDP).toBe(2000);
    expect(observe(s.engine).hasKeyword(s.perm("target"), "Rush")).toBe(false);

    const denied = setupEngine(
      { 0: { battleArea: [{ card: "BT1-010", as: "plain" }], hand: [{ card: CARD_ID, as: "option" }] } },
      { autoAcceptOptional: true },
    );
    denied.state.memory = 4;
    expect(
      denied.engine.applyIntent(0, {
        type: "playCard",
        instanceId: denied.inst("option").instanceId,
        useAs: "option",
      } as never),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("keeps Final Judgment's buffs and optional attack on the same target for the turn", () => {
    const main = compiled.effects.find((effect) => effect.trigger === "Main")!;
    expect(main.actions).toHaveLength(4);
    expect(main.actions.slice(1).every((action) => irNode(action).target?.sameTarget === true)).toBe(true);
    expect(main.actions.slice(0, 3).every((action) => irNode(action).duration === "forTheTurn")).toBe(true);
    expect(main.actions[3]).toMatchObject({ kind: "Attack", optional: true });
  });
});

describe("BT25-057 Monarchlizamon — KB Q&A rulings", () => {
  const deDigivolveText =
    "[When Digivolving] [When Attacking] [Once Per Turn] By trashing the bottom face-down card under any of your Tamers, ＜De-Digivolve 1＞ 1 of your opponent's Digimon.";
  const battleText = "[When Digivolving] This Digimon may battle 1 of your opponent's Digimon.";

  /** Digivolve a Glowing Dawn Lv.4 into Monarchlizamon through its alternate cost of 3. */
  function digivolveIntoMonarchlizamon(s: EngineSetup) {
    s.state.memory = 3;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("monarch").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
  }

  it.each([0, 1])(
    "lets the player choose the order of its simultaneous [When Digivolving] effects (first offered=%i) (Q6341)",
    async (firstIndex) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [
              { card: "BT25-088", as: "tamer", under: [{ card: "BT1-009", faceUp: false }] },
              { card: "BT25-035", as: "base" },
            ],
            hand: [{ card: CARD_ID, as: "monarch" }],
          },
          1: { battleArea: [{ card: "BT25-041", as: "opponent", under: ["BT25-035"] }] },
        },
        { autoAcceptOptional: true, autoSelectCards: true, autoOrderTriggers: false },
      );
      await s.ready();
      digivolveIntoMonarchlizamon(s);
      await settle(() => s.state.pendingDecision?.kind === "orderTriggers");
      const decision = s.state.pendingDecision!;
      const request = s.decisions.find(({ req }) => req.decisionId === decision.decisionId)!.req;
      const keys = request.options!.triggerKeys!;
      const chosenFirst = request.options!.triggerDescriptions![firstIndex]!;

      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "orderTriggers", order: [keys[firstIndex]!] },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined, 1200);

      const triggered = s.events.flatMap((event) =>
        event.kind === "effectTriggered" && event.sourceCardId === CARD_ID ? [event.description] : [],
      );
      expect([...request.options!.triggerDescriptions!].sort()).toEqual([battleText, deDigivolveText].sort());
      expect(triggered[0]).toBe(chosenFirst);
    },
  );

  async function battleOnDigivolve(opponent: PermanentSpec) {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "BT25-035", as: "base" }], hand: [{ card: CARD_ID, as: "monarch" }] },
        1: { battleArea: [{ ...opponent, as: "opponent" }], security: ["BT1-001"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    digivolveIntoMonarchlizamon(s);
    await settle(() => s.state.players[1]!.battleArea.length === 0 && s.state.pendingDecision === undefined, 1200);
    return s;
  }

  it("battles directly under the standard rules, without an attack (Q6342)", async () => {
    const s = await battleOnDigivolve({ card: "BT1-009" });

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.perm("base").topCard.cardId).toBe(CARD_ID);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(1);
  });

  it("battles a Digimon unaffected by effects, which is deleted by the rules when it loses (Q6343)", async () => {
    const s = await battleOnDigivolve({ card: "BT15-047", suspended: true });

    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toContain("BT15-047");
    expect(s.perm("base").topCard.cardId).toBe(CARD_ID);
  });

  it("does not activate [When Attacking] after Arts Digivolving the attacker of Final Judgment (Q6344)", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT25-049", as: "base" },
            {
              card: "ST23-13",
              as: "tamer",
              under: [
                { card: "BT25-046", faceUp: false },
                { card: "BT25-046", faceUp: false },
              ],
            },
          ],
          hand: [{ card: CARD_ID, as: "dual" }],
          deck: ["BT1-009", "BT1-009", "BT1-009"],
        },
        1: { security: ["BT1-001", "BT1-001", "BT1-001"] },
      },
      {
        autoAcceptOptional: true,
        autoSelectCards: true,
        preferInstanceIds: preferred,
        // Declining the [When Digivolving] De-Digivolve keeps the shared [Once Per Turn] unused.
        declinePrompts: ["De-Digivolve"],
      },
    );
    const dualId = s.inst("dual").instanceId;
    preferred.push(dualId, s.inst("base").instanceId);
    await s.ready();
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: dualId, useAs: "option" } as never)).toEqual({
      ok: true,
    });
    await settle(() => s.perm("base").topCard.instanceId === dualId && !observe(s.engine).isAttacking(), 1200);

    const attack = s.events.findIndex(
      (event) => event.kind === "attackDeclared" && event.attackerPermanentId === s.perm("base").permanentId,
    );
    const artsDigivolve = s.events.findIndex(
      (event) => event.kind === "cardsMoved" && event.instanceIds.includes(dualId) && event.to === "battleArea",
    );
    expect(attack).toBeGreaterThanOrEqual(0);
    expect(artsDigivolve).toBeGreaterThan(attack);
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectTriggered" && event.sourceCardId === CARD_ID && event.timing === "WhenAttacking",
      ),
    ).toBe(false);
    // A face-down card is still there to pay for [When Attacking], so only its timing keeps it from activating.
    expect(s.perm("tamer").stack.some((card) => !card.faceUp)).toBe(true);
  });
});

describe("Final Judgment optional attack", () => {
  it("allows declining the attack after choosing to keep the granted bonuses", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT25-035", as: "target" }], hand: [{ card: CARD_ID, as: "option" }] },
      1: { security: ["BT1-001", "BT1-001"] },
    });
    await s.ready();
    s.state.memory = 10;
    const originalDp = s.perm("target").currentDP;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const decision = s.decisions.at(-1)!.req;
    expect(decision.options?.selectionContext).toBe("attackTarget");
    expect(decision.options?.min).toBe(0);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: decision.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards" || s.state.pendingDecision === undefined);
    const artsResult = s.state.pendingDecision
      ? s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        })
      : { ok: true };
    expect(artsResult).toEqual({ ok: true });
    await settle(() => !s.state.pendingDecision);
    expect(s.perm("target").currentDP).toBe(originalDp + 5000);
    expect(s.perm("target").isSuspended).toBe(false);
    expect(s.events.some((event) => event.kind === "attackDeclared")).toBe(false);
    expect(s.state.players[1]!.security).toHaveLength(2);
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId)).toBe(true);
    expect(s.state.memory).toBe(6);
  });
});
