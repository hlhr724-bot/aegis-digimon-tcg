import { describe, expect, it } from "vitest";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import { getActivationMemoryCost } from "#api/engine/effects/interpreter/getActivationMemoryCost";

function getProjectedCost(effect: Partial<CardEffect>) {
  return getActivationMemoryCost({ effect: { trigger: "Main", actions: [], ...effect } });
}

describe("activation memory cost projection", () => {
  it("counts a fixed clause payment without running its payload", () => {
    expect(
      getProjectedCost({
        cost: { kind: "payMemory", memory: 3 },
        actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
      }),
    ).toEqual({ minimum: 3, maximum: 3 });
  });

  it("keeps memory gains and end-of-turn losses out of immediate spending", () => {
    expect(
      getProjectedCost({
        actions: [
          { kind: "GainMemory", amount: 2 },
          { kind: "GainMemory", amount: -2, at: "endOfTurn" },
        ],
      }),
    ).toEqual({ minimum: 0, maximum: 0 });
  });

  it("projects direct immediate memory losses", () => {
    expect(getProjectedCost({ actions: [{ kind: "GainMemory", amount: -4 }] })).toEqual({ minimum: 4, maximum: 4 });
  });

  it("keeps an optional payment bounded and distinct from a free activation", () => {
    expect(getProjectedCost({ cost: { kind: "payMemory", memory: 3, optional: true } })).toEqual({
      minimum: 0,
      maximum: 3,
    });
  });

  it("counts compound payments once", () => {
    expect(
      getProjectedCost({
        cost: {
          kind: "compound",
          costs: [
            { kind: "payMemory", memory: 2 },
            { kind: "payMemory", memory: 3 },
          ],
        },
      }),
    ).toEqual({ minimum: 0, maximum: 5 });
  });

  it("does not add the unused base payment to alternative costs", () => {
    expect(
      getProjectedCost({
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            cost: { kind: "payMemory", memory: 9 },
            costOptions: [
              { kind: "payMemory", memory: 2 },
              { kind: "payMemory", memory: 4 },
            ],
          },
        ],
      }),
    ).toEqual({ minimum: 2, maximum: 4 });
  });

  it("counts a cost-gated wrapper payment exactly once", () => {
    expect(
      getProjectedCost({
        actions: [
          {
            kind: "CostGatedBlock",
            cost: { kind: "payMemory", memory: 2 },
            actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
          },
        ],
      }),
    ).toEqual({ minimum: 2, maximum: 2 });
  });

  it("includes additional payments", () => {
    expect(
      getProjectedCost({
        actions: [
          {
            kind: "Draw",
            controller: "mine",
            amount: 1,
            cost: { kind: "payMemory", memory: 1 },
            additionalCost: { kind: "payMemory", memory: 2 },
            additionalCosts: [{ kind: "payMemory", memory: 3 }],
          },
        ],
      }),
    ).toEqual({ minimum: 6, maximum: 6 });
  });

  it("bounds conditional branches without inspecting hidden state", () => {
    expect(
      getProjectedCost({
        actions: [
          {
            kind: "ConditionalBranch",
            condition: { kind: "true" },
            ifTrue: [{ kind: "GainMemory", amount: -2 }],
            ifFalse: [{ kind: "GainMemory", amount: -5 }],
          },
        ],
      }),
    ).toEqual({ minimum: 0, maximum: 5 });
  });

  it("does not charge future triggered payments while installing an effect", () => {
    expect(
      getProjectedCost({
        actions: [
          { kind: "DelayedEffect", trigger: "nextEndOfOpponentTurn", effect: { kind: "GainMemory", amount: -5 } },
        ],
      }),
    ).toEqual({ minimum: 0, maximum: 0 });
  });

  it("does not charge a replacement's deferred payment at installation", () => {
    const effect = JSON.parse(
      '{"trigger":"Main","actions":[{"kind":"Replacement","cost":{"kind":"payMemory","memory":4}}]}',
    );
    expect(getProjectedCost(effect)).toEqual({ minimum: 0, maximum: 0 });
  });

  it("does not offset a declared payment with a later memory refund", () => {
    expect(
      getProjectedCost({ cost: { kind: "payMemory", memory: 3 }, actions: [{ kind: "GainMemory", amount: 3 }] }),
    ).toEqual({
      minimum: 3,
      maximum: 3,
    });
  });

  it("includes an immediate payment for installing a cost modifier", () => {
    const effect = JSON.parse(
      '{"actions":[{"kind":"CostModifier","costType":"play","amount":-2,"cost":{"kind":"payMemory","memory":2}}]}',
    );
    expect(getProjectedCost(effect)).toEqual({ minimum: 2, maximum: 2 });
    const deferred = JSON.parse(
      '{"actions":[{"kind":"CostModifier","costType":"digivolve","mode":"reduce","duration":"nextDigivolveThisTurn","amount":2,"cost":{"kind":"trash"}}]}',
    );
    expect(getProjectedCost(deferred)).toEqual({ minimum: 0, maximum: 0 });
  });

  it("keeps paid plays with an implicit default cost unknown", () => {
    const effect = JSON.parse('{"actions":[{"kind":"PlayFromZone"}]}');
    expect(getProjectedCost(effect)).toEqual({ minimum: 0, maximum: null });
  });

  it("proves an explicit free play has no immediate declared memory payment", () => {
    expect(
      getProjectedCost({
        actions: [{ kind: "PlayWithoutCost", target: { filter: {}, isSelf: true, count: 1 }, payCost: false }],
      }),
    ).toEqual({ minimum: 0, maximum: 0 });
  });

  it("keeps paid digivolutions and borrowed effects unknown", () => {
    for (const kind of ["Digivolve", "UseOptionWithoutCost", "ActivateForeignEffect", "RawUnparsed"]) {
      expect(getProjectedCost(JSON.parse(JSON.stringify({ actions: [{ kind, payCost: true }] })))).toEqual({
        minimum: 0,
        maximum: null,
      });
    }
  });

  it("does not label future unsupported action or cost kinds free", () => {
    for (const effect of [{ actions: [{ kind: "FutureAction" }] }, { cost: { kind: "futureCost" } }]) {
      expect(getProjectedCost(JSON.parse(JSON.stringify(effect)))).toEqual({ minimum: 0, maximum: null });
    }
  });

  it("keeps paid reveal dispositions and borrowed Option payloads unknown", () => {
    for (const slot of [
      { to: "play", costDelta: 3 },
      { to: "useOption" },
      { to: "useOption", payCost: false },
      { to: "hand", orDispositions: [{ to: "useOption" }] },
      { to: "hand", costDelta: 3, orDispositions: [{ to: "play" }] },
    ]) {
      const effect = JSON.parse(
        JSON.stringify({ actions: [{ kind: "RevealAdd", add: [{ filter: {}, count: 1, ...slot }] }] }),
      );
      expect(getProjectedCost(effect).maximum).toBeNull();
    }
    expect(
      getProjectedCost({
        actions: [{ kind: "RevealAdd", revealCount: 3, add: [{ filter: {}, count: 1, to: "play" }], rest: "trash" }],
      }),
    ).toEqual({ minimum: 0, maximum: 0 });
  });

  it("bounds recursive or very large records without executing effects", () => {
    const action = JSON.parse('{"kind":"CostGatedBlock","cost":{"kind":"payMemory","memory":1},"actions":[]}');
    action.actions.push(action);
    expect(getProjectedCost({ actions: [action] }).maximum).toBeNull();
    expect(
      getProjectedCost({
        actions: Array.from({ length: 300 }, () => ({ kind: "Draw", controller: "mine", amount: 1 })),
      }).maximum,
    ).toBeNull();
  });

  it("does not expose nonfinite cost features", () => {
    expect(getProjectedCost({ cost: { kind: "payMemory", memory: Infinity } })).toEqual({ minimum: 0, maximum: null });
    expect(Object.isFrozen(getProjectedCost({ actions: [] }))).toBe(true);
  });
});
