import fixture from "#api/engine/scenarios/mineral-rock-end-turn-placement.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { describe, expect, it } from "vitest";
import { EffectTiming, getCardDefinition } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./index.js";
import { compiled } from "./EX8-055.js";

describe("EX8-055", () => {
  it("matches the committed catalog identity and printed clauses", () => {
    expect(getCardDefinition("EX8-055")).toMatchObject({
      cardId: "EX8-055",
      nameEn: "Pyramidimon",
      colors: ["Black"],
      kinds: ["Digimon"],
      level: 6,
      playCost: 12,
      dp: 12000,
      evoCosts: [{ color: "Black", level: 5, memoryCost: 4 }],
      forms: ["Mega"],
      attributes: ["Virus"],
      types: ["Mineral", "LIBERATOR"],
      effectText: expect.stringContaining("any 3 digivolution cards"),
    });
    expect(getCardDefinition("EX8-055")?.effectText).toContain("End of Your Turn");
    expect(getCardDefinition("EX8-055")?.securityEffectText).toBeUndefined();
  });

  it("has Fragment (3) and trashes 3 Mineral/Rock digivolution cards to unsuspend and gain Security Attack +1 when digivolving and attacking", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "Static")?.keywords).toContainEqual({
      keyword: "Fragment",
      amount: 3,
      raw: "＜Fragment (3)＞",
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions).toMatchObject([
      {
        kind: "Unsuspend",
        optional: true,
        abortOnDecline: true,
        target: { filter: { isSelfRef: true }, count: 1, isSelf: true },
        cost: {
          kind: "trash",
          target: {
            filter: {
              zone: "digivolutionCards",
              controller: "mine",
              nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }],
            },
            count: 3,
          },
        },
      },
      { kind: "GainKeyword", keyword: { keyword: "SecurityAttack", amount: 1 }, duration: "forTheTurn" },
    ]);
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenAttacking")?.actions[0]).toMatchObject({
      kind: "Unsuspend",
      optional: true,
      abortOnDecline: true,
      cost: {
        kind: "trash",
        target: {
          filter: {
            zone: "digivolutionCards",
            controller: "mine",
            nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }],
          },
          count: 3,
        },
      },
    });
  });
  it("places 1 to 3 Mineral/Rock cards from trash underneath itself at end of turn", () =>
    expect(compiled.effects?.find((entry) => entry.trigger === "EndOfYourTurn")?.actions[0]).toMatchObject({
      kind: "PlaceUnder",
      target: {
        filter: { zone: "trash", controller: "mine", nameOrTrait: [{ tokens: ["Mineral", "Rock"], match: "trait" }] },
        count: 3,
        upTo: true,
        minimum: 1,
        from: ["trash"],
      },
      underFilter: { isSelfRef: true },
      position: "bottom",
    }));
  it("places an exact Mineral card from trash underneath itself at end of turn", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX8-055", as: "pyramid" }], trash: ["EX8-053", "EX8-005"] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).runTurn(0);

    expect(s.perm("pyramid").stack.some((card) => card.cardId === "EX8-053")).toBe(true);
    expect(s.perm("pyramid").stack.some((card) => card.cardId === "EX8-005")).toBe(true);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX8-053")).toBe(false);
  });
  it("places three qualifying trash cards in one end-turn selection", async () => {
    const s = setupScenario(fixture, { autoAcceptOptional: true, autoSelectCards: true });

    await advance(s.engine).runTurn(0);

    expect(s.perm("pyramid").stack.map(({ instanceId }) => instanceId)).toEqual(
      expect.arrayContaining(["mineral", "rock", "egg"].map((alias) => s.inst(alias).instanceId)),
    );
    expect(s.perm("pyramid").stack).toHaveLength(3);
    const selections = s.decisions.filter(({ req }) => req.sourceCardId === "EX8-055" && req.kind === "selectCards");
    expect(selections).toHaveLength(1);
    expect(selections[0]!.req.options).toMatchObject({ min: 1, max: 3 });
    expect(s.state.players[0]!.trash.map(({ instanceId }) => instanceId)).toEqual([s.inst("unrelated").instanceId]);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("can decline the end-turn placement without moving a trash card", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });

    await advance(s.engine).runTurn(0);

    expect(s.perm("pyramid").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash).toHaveLength(4);
    expect(s.state.pendingDecision).toBeUndefined();
  });
  it("resets the optional end-turn placement on the next own turn", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-055", as: "pyramid" }],
          trash: ["EX8-053", "EX8-005", "EX8-053", "EX8-005"],
          deck: Array(12).fill("BT1-009"),
        },
        1: { deck: Array(12).fill("BT1-010") },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).runTurn(0);
    const firstCount = s.perm("pyramid").stack.length;
    expect(firstCount).toBeGreaterThan(0);
    s.state.turnSeat = 1;
    s.state.memory = 3;
    const opponentTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(1);
    advance(s.engine).endMainPhaseIfOpen(1);
    await opponentTurn;
    s.state.turnSeat = 0;
    s.state.memory = 3;
    const nextTurn = s.engine.runOneTurn();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await nextTurn;
    expect(s.perm("pyramid").stack.length).toBeGreaterThan(firstCount);
  });
  it("publicly evolves over three qualifying sources, then trashes those exact sources to unsuspend and gain Security Attack +1", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX8-051",
              as: "base",
              under: [
                { card: "BT2-005", as: "egg" },
                { card: "EX8-046", as: "gotsumon" },
                { card: "EX8-048", as: "landramon" },
              ],
            },
          ],
          hand: [{ card: "EX8-055", as: "pyramid" }],
        },
        1: { security: ["BT1-009"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => !observe(s.engine).isAttacking() && s.perm("base").isSuspended);
    expect(s.state.memory).toBe(4);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === s.inst("pyramid").cardId);

    await settle(() => s.perm("base").stack.length === 1);

    expect(s.perm("base").topCard.instanceId).toBe(s.inst("pyramid").instanceId);
    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT2-005"]);
    for (const alias of ["gotsumon", "landramon", "base"] as const) {
      expect(s.state.players[0]!.trash.some(({ instanceId }) => instanceId === s.inst(alias).instanceId)).toBe(true);
    }
    expect(s.state.memory).toBe(0);
    expect(s.perm("base").isSuspended).toBe(false);
    expect(observe(s.engine).keywordAmount(s.perm("base"), "SecurityAttack")).toBe(1);
  });

  it("declines the optional 'by' cost when digivolving and keeps all sources and the suspension", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            {
              card: "EX8-051",
              as: "base",
              suspended: true,
              under: ["BT2-005", "EX8-046", "EX8-048"],
            },
          ],
          hand: [{ card: "EX8-055", as: "pyramid" }],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 4;
    await s.ready();

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: false },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.perm("base").stack.map(({ cardId }) => cardId)).toEqual(["BT2-005", "EX8-046", "EX8-048", "EX8-051"]);
    expect(s.perm("base").isSuspended).toBe(true);
    expect(observe(s.engine).keywordAmount(s.perm("base"), "SecurityAttack")).toBe(0);
  });

  it("trashes three sources during a real attack, checks twice, and expires the bonus", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-055", as: "pyramid", under: ["EX8-053", "EX8-051", "EX8-049"] }],
        },
        1: { security: ["BT1-009", "BT1-010", "BT1-013"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("pyramid").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[1]!.security.length === 1);

    expect(s.perm("pyramid").stack).toHaveLength(0);
    expect(observe(s.engine).keywordAmount(s.perm("pyramid"), "SecurityAttack")).toBe(1);
    expect(s.state.players[1]!.security).toHaveLength(1);
    await advance(s.engine).runTurn(0);
    expect(observe(s.engine).keywordAmount(s.perm("pyramid"), "SecurityAttack")).toBe(0);
  });

  it("does nothing when only two qualifying digivolution cards can pay the exact cost (Q3938)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX8-055", as: "pyramid", under: ["EX8-048", "EX8-049"], suspended: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("pyramid"));
    expect(s.perm("pyramid").isSuspended).toBe(true);
    expect(s.perm("pyramid").stack).toHaveLength(2);
    expect(observe(s.engine).keywordAmount(s.perm("pyramid"), "SecurityAttack")).toBe(0);
  });

  it("places no cards only when the optional end-turn effect is declined (Q3940)", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX8-055", as: "pyramid" }], trash: ["EX8-053"] } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).runTurn(0);

    expect(s.perm("pyramid").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.some((card) => card.cardId === "EX8-053")).toBe(true);
  });

  it("evolves legally from Black level 5 for four and rejects a non-Black source", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "EX8-051", as: "base" }], hand: [{ card: "EX8-055", as: "pyramid" }] },
    });
    s.state.memory = 4;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("pyramid").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").topCard.cardId === "EX8-055");
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["EX8-051"]);
    expect(s.state.memory).toBe(0);

    const invalid = setupEngine({
      0: { battleArea: [{ card: "BT1-016", as: "base" }], hand: [{ card: "EX8-055", as: "pyramid" }] },
    });
    invalid.state.memory = 4;
    await invalid.ready();
    expect(
      invalid.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: invalid.perm("base").permanentId,
        instanceId: invalid.inst("pyramid").instanceId,
      }),
    ).toMatchObject({ ok: false, reason: "invalid-evolution" });
    expect(invalid.state.memory).toBe(4);
  });
});

