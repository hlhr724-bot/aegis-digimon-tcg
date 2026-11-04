import { describe, expect, it } from "vitest";
import { getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT10-053.js";
import "../index.js";

describe("BT10-053 Ajatarmon", () => {
  it("matches its catalog and exact Main plus inherited IR", () => {
    const d = getCardDefinition("BT10-053")!;
    expect([d.colors, d.level, d.playCost, d.dp]).toEqual([["Green"], 5, 8, 7000]);
    expect(d.evoCosts).toEqual([{ color: "Green", level: 4, memoryCost: 3 }]);
    expect([d.forms, d.attributes, d.types]).toEqual([["Ultimate"], ["Vaccine"], ["Vegetation"]]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    expect(compiled.effects).toEqual([
      expect.objectContaining({
        trigger: "Main",
        frequency: "OncePerTurn",
        actions: [expect.objectContaining({ kind: "PlayWithoutCost", payCost: false, optional: true })],
      }),
      expect.objectContaining({ trigger: "YourTurn", isInherited: true, frequency: "OncePerTurn" }),
    ]);
  });

  it("can suspend itself, exposes only legal hand cards, and plays only once per turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-053", as: "ajatarmon" },
            { card: "BT10-044", as: "otherCost" },
          ],
          hand: [
            { card: "BT10-046", as: "chosenPalmon" },
            { card: "BT10-043", as: "otherVegetation" },
            { card: "BT1-064", as: "wrongTrait" },
            { card: "BT1-078", as: "tooLarge" },
          ],
        },
      },
      { autoSelectCards: false },
    );
    await s.ready();
    const source = s.perm("ajatarmon");
    const [mainEffect] = observe(s.engine).activatableEffects(source) as Array<{ effectKey: string }>;
    expect(mainEffect).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: mainEffect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.decisions.at(-1)!.req;
    expect(optional.sourceCardId).toBe("BT10-053");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const cost = s.decisions.at(-1)!.req;
    expect(cost.sourceCardId).toBe("BT10-053");
    expect(cost.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.perm("ajatarmon").permanentId, s.perm("otherCost").permanentId]),
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: cost.decisionId,
        response: { kind: "chooseTargets", instanceIds: [s.perm("ajatarmon").permanentId] },
      }),
    ).toEqual({ ok: true });

    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const play = s.decisions.at(-1)!.req;
    expect(play.sourceCardId).toBe("BT10-053");
    expect(play.options?.candidateInstanceIds).toEqual(
      expect.arrayContaining([s.inst("chosenPalmon").instanceId, s.inst("otherVegetation").instanceId]),
    );
    expect(play.options?.candidateInstanceIds).not.toContain(s.inst("wrongTrait").instanceId);
    expect(play.options?.candidateInstanceIds).not.toContain(s.inst("tooLarge").instanceId);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: play.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("chosenPalmon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("chosenPalmon").instanceId,
      ),
    );
    await settle(() => s.events.some((event) => event.kind === "effectActivated" && event.sourceCardId === "BT10-053"));

    expect(s.perm("ajatarmon").isSuspended).toBe(true);
    expect(s.perm("otherCost").isSuspended).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("wrongTrait").instanceId)).toBe(true);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("tooLarge").instanceId)).toBe(true);
    expect(observe(s.engine).activatableEffects(source)).toEqual([]);
    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: mainEffect!.effectKey,
      }).ok,
    ).toBe(false);
    assertNoLoudGap(s);
  });

  it("declining the optional play suspends nothing and moves no hand card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [{ card: "BT10-053", as: "ajatarmon" }],
        hand: [{ card: "BT10-046", as: "palmon" }],
      },
    });
    await s.ready();
    const source = s.perm("ajatarmon");
    const [mainEffect] = observe(s.engine).activatableEffects(source) as Array<{ effectKey: string }>;

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: mainEffect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const optional = s.decisions.at(-1)!.req;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: optional.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("ajatarmon").isSuspended).toBe(false);
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("palmon").instanceId)).toBe(true);
    assertNoLoudGap(s);
  });

  it("does not gain memory for an attack, then gains once for allied effect suspensions", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-054", as: "host", under: ["BT10-053"] },
          { card: "BT10-046", as: "firstAlly" },
          { card: "BT10-043", as: "secondAlly" },
        ],
      },
      1: { security: ["BT1-001", "BT1-002"] },
    });
    s.state.memory = 0;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !(s.engine as unknown as { combat: { isAttacking: boolean } }).combat.isAttacking &&
        s.state.players[1]!.security.length === 1,
    );
    const memoryAfterAttack = s.state.memory;
    expect(memoryAfterAttack).toBeLessThanOrEqual(0);

    await advance(s.engine).verb.suspend([s.perm("firstAlly").permanentId]);
    expect(s.state.memory).toBe(memoryAfterAttack + 1);
    await advance(s.engine).verb.suspend([s.perm("secondAlly").permanentId]);
    expect(s.state.memory).toBe(memoryAfterAttack + 1);
    assertNoLoudGap(s);
  });

  it("does not gain inherited memory from an allied effect suspension off-turn", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "BT10-054", as: "host", under: ["BT10-053"] },
          { card: "BT10-046", as: "ally" },
        ],
      },
    });
    s.state.turnSeat = 1;
    s.state.memory = 0;
    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    expect(s.state.memory).toBe(0);
  });
});

