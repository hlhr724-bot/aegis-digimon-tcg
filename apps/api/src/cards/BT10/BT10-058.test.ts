import { describe, expect, it } from "vitest";
import { getCardDefinition, type PlayerState } from "@aegis/shared";
import { assertNoLoudGap, setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./BT10-058.js";

describe("BT10-058 Monitamon", () => {
  it("matches its catalog and encodes one 2-card pool of black-name or Twilight cards", () => {
    const d = getCardDefinition("BT10-058")!;
    expect([d.colors, d.level, d.playCost, d.dp]).toEqual([["Black"], 3, 3, 2000]);
    expect(d.evoCosts).toEqual([{ color: "Black", level: 2, memoryCost: 0 }]);
    expect([d.forms, d.attributes, d.types]).toEqual([["Rookie"], ["Data"], ["CRT", "Twilight", "Xros Heart"]]);
    expect(compiled).toMatchObject({ coverage: "full", residual: [] });
    const action = compiled.effects[0]!.actions[0]!;
    expect(action.kind).toBe("RevealAdd");
    if (action.kind !== "RevealAdd") throw new Error("expected RevealAdd");
    expect(action.add).toHaveLength(1);
    expect(action.add[0]).toMatchObject({ count: 2, orFilters: [{ nameOrTrait: [{ tokens: ["Twilight"] }] }] });
  });

  it("adds two eligible black Twilight cards from four revealed cards", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-058", as: "source" }],
          deck: [{ card: "BT10-061", as: "one" }, { card: "BT10-066", as: "two" }, "BT10-062", "BT10-064"],
        },
      },
      { autoSelectCards: true },
    );
    const player = s.state.players[0] as PlayerState;
    s.state.memory = 3;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => player.hand.some((c) => c.instanceId === s.inst("one").instanceId));
    expect(player.hand.some((c) => c.instanceId === s.inst("two").instanceId)).toBe(true);
    expect(player.deck).toHaveLength(2);
  });

  it("must add a dual-qualified card together with another Twilight card", async () => {
    const s = setupEngine({
      0: {
        hand: [{ card: "BT10-058", as: "source" }],
        deck: [
          { card: "BT10-061", as: "first" },
          { card: "BT10-063", as: "secondTwilight" },
          { card: "BT5-042", as: "yellowKnightmon" },
          { card: "BT10-064", as: "ineligible" },
        ],
      },
    });
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");

    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    expect(request.sourceCardId).toBe("BT10-058");
    const both = [s.inst("first").instanceId, s.inst("secondTwilight").instanceId];
    expect(request.options).toMatchObject({ min: 2, max: 2 });
    expect(new Set(request.options?.candidateInstanceIds)).toEqual(new Set(both));

    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "selectCards", instanceIds: both },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 2);
    expect(new Set(s.state.players[0]!.hand.map(({ instanceId }) => instanceId))).toEqual(new Set(both));
    assertNoLoudGap(s);
  });

  it("adds the only eligible card and bottoms the other three", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-058", as: "source" }],
          deck: [
            { card: "BT10-066", as: "eligible" },
            { card: "BT5-042", as: "yellowKnightmon" },
            "BT10-062",
            "BT10-064",
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(
      s.engine.applyIntent(0, {
        type: "playCard",
        instanceId: s.inst("source").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.hand.some(({ instanceId }) => instanceId === s.inst("eligible").instanceId) &&
        s.state.players[0]!.deck.length === 3,
    );

    expect(s.state.players[0]!.hand).toHaveLength(1);
    assertNoLoudGap(s);
  });
});

describe("BT10-058 Monitamon — KB Q&A rulings", () => {
  it("places the revealed cards that were not added at the bottom of the deck in the chosen order (Q1983)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-058", as: "source" }],
          deck: [
            { card: "BT10-061", as: "added" },
            { card: "BT10-062", as: "restFirst" },
            { card: "BT5-042", as: "restSecond" },
            { card: "BT10-064", as: "restThird" },
            { card: "BT1-009", as: "untouchedTop" },
            { card: "BT1-013", as: "untouchedNext" },
          ],
        },
      },
      { autoSelectCards: true, autoOrderCards: false },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision?.kind === "orderCards");

    const pending = s.state.pendingDecision!;
    const request = s.decisions.find(({ req }) => req.decisionId === pending.decisionId)!.req;
    const rest = [s.inst("restFirst").instanceId, s.inst("restSecond").instanceId, s.inst("restThird").instanceId];
    expect(new Set(request.options?.candidateInstanceIds)).toEqual(new Set(rest));
    const chosenOrder = [...rest].reverse();
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pending.decisionId,
        response: { kind: "orderCards", order: chosenOrder },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 5);

    const deck = s.state.players[0]!.deck.map(({ instanceId }) => instanceId);
    expect(deck.slice(0, 2)).toEqual([s.inst("untouchedTop").instanceId, s.inst("untouchedNext").instanceId]);
    expect(deck.slice(2)).toEqual(chosenOrder);
    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("added").instanceId]);
    assertNoLoudGap(s);
  });

  it("still adds the single eligible card when only one of the four revealed cards qualifies (Q1984)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "BT10-058", as: "source" }],
          deck: [
            { card: "BT5-042", as: "yellowKnightmon" },
            { card: "BT10-062", as: "blackNoTwilight" },
            { card: "BT10-066", as: "onlyEligible" },
            { card: "BT10-064", as: "blackRock" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 3;

    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.deck.length === 3);

    expect(s.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([s.inst("onlyEligible").instanceId]);
    expect(new Set(s.state.players[0]!.deck.map(({ instanceId }) => instanceId))).toEqual(
      new Set([
        s.inst("yellowKnightmon").instanceId,
        s.inst("blackNoTwilight").instanceId,
        s.inst("blackRock").instanceId,
      ]),
    );
    assertNoLoudGap(s);
  });
});
