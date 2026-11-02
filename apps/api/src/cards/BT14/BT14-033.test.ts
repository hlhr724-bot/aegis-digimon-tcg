import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { assertNoLoudGap, settle, setupEngine } from "../../engine/testkit/harness.js";
import "../index.js";
import { compiled } from "./BT14-033.js";

describe("BT14-033", () => {
  it("preserves Patamon's catalog identity and full ordered IR", () => {
    expect(getCardDefinition("BT14-033")).toMatchObject({
      nameEn: "Patamon",
      colors: ["Yellow"],
      level: 3,
      playCost: 3,
      dp: 1000,
      evoCosts: [{ color: "Yellow", level: 2, memoryCost: 0 }],
      attributes: ["Data"],
      types: ["Mammal"],
    });
    const actions = compiled.effects.find((effect) => effect.trigger === "StartOfYourMainPhase")?.actions ?? [];
    expect(actions).toMatchObject([
      { kind: "Search", filter: { zone: "security" }, count: "all", to: "revealed" },
      {
        kind: "Digivolve",
        optional: true,
        from: ["security"],
        faceDownSecurityOk: true,
        amongPreviousSearch: true,
        payCost: false,
        into: { filter: { colors: ["Yellow"], nameOrTrait: [{ tokens: ["Vaccine"], match: "trait" }] } },
      },
      { kind: "SecurityManipulation", op: "shuffle", controller: "mine" },
      {
        kind: "SecurityManipulation",
        op: "placeAsSecurity",
        optional: true,
        toTop: false,
        condition: { kind: "ifThisEffectDigivolved" },
      },
    ]);
    expect(compiled.effects.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "YourTurn",
      frequency: "OncePerTurn",
      actions: [{ kind: "SubTrigger", event: "whenAddSecurity", actions: [{ kind: "GainMemory", amount: 1 }] }],
    });
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
  });

  it.each([0, 1, 2])(
    "Discord 1556811259867955282: searches all security privately before deciding with %s evolution targets",
    async (targets) => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "BT14-033", as: "patamon" }],
          security: [...Array(targets).fill("BT14-035"), "BT1-009", "BT1-010"],
          hand: ["BT1-009"],
          deck: Array(6).fill("BT1-009"),
        },
        1: { hand: ["BT1-009"], deck: Array(6).fill("BT1-009") },
      });
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      const request = s.decisions.at(-1)?.req;
      expect(request?.kind).toBe("selectCards");
      expect(request?.options?.candidateInstanceIds).toHaveLength(targets);
      expect(request?.options?.min).toBe(0);
      expect(request?.options?.max).toBe(Math.min(1, targets));
      expect(request?.options?.visibleCards?.map((c) => c.cardId).sort()).toEqual(
        [...Array(targets).fill("BT14-035"), "BT1-009", "BT1-010"].sort(),
      );
      expect(s.perm("patamon").topCard.cardId).toBe("BT14-033");
      expect(s.state.players[0]!.security.every((c) => c.faceUp === false)).toBe(true);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: request!.decisionId,
          response: { kind: "selectCards", instanceIds: [] },
        }),
      ).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.decisions.filter(({ req }) => req.sourceCardId === "BT14-033")).toHaveLength(1);
      expect(s.perm("patamon").topCard.cardId).toBe("BT14-033");
      expect(s.state.players[0]!.security.every((c) => c.faceUp === false)).toBe(true);
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
    },
  );

  it.each([1, 2])(
    "evolves into the chosen security instance directly from the single search with %s targets",
    async (targets) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT14-033", as: "patamon" }],
            security: [
              ...Array.from({ length: targets }, (_, index) => ({ card: "BT14-035", as: `vaccine-${index}` })),
              { card: "BT1-009", as: "ineligible" },
            ],
            deck: Array(5).fill("BT1-009"),
          },
          1: { hand: ["BT1-009"], deck: Array(5).fill("BT1-009") },
        },
        { autoDeclineOptional: true },
      );
      s.state.memory = 5;
      const turn = s.engine.runOneTurn();
      await advance(s.engine).waitForMainPhase(0);
      const search = s.decisions.at(-1)!.req;
      const handBefore = s.state.players[0]!.hand.length;
      const chosen = s.inst(`vaccine-${targets - 1}`).instanceId;
      expect(search.options?.candidateInstanceIds).toHaveLength(targets);
      expect(search.options?.candidateInstanceIds).not.toContain(s.inst("ineligible").instanceId);
      expect(search.options?.visibleCards).toHaveLength(targets + 1);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: search.decisionId,
          response: { kind: "selectCards", instanceIds: [chosen] },
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.state.pendingDecision === undefined &&
          s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT14-033"),
      );
      expect(s.perm("patamon").topCard.instanceId).toBe(chosen);
      expect(s.state.players[0]!.security).toHaveLength(targets);
      expect(s.state.players[0]!.security.every((card) => !card.faceUp)).toBe(true);
      expect(s.state.memory).toBe(5);
      expect(s.state.players[0]!.hand).toHaveLength(handBefore + 1);
      expect(
        s.decisions.filter(({ req }) => req.sourceCardId === "BT14-033" && req.kind === "selectCards"),
      ).toHaveLength(1);
      expect(
        s.decisions
          .filter(({ req }) => req.sourceCardId === "BT14-033" && req.kind === "optional")
          .map(({ req }) => req.options?.effectTextPart),
      ).toEqual([
        "If digivolved by this effect, you may place 1 yellow card with the [Vaccine] trait from your hand at the bottom of your security stack.",
      ]);
      advance(s.engine).endMainPhaseIfOpen(0);
      await turn;
      assertNoLoudGap(s);
    },
  );

  it("Discord 1556811259867955282: a resolution-plan No still inspects security before skipping evolution", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT14-033", as: "patamon" },
            { card: "BT26-090", as: "kanan" },
          ],
          security: ["BT14-035", "BT1-009"],
          hand: ["BT1-009"],
          deck: Array(5).fill("BT1-009"),
        },
        1: { hand: ["BT1-009"], deck: Array(5).fill("BT1-009") },
      },
      { autoOrderTriggers: false, declinePrompts: ["reduce this effect's paid cost"] },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    const order = s.decisions.at(-1)!.req;
    expect(order.kind).toBe("orderTriggers");
    const keys = order.options!.triggerKeys!;
    const patamonKey = keys[order.options!.triggerCardIds!.indexOf("BT14-033")]!;
    expect(patamonKey).toBeDefined();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: {
          kind: "orderTriggers",
          order: [patamonKey, ...keys.filter((k) => k !== patamonKey)],
          optionalAnswers: { [patamonKey]: false },
        },
      }),
    ).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const inspection = s.decisions.at(-1)!.req;
    expect(inspection.kind).toBe("selectCards");
    expect(inspection.options?.visibleCards?.map((c) => c.cardId).sort()).toEqual(["BT1-009", "BT14-035"]);
    expect(s.state.players[0]!.security.every((c) => !c.faceUp)).toBe(true);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: inspection.decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.perm("patamon").topCard.cardId).toBe("BT14-033");
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.decisions.filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT14-033")).toHaveLength(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
  });

  it("Q2407 may decline the security digivolution and still shuffles every searched card back", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-033", as: "patamon" }],
          security: [
            { card: "BT14-035", as: "vaccine" },
            { card: "BT1-009", as: "other" },
          ],
          hand: [{ card: "BT14-037", as: "handVaccine" }],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true, declinePrompts: ["Patamon"] },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.perm("patamon").topCard.cardId === "BT14-033");
    expect(s.perm("patamon").topCard.cardId).toBe("BT14-033");
    expect(s.state.players[0]!.security.map((card) => card.cardId).sort()).toEqual(["BT1-009", "BT14-035"]);
    expect(s.state.players[0]!.security.every((card) => card.faceUp === false)).toBe(true);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT14-037");
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    assertNoLoudGap(s);
  });

  it("Q2408-Q2410 free-digivolves, draws, finishes the parent effect, then gains inherited memory", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-033", as: "patamon" }],
          security: [
            { card: "BT14-035", as: "vaccine" },
            { card: "BT1-009", as: "other" },
          ],
          hand: [{ card: "BT14-037", as: "handVaccine" }],
          deck: [{ card: "BT1-009", as: "bonusDraw" }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.perm("patamon").topCard.cardId === "BT14-035");
    await settle(() => s.state.players[0]!.security.some((card) => card.cardId === "BT14-037"));
    expect(s.perm("patamon").stack.map((card) => card.cardId)).toEqual(["BT14-033"]);
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toContain("BT1-009");
    expect(s.state.players[0]!.deck).toHaveLength(0);
    expect(s.state.players[0]!.security.at(-1)?.cardId).toBe("BT14-037");
    expect(s.state.memory, JSON.stringify(s.events.filter((event) => event.kind === "memoryChanged"))).toBe(1);
    const parentIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT14-033" && event.timing === "OnStartMainPhase",
    );
    const childIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT14-035" && event.timing === "WhenDigivolving",
    );
    expect(parentIndex).toBeGreaterThanOrEqual(0);
    if (childIndex >= 0) expect(childIndex).toBeGreaterThan(parentIndex);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    assertNoLoudGap(s);
    expect(
      s.decisions
        .filter(({ req }) => req.kind === "optional" && req.sourceCardId === "BT14-033")
        .map(({ req }) => req.options?.effectTextPart),
    ).toEqual([
      "If digivolved by this effect, you may place 1 yellow card with the [Vaccine] trait from your hand at the bottom of your security stack.",
    ]);
  });

  it("resets the inherited recovery-memory trigger on the next natural turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT1-051", as: "reppamon", under: ["BT14-033"] }],
          hand: [{ card: "BT1-107", as: "firstWave" }, { card: "BT1-107", as: "secondWave" }, "BT1-009"],
          deck: Array(8).fill("BT1-009"),
        },
        1: { hand: ["BT1-009"], deck: Array(8).fill("BT1-009") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    const firstTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("firstWave").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 1);
    expect(s.state.memory).toBe(5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await firstTurn;

    s.state.turnSeat = 1;
    s.state.memory = 3;
    await advance(s.engine).runTurn(1);
    s.state.turnSeat = 0;
    s.state.memory = 10;

    const secondTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondWave").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.security.length === 2);
    expect(s.state.memory).toBe(5);
    advance(s.engine).endMainPhaseIfOpen(0);
    await secondTurn;
    assertNoLoudGap(s);
  });
});

