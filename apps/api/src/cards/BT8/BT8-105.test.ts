import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT5/BT5-098.js";
import "./BT8-105.js";

describe("BT8-105 Dark Gaia Force", () => {
  it("deletes any number of Digimon within the combined play-cost budget", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT8-011"], hand: [{ card: "BT8-105", as: "option" }] },
        1: {
          battleArea: [
            { card: "BT8-011", as: "fiveCost" },
            { card: "BT8-017", as: "tenCost" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });

  it.each([
    { token: "Diaboromon Token", remaining: 1 },
    { token: "Familiar Token", remaining: 2 },
  ])("uses printed costs for $token and excludes DUAL Digimon without play costs", async ({ token, remaining }) => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT8-011"], hand: [{ card: "BT8-105", as: "option" }] },
        1: { battleArea: [{ card: "BT26-075", as: "dual" }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await advance(s.engine).verb.playTwoTokensInOneWindow(1, token);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle();
    expect(s.state.players[1]!.battleArea).toHaveLength(remaining + 1);
    expect(s.state.players[1]!.battleArea.some(({ topCard }) => topCard.cardId === "BT26-075")).toBe(true);
  });

  it("deletes one opposing Digimon costing 15 or less from Security", async () => {
    const s = setupEngine(
      {
        0: { security: [{ card: "BT8-105", as: "option", faceUp: true }] },
        1: {
          battleArea: [
            { card: "BT8-032", as: "target" },
            { card: "BT8-017", as: "other" },
          ],
        },
      },
      { autoSelectCards: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[1]!.battleArea.length === 1);

    expect(s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("requires at least one deletion after activating Main, even when later picks are optional", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT8-011"], hand: [{ card: "BT8-105", as: "option" }] },
        1: { battleArea: [{ card: "BT8-011", as: "target" }] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.battleArea.length === 0);

    expect(s.state.players[1]!.battleArea).toHaveLength(0);
  });
});

describe("BT8-105 Dark Gaia Force — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;

  async function playDarkGaiaForce(
    opponentBattleArea: { card: string; as: string }[],
    answers: (candidates: string[], s: Setup) => string[][],
  ) {
    const s = setupEngine(
      {
        0: { battleArea: ["BT8-011"], hand: [{ card: "BT8-105", as: "option" }] },
        1: { battleArea: opponentBattleArea },
      },
      { autoAcceptOptional: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "chooseTargets");
    const decision = s.decisions.at(-1)!.req;
    const accepted = answers(decision.options?.candidateInstanceIds ?? [], s).map(
      (instanceIds) =>
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: decision.decisionId,
          response: { kind: "chooseTargets", instanceIds },
        }).ok,
    );
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT8-105"));
    return { s, accepted };
  }

  const everyCandidateExcept =
    (...keptAliases: string[]) =>
    (candidates: string[], s: Setup) => {
      const kept = new Set(keptAliases.map((alias) => s.perm(alias).permanentId));
      return [candidates.filter((permanentId) => !kept.has(permanentId))];
    };

  const remainingCardIds = (s: Setup) =>
    s.state.players[1]!.battleArea.map((permanent) => permanent.topCard.cardId).sort();

  it("lets you choose any Digimon whose play costs add up to 15 or less, such as a 3-cost and a 12-cost (Q1783)", async () => {
    const { s, accepted } = await playDarkGaiaForce(
      [
        { card: "BT1-009", as: "twoCost" },
        { card: "BT1-013", as: "threeCost" },
        { card: "BT8-032", as: "twelveCost" },
      ],
      everyCandidateExcept("twoCost"),
    );

    expect(accepted).toEqual([true]);
    expect(remainingCardIds(s)).toEqual(["BT1-009"]);
  });

  it("lets you choose fewer Digimon than the budget allows, but at least 1 (Q1784)", async () => {
    const fewer = await playDarkGaiaForce(
      [
        { card: "BT1-013", as: "threeCost" },
        { card: "BT1-020", as: "fiveCost" },
      ],
      everyCandidateExcept("fiveCost"),
    );
    expect(fewer.accepted).toEqual([true]);
    expect(remainingCardIds(fewer.s)).toEqual(["BT1-020"]);

    const declinedEverything = await playDarkGaiaForce(
      [
        { card: "BT1-013", as: "threeCost" },
        { card: "BT1-020", as: "fiveCost" },
      ],
      (candidates) => [[], candidates.slice(0, 1)],
    );
    expect(declinedEverything.accepted).toEqual([false, true]);
    expect(declinedEverything.s.state.players[1]!.battleArea).toHaveLength(1);
  });

  it("counts the printed play cost of a Digimon that was played without paying its cost (Q1785)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: ["BT8-011"],
          hand: [{ card: "BT8-105", as: "option" }],
          deck: ["BT1-009", "BT1-009"],
        },
        1: {
          battleArea: ["ST3-12", { card: "BT8-032", as: "twelveCost" }],
          hand: [
            { card: "BT5-098", as: "meteorShower" },
            { card: "BT5-040", as: "superStarmon" },
          ],
          deck: ["BT1-009", "BT1-009"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.turnSeat = 1;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(1);
    s.state.memory = 5;

    expect(s.engine.applyIntent(1, { type: "playCard", instanceId: s.inst("meteorShower").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[1]!.trash.some((card) => card.cardId === "BT5-098"));
    const superStarmon = s.state.players[1]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("superStarmon").instanceId,
    );
    expect(superStarmon).toBeDefined();
    expect(s.state.memory).toBe(2);

    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.cardId === "BT8-105"));

    // Printed costs 6 + 12 exceed 15, so only the free-played SuperStarmon fits; counting it as 0 would delete both.
    expect(remainingCardIds(s)).toEqual(["BT8-032", "ST3-12"]);
    expect(s.state.players[1]!.trash.some((card) => card.instanceId === s.inst("superStarmon").instanceId)).toBe(true);

    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;

    const withinPrintedBudget = await playDarkGaiaForce(
      [
        { card: "BT1-013", as: "threeCost" },
        { card: "BT8-032", as: "twelveCost" },
      ],
      (candidates) => [candidates],
    );
    expect(withinPrintedBudget.accepted).toEqual([true]);
    expect(remainingCardIds(withinPrintedBudget.s)).toEqual([]);
  });
});