describe("EX8-055 Pyramidimon — KB Q&A rulings", () => {
  it("pays its 3-card cost with Mineral/Rock digivolution cards drawn from several of your Digimon (Q3937)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX8-055", as: "pyramid", under: [{ card: "EX8-049", as: "ownSource" }], suspended: true },
            {
              card: "BT1-071",
              as: "ally",
              under: [
                { card: "EX8-046", as: "allyRock" },
                { card: "EX8-048", as: "allyMineral" },
              ],
            },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const paidIds = ["ownSource", "allyRock", "allyMineral"].map((alias) => s.inst(alias).instanceId);

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("pyramid"));
    await settle(() => !s.perm("pyramid").isSuspended);

    expect(s.perm("pyramid").stack).toHaveLength(0);
    expect(s.perm("ally").stack).toHaveLength(0);
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toEqual(expect.arrayContaining(paidIds));
    expect(observe(s.engine).keywordAmount(s.perm("pyramid"), "SecurityAttack")).toBe(1);
  });

  it("places a Rock-trait Digi-Egg card from the trash under itself at end of turn (Q3939)", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "EX8-055", as: "pyramid" }], trash: [{ card: "BT9-005", as: "egg" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await advance(s.engine).runTurn(0);

    expect(s.perm("pyramid").stack.map((card) => card.instanceId)).toEqual([s.inst("egg").instanceId]);
    expect(s.state.players[0]!.trash).toHaveLength(0);
  });
});
