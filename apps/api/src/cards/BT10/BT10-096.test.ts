import { EffectTiming } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { type EngineSetup, setupEngine, settle } from "../../engine/testkit/harness.js";
import "./BT10-087.js";
import "./BT10-096.js";

describe("BT10-096 Burning Star Crusher", () => {
  it("deletes only an opponent Digimon whose DP does not exceed the chosen level 4+ Shoutmon", async () => {
    const preferred: string[] = [];
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-013", as: "shoutmon", dp: 10_000 }],
          hand: [{ card: "BT10-096", as: "option" }],
        },
        1: {
          battleArea: [
            { card: "BT10-043", as: "eligible", dp: 10_000 },
            { card: "BT10-044", as: "tooLarge", dp: 11_000 },
          ],
        },
      },
      { autoSelectCards: true, autoOrderTriggers: true, preferInstanceIds: preferred },
    );
    const eligibleId = s.perm("eligible").permanentId;
    const tooLargeId = s.perm("tooLarge").permanentId;
    preferred.push(s.perm("shoutmon").permanentId, eligibleId);
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => !s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === eligibleId));

    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === tooLargeId)).toBe(true);
  });

  it("does not delete when you have no level 4 or higher Shoutmon to choose", async () => {
    const s = setupEngine(
      {
        0: { battleArea: ["BT10-007"], hand: [{ card: "BT10-096", as: "option" }] },
        1: { battleArea: [{ card: "BT10-043", as: "target", dp: 1000 }] },
      },
      { autoSelectCards: true, autoOrderTriggers: true },
    );
    s.state.memory = 10;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("option").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.trash.some((card) => card.instanceId === s.inst("option").instanceId));

    expect(
      s.state.players[1]!.battleArea.some((permanent) => permanent.permanentId === s.perm("target").permanentId),
    ).toBe(true);
  });

  it("Security adds the Xros Heart Digimon and plays Taiki together", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-034", as: "added" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("rest").instanceId));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("added").instanceId)).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.instanceId === s.inst("taiki").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.deck.some((card) => card.instanceId === s.inst("rest").instanceId)).toBe(true);
  });

  it("Security still adds the Digimon when no Taiki was revealed", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [{ card: "BT10-034", as: "added" }, "BT1-009", "BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoOrderCards: true, autoOrderTriggers: true },
    );

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("added").instanceId)).toBe(true);
  });

  it("always reveals, and declining the add and play sends all 3 revealed cards to the bottom", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-034", as: "xrosHeart" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT1-009", as: "rest" },
            { card: "BT1-010", as: "unrevealedFirst" },
            { card: "BT1-011", as: "unrevealedSecond" },
          ],
        },
      },
      { autoDeclineOptional: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    const revealed = ["xrosHeart", "taiki", "rest"].map((alias) => s.inst(alias).instanceId);

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));

    const deck = s.state.players[0]!.deck.map((card) => card.instanceId);
    expect(deck.slice(0, 2)).toEqual([s.inst("unrevealedFirst").instanceId, s.inst("unrevealedSecond").instanceId]);
    expect(new Set(deck.slice(2))).toEqual(new Set(revealed));
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
  });
});

describe("BT10-096 Burning Star Crusher — KB Q&A rulings", () => {
  const securityOptions = {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoOrderCards: true,
    autoOrderTriggers: true,
  } as const;

  // Taiki's own [On Play] reveals the next 4 cards, so non-Xros Heart filler keeps it from moving the cards asserted here.
  const taikiOnPlayFiller = ["BT1-009", "BT1-010", "BT1-009", "BT1-010"];

  const battleAreaCardIds = (s: EngineSetup) =>
    s.state.players[0]!.battleArea.map((permanent) => permanent.topCard?.instanceId);

  it("plays a revealed [Taiki Kudo] without paying its cost, but not another Tamer (Q2027)", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-034", as: "xrosHeart" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT10-090", as: "otherTamer" },
            ...taikiOnPlayFiller,
          ],
        },
      },
      securityOptions,
    );
    s.state.memory = 0;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => battleAreaCardIds(s).includes(s.inst("taiki").instanceId));

    expect(battleAreaCardIds(s)).toEqual([s.inst("taiki").instanceId]);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toContain(s.inst("otherTamer").instanceId);
  });

  it("still plays [Taiki Kudo] when no Xros Heart Digimon card is revealed (Q2028)", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-089", as: "xrosHeartTamer" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT10-095", as: "xrosHeartOption" },
            ...taikiOnPlayFiller,
          ],
        },
      },
      securityOptions,
    );
    s.state.memory = 0;

    await advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    await settle(() => battleAreaCardIds(s).includes(s.inst("taiki").instanceId));

    expect(battleAreaCardIds(s)).toEqual([s.inst("taiki").instanceId]);
    expect(s.state.memory).toBe(0);
    expect(s.state.players[0]!.hand).toHaveLength(0);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining([s.inst("xrosHeartTamer").instanceId, s.inst("xrosHeartOption").instanceId]),
    );
  });

  it("must add the Xros Heart Digimon and play [Taiki Kudo] together once the effect is used (Q2029)", async () => {
    const s = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-034", as: "xrosHeart" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoAcceptOptional: true, autoOrderCards: true, autoOrderTriggers: true },
    );
    const xrosHeartId = s.inst("xrosHeart").instanceId;
    const taikiId = s.inst("taiki").instanceId;

    const resolution = advance(s.engine).fireForInstance(EffectTiming.SecuritySkill, s.inst("option"));
    const answerSelectionRefusingSkip = async (expectedId: string) => {
      await settle(() => s.state.pendingDecision?.kind === "selectCards");
      const request = s.decisions.at(-1)!.req;
      expect(request.kind).toBe("selectCards");
      expect(request.options?.candidateInstanceIds).toContain(expectedId);
      expect(request.options?.min).toBe(1);
      const decisionId = s.state.pendingDecision!.decisionId;
      const skip = s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId,
        response: { kind: "selectCards", instanceIds: [] },
      });
      expect(skip.ok).toBe(false);
      expect(s.state.pendingDecision?.decisionId).toBe(decisionId);
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId,
          response: { kind: "selectCards", instanceIds: [expectedId] },
        }),
      ).toEqual({ ok: true });
    };

    await answerSelectionRefusingSkip(xrosHeartId);
    await answerSelectionRefusingSkip(taikiId);
    await resolution;
    await settle(() => battleAreaCardIds(s).includes(taikiId));

    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([xrosHeartId]);
    expect(battleAreaCardIds(s)).toEqual([taikiId]);

    const declined = setupEngine(
      {
        0: {
          security: [{ card: "BT10-096", as: "option", faceUp: true }],
          deck: [
            { card: "BT10-034", as: "xrosHeart" },
            { card: "BT10-087", as: "taiki" },
            { card: "BT1-009", as: "rest" },
          ],
        },
      },
      { autoDeclineOptional: true, autoOrderTriggers: true },
    );
    await advance(declined.engine).fireForInstance(EffectTiming.SecuritySkill, declined.inst("option"));

    expect(declined.state.players[0]!.hand).toHaveLength(0);
    expect(declined.state.players[0]!.battleArea).toHaveLength(0);
  });
});