describe("BT14-033 Patamon — KB Q&A rulings", () => {
  it("resolves the digivolved card's [When Digivolving] only after Patamon's effect returns the searched cards (Q2409)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT14-033", as: "patamon" }],
          security: [{ card: "BT17-034", as: "bulkmon" }, "BT1-009", "BT1-009"],
          hand: [{ card: "BT14-037", as: "handVaccine" }],
          deck: ["BT1-009"],
        },
        1: { battleArea: [{ card: "BT14-020", as: "target", dp: 5000 }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const turn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    await settle(() => s.perm("patamon").topCard.cardId === "BT17-034" && s.perm("target").isSuspended);
    await settle();
    // Bulkmon's [When Digivolving] reads the security count: 2 cards mid-effect (suspend only),
    // 3 cards once Patamon's effect has finished and placed the hand card (suspend and -3000 DP).
    expect(s.state.players[0]!.security.map((card) => card.cardId)).toContain("BT14-037");
    expect(s.state.players[0]!.security).toHaveLength(3);
    expect(s.state.players[0]!.security.every((card) => card.faceUp === false)).toBe(true);
    expect(s.perm("target").isSuspended).toBe(true);
    expect(s.perm("target").currentDP).toBe(2000);
    const patamonEffectIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT14-033" && event.timing === "OnStartMainPhase",
    );
    const bulkmonEffectIndex = s.events.findIndex(
      (event) =>
        event.kind === "effectResolved" && event.sourceCardId === "BT17-034" && event.timing === "WhenDigivolving",
    );
    expect(patamonEffectIndex).toBeGreaterThanOrEqual(0);
    expect(bulkmonEffectIndex).toBeGreaterThan(patamonEffectIndex);
    advance(s.engine).endMainPhaseIfOpen(0);
    await turn;
    assertNoLoudGap(s);
  });
});