describe("BT10-053 Ajatarmon — KB Q&A rulings", () => {
  it("can suspend itself as the only green Digimon to pay its [Main] effect cost (Q1977)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-053", as: "ajatarmon" },
            { card: "BT1-009", as: "redDigimon" },
          ],
          hand: [{ card: "BT10-046", as: "palmon" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: false },
    );
    await s.ready();
    const source = s.perm("ajatarmon");
    const [mainEffect] = observe(s.engine).activatableEffects(source) as Array<{ effectKey: string }>;
    expect(mainEffect).toBeDefined();

    expect(
      s.engine.applyIntent(0, {
        type: "activateEffect",
        sourceInstanceId: source.topCard.instanceId,
        effectKey: mainEffect!.effectKey,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const handPick = s.state.pendingDecision!;
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: handPick.decisionId,
        response: { kind: "selectCards", instanceIds: [s.inst("palmon").instanceId] },
      }),
    ).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("palmon").instanceId),
    );

    const offeredCostTargets = s.decisions
      .filter(({ req }) => req.kind === "chooseTargets")
      .flatMap(({ req }) => req.options?.candidateInstanceIds ?? []);
    expect(offeredCostTargets).not.toContain(s.perm("redDigimon").permanentId);
    expect(s.perm("ajatarmon").isSuspended).toBe(true);
    expect(s.perm("redDigimon").isSuspended).toBe(false);
    assertNoLoudGap(s);
  });

  it("does not gain memory when a <Blitz> attack suspends the attacker (Q1978)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT10-010", as: "host", under: ["BT10-053"] },
            { card: "BT10-043", as: "ally" },
          ],
          hand: [{ card: "BT10-014", as: "evolving" }],
        },
        1: { security: ["BT10-062", "BT10-062"] },
      },
      { autoSelectCards: false },
    );
    s.state.memory = 2;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("host").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    const blitz = s.state.pendingDecision!;
    expect(JSON.parse(blitz.payloadJson)).toMatchObject({ promptKey: "activateBlitz" });
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: blitz.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.hasAcceptedBlitzAttack(s.perm("host").permanentId));

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("host").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.perm("host").isSuspended).toBe(true);
    expect(s.perm("host").stack.some(({ cardId }) => cardId === "BT10-053")).toBe(true);
    expect(s.state.memory).toBe(-1);

    await advance(s.engine).verb.suspend([s.perm("ally").permanentId]);
    expect(s.state.memory).toBe(0);
    assertNoLoudGap(s);
  });
});
