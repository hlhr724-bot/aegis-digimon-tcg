import "#api/cards/BT3/BT3-093";
import { describe, expect, it } from "vitest";
import { getCardDefinition, type Action, type CardInstance } from "@aegis/shared";
import type { EffectContext } from "../../EffectContext.js";
import { compiled as eldradimon } from "../../../../cards/EX7/EX7-047.js";
import { runRevealAdd } from "./reveal.js";
import { setupEngine, settle } from "../../../testkit/harness.js";
import "../../../../cards/P/P-104.js";
import "../../../../cards/BT5/BT5-009.js";

// Recording-port proof of the current compiled producer, not a public gameplay fixture.
// The real EX7-047 public play/evolution witnesses remain in its colocated card suite.
describe("current EX7-047 reveal aggregate budget adapter", () => {
  it.each([
    ["equality", ["three", "four"], ["four", "three"], ["seven", "miss"]],
    ["refusal", [], [], ["three", "four", "seven", "miss"]],
    [
      "forged over-budget, duplicate and noncandidate IDs",
      ["seven", "four", "three", "three", "miss", "absent"],
      ["four", "three"],
      ["seven", "miss"],
    ],
  ])("preserves the physical disposition for %s", async (_label, answer, expectedPlayed, expectedBottom) => {
    const cards = [
      ["three", "EX7-038"],
      ["four", "EX7-041"],
      ["seven", "EX7-045"],
      ["miss", "BT1-009"],
    ].map(([instanceId, cardId]) => ({ instanceId, cardId, ownerSeat: 0, faceUp: true }) as CardInstance);
    const played: string[] = [];
    const staged: string[] = [];
    const bottom: string[] = [];
    const prompts: unknown[] = [];
    const ctx = {
      source: { ownerSeat: 0, cardId: "EX7-047" },
      game: { definitionOf: (card: CardInstance) => getCardDefinition(card.cardId)! },
      ask: {
        selectCards: async (_ctx: EffectContext, options: unknown) => {
          prompts.push(options);
          return answer;
        },
      },
      fx: {
        reveal: async () => cards,
        returnToHand: async (ids: string[]) => {
          staged.push(...ids);
        },
        playInstances: async (ids: string[], options: unknown) => {
          expect(options).toEqual({ payCost: false });
          played.push(...ids);
          return [];
        },
        returnToDeck: async (ids: string[], options: unknown) => {
          expect(options).toEqual({ toTop: false, suppressWhenEffectAddsToDeck: true });
          bottom.push(...ids);
        },
      },
    } as unknown as EffectContext;
    const action = eldradimon.effects.find((effect) => effect.trigger === "OnPlay")!.actions[0]!;
    expect(action).toMatchObject({ kind: "RevealAdd", add: [{ totalPlayCostBudget: 7 }] });

    await runRevealAdd(ctx, action as Extract<Action, { kind: "RevealAdd" }>);

    expect(prompts).toEqual([
      expect.objectContaining({
        candidates: ["three", "four", "seven"],
        visible: ["three", "four", "seven", "miss"],
        min: 0,
        max: 3,
        maxTotalPlayCost: 7,
      }),
    ]);
    expect(played).toEqual(expectedPlayed);
    expect(staged).toEqual(expectedPlayed);
    expect(bottom).toEqual(expectedBottom);
    expect(new Set([...played, ...bottom])).toEqual(new Set(cards.map((card) => card.instanceId)));
    expect(played.length + bottom.length).toBe(cards.length);
  });
});

describe("RevealAdd public reveal events", () => {
  it("names the resolving card as the source of every deck reveal", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "P-104", as: "source" }],
          battleArea: ["BT1-037"],
          deck: [{ card: "BT1-037", as: "match" }, "BT1-009"],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("match").instanceId));

    expect(s.events.filter((event) => event.kind === "cardRevealed")).toEqual([
      expect.objectContaining({ seat: 0, cardId: "BT1-037", sourceCardId: "P-104" }),
      expect.objectContaining({ seat: 0, cardId: "BT1-009", sourceCardId: "P-104" }),
    ]);
  });
});

// Exercise the same pre-existing multi-category action on another printed "and" search.
it("uses successive selectCards for a sole Shoutmon/Blitz overlap without requiring a new decision shape", async () => {
  const s = setupEngine({
    0: {
      hand: [{ card: "BT5-009", as: "source" }],
      deck: [
        { card: "BT5-019", as: "both" },
        { card: "BT5-086", as: "blitz-only" },
        { card: "BT1-009", as: "miss" },
      ],
    },
  });
  s.state.memory = 10;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("source").instanceId })).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision !== undefined);
  const shoutmon = s.decisions.at(-1)!.req;
  expect(shoutmon.kind).toBe("selectCards");
  expect(shoutmon.options?.candidateInstanceIds).toEqual([s.inst("both").instanceId]);
  expect(shoutmon.options?.min).toBe(0);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: shoutmon.decisionId,
      response: { kind: "selectCards", instanceIds: [] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.decisionId !== shoutmon.decisionId);
  const blitz = s.decisions.at(-1)!.req;
  expect(blitz.kind).toBe("selectCards");
  expect(blitz.options?.candidateInstanceIds).toEqual([s.inst("both").instanceId]);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: blitz.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("blitz-only").instanceId] },
    }).ok,
  ).toBe(false);
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: blitz.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("both").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision === undefined && s.state.players[0]!.hand.length === 1);
  expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual(["BT5-019"]);
  expect(s.state.players[0]!.deck.map(({ cardId }) => cardId)).toEqual(["BT5-086", "BT1-009"]);
});

it("broadcasts the actual public reveal selection added to hand and the ordered remainder", async () => {
  const s = setupEngine(
    {
      0: {
        hand: [{ card: "BT3-093", as: "searcher" }],
        deck: [
          { card: "BT1-027", as: "chosen" },
          { card: "ST1-03", as: "first-rest" },
          { card: "ST1-02", as: "second-rest" },
          "ST1-04",
        ],
      },
    },
    { autoOrderCards: false },
  );
  s.state.memory = 10;
  expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("searcher").instanceId })).toEqual({
    ok: true,
  });
  await settle(() => s.state.pendingDecision?.kind === "selectCards");
  const choice = s.decisions.at(-1)!.req;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: choice.decisionId,
      response: { kind: "selectCards", instanceIds: [s.inst("chosen").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.state.pendingDecision?.kind === "orderCards");
  const order = s.decisions.at(-1)!.req;
  expect(
    s.engine.applyIntent(0, {
      type: "respondDecision",
      decisionId: order.decisionId,
      response: { kind: "orderCards", order: [s.inst("second-rest").instanceId, s.inst("first-rest").instanceId] },
    }),
  ).toEqual({ ok: true });
  await settle(() => s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT3-093"));
  expect(s.events).toContainEqual(
    expect.objectContaining({ kind: "cardsMoved", to: "hand", cardIds: ["BT1-027"], handAddition: "transfer" }),
  );
  expect(s.events).toContainEqual(
    expect.objectContaining({
      kind: "cardsMoved",
      to: "deckBottom",
      cardIds: ["ST1-02", "ST1-03"],
      deckReturnOrder: true,
    }),
  );
  expect(s.state.players[0]!.deck.slice(-2).map((card) => card.cardId)).toEqual(["ST1-02", "ST1-03"]);
});
