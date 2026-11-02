import { describe, expect, it } from "vitest";
import {
  buildTriggerKey,
  EffectTiming,
  GameState,
  PlayerState,
  type DecisionRequest,
  type DecisionResponse,
  type Seat,
} from "@aegis/shared";
import { DecisionManager, type DecisionTransport } from "./index.js";
import { createDecisionApi } from "./decisionApi.js";
import { createResolverDecisions } from "./resolverDecisions.js";
import { ResolutionPlan } from "./resolutionPlan.js";
import { resolveTiming, type ResolutionEnv } from "../effects/stack.js";
import { UseTracker } from "../effects/kernel.js";
import type { CardSource } from "../effects/CardSource.js";
import type { CollectedEffect } from "../effects/collect.js";
import type { Effect } from "../effects/Effect.js";
import type { EffectContext } from "../effects/EffectContext.js";

function gameWithSeats(): GameState {
  const game = new GameState();
  for (const seat of [0, 1] as Seat[]) {
    const player = new PlayerState();
    player.seat = seat;
    game.players.push(player);
  }
  return game;
}

function pending(
  name: string,
  opts: { optional?: boolean; description?: string; resolve?: (ctx: EffectContext) => Promise<void> } = {},
): CollectedEffect {
  const source = {
    instanceId: name,
    cardId: name,
    ownerSeat: 0 as Seat,
    definition: {} as CardSource["definition"],
    permanent: () => undefined,
    isOnBattleArea: () => true,
    isOwnersTurn: () => true,
    hasColor: () => false,
  } satisfies CardSource;
  const effect: Effect = {
    effectKey: name,
    description: opts.description ?? name,
    optional: opts.optional ?? false,
    isInherited: false,
    isSecurity: false,
    isLinked: false,
    maxPerTurn: 1,
    canTrigger: () => true,
    canActivate: () => true,
    resolve: opts.resolve ?? (async () => {}),
  };
  return { source, effect };
}

const key = (name: string): string => buildTriggerKey(name, name);

/** A seat that answers every decision from a script and records what it was asked. */
function scriptedSeat(answer: (request: DecisionRequest) => DecisionResponse) {
  const requests: DecisionRequest[] = [];
  let manager: DecisionManager | undefined;
  const transport: DecisionTransport = {
    requestDecision: (seat, request) => {
      requests.push(request);
      queueMicrotask(() => manager?.respond(seat, request.decisionId, answer(request)));
    },
  };
  manager = new DecisionManager(gameWithSeats(), transport);
  return { manager, requests };
}

function envFor(
  manager: DecisionManager,
  collect: () => CollectedEffect[],
): { env: ResolutionEnv; resolved: string[] } {
  const resolved: string[] = [];
  const tracker = new UseTracker();
  const decisions = createResolverDecisions(manager);
  const ask = createDecisionApi(manager);
  const env: ResolutionEnv = {
    turnSeat: 0,
    tracker,
    collect,
    makeContext: (c) => ({ source: c.source, trigger: {}, game: {}, fx: {}, ask }) as never,
    ruleProcess: async () => {},
    isGameOver: () => false,
    chooseOrder: (seat, active, timing, plan) => decisions.chooseOrder(seat, active, timing, plan),
    askOptional: (seat, collected, plan) => decisions.askOptional(seat, collected, plan),
    onResolved: (_timing, collected) => resolved.push(collected.effect.effectKey),
  };
  return { env, resolved };
}

describe("ResolutionPlan", () => {
  it("keeps reconstructed occurrence keys stable and gives later occurrences fresh unanswered keys", () => {
    const plan = new ResolutionPlan();
    const effect = pending("repeat");
    const first = { ...effect, activationIdentity: {} };
    const second = { ...effect, activationIdentity: {} };
    const firstKey = plan.keyFor(first);
    const secondKey = plan.keyFor(second);
    expect(secondKey).not.toBe(firstKey);
    plan.adopt([secondKey, firstKey], { [firstKey]: false, [secondKey]: true });
    expect(plan.keyFor({ ...second })).toBe(secondKey);
    expect(plan.nextOf([secondKey])).toBe(secondKey);
    expect(plan.presetFor(plan.keyFor({ ...second }))).toBe(true);
    const laterKey = plan.keyFor({ ...effect, activationIdentity: {} });
    expect([firstKey, secondKey]).not.toContain(laterKey);
    expect(plan.presetFor(laterKey)).toBeUndefined();
    expect(plan.nextOf([secondKey, laterKey])).toBeUndefined();
    expect(new ResolutionPlan().presetFor(firstKey)).toBeUndefined();
  });
  it("answers only while every offered key has a planned position", () => {
    const plan = new ResolutionPlan();
    plan.adopt(["b", "a"]);

    expect(plan.nextOf(["a", "b"])).toBe("b");
    expect(plan.nextOf(["a"])).toBe("a");
    expect(plan.nextOf(["a", "c"])).toBeUndefined();
  });

  it("keeps answering from an ordered prefix until it runs out or a new key appears", () => {
    const plan = new ResolutionPlan();
    plan.adopt(["c", "b"], {}, ["a", "b", "c", "d"]);

    expect(plan.nextOf(["a", "b", "c", "d"])).toBe("c");
    expect(plan.nextOf(["a", "b", "d"])).toBe("b");
    expect(plan.nextOf(["a", "d"])).toBeUndefined();
    expect(plan.nextOf(["a", "b", "e"])).toBeUndefined();
  });

  it("moves a newer answer to the front and keeps the earlier plan for the rest", () => {
    const plan = new ResolutionPlan();
    plan.adopt(["a", "b"], { a: true });
    plan.adopt(["c"], { c: false });

    expect(plan.nextOf(["a", "b", "c"])).toBe("c");
    expect(plan.presetFor("a")).toBe(true);
    expect(plan.presetFor("c")).toBe(false);
    expect(plan.presetFor("b")).toBeUndefined();
  });
});

describe("resolution plan through the stack resolver", () => {
  it("does not bypass a shared once-per-turn limit for distinct occurrences", async () => {
    const effect = pending("once", { optional: true });
    const effects = [
      { ...effect, activationIdentity: {} },
      { ...effect, activationIdentity: {} },
    ];
    const { manager, requests } = scriptedSeat((request) => {
      const keys = request.options!.triggerKeys!;
      return {
        kind: "orderTriggers",
        order: [...keys],
        optionalAnswers: Object.fromEntries(keys.map((entryKey) => [entryKey, true])),
      };
    });
    const { env, resolved } = envFor(manager, () => effects.map((item) => ({ ...item })));
    await resolveTiming(EffectTiming.OnDeletion, env);
    expect(resolved).toEqual(["once"]);
    expect(requests).toHaveLength(1);
  });
  it("resolves three occurrences middle-first with independent presets across re-collection", async () => {
    const answers: [number, boolean][] = [];
    const effects = [0, 1, 2].map((index) => {
      const collected = pending("repeat", {
        description: "You may draw 1.",
        resolve: async (ctx) => {
          answers.push([index, await ctx.ask.optional(ctx, "Draw 1?")]);
        },
      });
      collected.effect.maxPerTurn = -1;
      return { ...collected, activationIdentity: {} };
    });
    const { manager, requests } = scriptedSeat((request) => {
      if (request.kind === "optional") return { kind: "optional", accept: true };
      const [first, second, third] = request.options!.triggerKeys!;
      return {
        kind: "orderTriggers",
        order: [second!, first!, third!],
        optionalAnswers: { [first!]: true, [second!]: false, [third!]: true },
      };
    });
    const { env } = envFor(manager, () => effects.map((effect) => ({ ...effect })));
    await resolveTiming(EffectTiming.OnDeletion, env);
    expect(answers).toEqual([
      [1, false],
      [0, true],
      [2, true],
    ]);
    expect(requests.map((request) => request.kind)).toEqual(["orderTriggers"]);
  });
  it("resolves a fully ordered window from one prompt and applies yes/no presets", async () => {
    let bodyAnswer: boolean | undefined;
    const effects = [
      pending("mandatory"),
      pending("optional-effect", { optional: true }),
      pending("asks-in-body", {
        description: "You may draw 1.",
        resolve: async (ctx) => {
          bodyAnswer = await ctx.ask.optional(ctx, "Draw 1?");
        },
      }),
    ];
    const { manager, requests } = scriptedSeat(() => ({
      kind: "orderTriggers",
      order: [key("asks-in-body"), key("optional-effect"), key("mandatory")],
      optionalAnswers: { [key("asks-in-body")]: true, [key("optional-effect")]: false },
    }));
    const { env, resolved } = envFor(manager, () => effects);

    await resolveTiming(EffectTiming.OnDeletion, env);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.options).toMatchObject({
      acceptsResolutionPlan: true,
      triggerIsOptional: [false, true, true],
    });
    expect(bodyAnswer).toBe(true);
    expect(resolved).toEqual(["asks-in-body", "mandatory"]);
  });

  it("asks again when the offered effects include one the plan does not order", async () => {
    const effects = [pending("first"), pending("second"), pending("third")];
    const { manager, requests } = scriptedSeat((request) => ({
      kind: "orderTriggers",
      order: requests.length === 1 ? [key("second")] : [...(request.options?.triggerKeys ?? [])].reverse(),
    }));
    const { env, resolved } = envFor(manager, () => effects);

    await resolveTiming(EffectTiming.OnDeletion, env);

    expect(requests.map((request) => request.options?.triggerKeys)).toEqual([
      [key("first"), key("second"), key("third")],
      [key("first"), key("third")],
    ]);
    expect(resolved).toEqual(["second", "third", "first"]);
  });

  it("resolves a partially ordered window in that order before asking about the rest", async () => {
    const effects = [pending("first"), pending("second"), pending("third"), pending("fourth")];
    const { manager, requests } = scriptedSeat((request) => ({
      kind: "orderTriggers",
      order: requests.length === 1 ? [key("third"), key("second")] : [...(request.options?.triggerKeys ?? [])],
    }));
    const { env, resolved } = envFor(manager, () => effects);

    await resolveTiming(EffectTiming.OnDeletion, env);

    expect(requests.map((request) => request.options?.triggerKeys)).toEqual([
      [key("first"), key("second"), key("third"), key("fourth")],
      [key("first"), key("fourth")],
    ]);
    expect(resolved).toEqual(["third", "second", "first", "fourth"]);
  });

  it("asks yes/no questions for effects the controller left on Ask", async () => {
    const effects = [pending("left-on-ask", { optional: true }), pending("other")];
    const { manager, requests } = scriptedSeat((request) =>
      request.kind === "optional"
        ? { kind: "optional", accept: true }
        : { kind: "orderTriggers", order: [key("left-on-ask"), key("other")] },
    );
    const { env, resolved } = envFor(manager, () => effects);

    await resolveTiming(EffectTiming.OnDeletion, env);

    expect(requests.map((request) => request.kind)).toEqual(["orderTriggers", "optional"]);
    expect(resolved).toEqual(["left-on-ask", "other"]);
  });
});

describe("DecisionManager resolution plan validation", () => {
  async function respondTo(options: DecisionRequest["options"], response: DecisionResponse): Promise<boolean> {
    let accepted = false;
    let manager: DecisionManager | undefined;
    const transport: DecisionTransport = {
      requestDecision: (seat, request) => {
        queueMicrotask(() => {
          accepted = manager!.respond(seat, request.decisionId, response);
          manager!.cancel();
        });
      },
    };
    manager = new DecisionManager(gameWithSeats(), transport);
    await manager.request({ seat: 0, kind: "orderTriggers", promptText: "order", options });
    return accepted;
  }

  const offered = { triggerKeys: ["a", "b", "c"] };
  const plannable = { ...offered, acceptsResolutionPlan: true };

  it("keeps plain prompts at exactly one key", async () => {
    expect(await respondTo(offered, { kind: "orderTriggers", order: ["a"] })).toBe(true);
    expect(await respondTo(offered, { kind: "orderTriggers", order: ["a", "b"] })).toBe(false);
    expect(await respondTo(offered, { kind: "orderTriggers", order: ["a"], optionalAnswers: { a: true } })).toBe(false);
  });

  it("accepts a partial or full plan of offered keys", async () => {
    expect(await respondTo(plannable, { kind: "orderTriggers", order: ["c", "a"] })).toBe(true);
    expect(
      await respondTo(plannable, { kind: "orderTriggers", order: ["c", "a", "b"], optionalAnswers: { b: false } }),
    ).toBe(true);
  });

  it("accepts indexed plans only when the pending decision advertises support", async () => {
    const response: DecisionResponse = {
      kind: "orderTriggers",
      order: [],
      orderIndexes: [2, 0],
      optionalAnswersByIndex: [false, null, true],
    };
    expect(await respondTo(plannable, response)).toBe(false);
    expect(await respondTo({ ...plannable, acceptsIndexedResolutionPlan: true }, response)).toBe(true);
    expect(await respondTo({ ...offered, acceptsIndexedResolutionPlan: true }, response)).toBe(false);
  });

  it("keeps an invalid indexed answer pending and resolves a valid answer to named keys", async () => {
    const state = gameWithSeats();
    const manager = new DecisionManager(state, { requestDecision: () => {} });
    const pending = manager.request({
      seat: 0,
      kind: "orderTriggers",
      promptText: "order",
      options: { ...plannable, acceptsIndexedResolutionPlan: true },
    });
    const decisionId = state.pendingDecision!.decisionId;
    expect(manager.respond(0, decisionId, { kind: "orderTriggers", order: [], orderIndexes: [3] })).toBe(false);
    expect(state.pendingDecision?.decisionId).toBe(decisionId);
    expect(
      manager.respond(0, decisionId, {
        kind: "orderTriggers",
        order: [],
        orderIndexes: [2, 0],
        optionalAnswersByIndex: [false, null, true],
      }),
    ).toBe(true);
    expect(await pending).toEqual({ kind: "orderTriggers", order: ["c", "a"], optionalAnswers: { a: false, c: true } });
  });

  it("rejects repeated, unknown, or malformed plan entries", async () => {
    expect(await respondTo(plannable, { kind: "orderTriggers", order: ["a", "a"] })).toBe(false);
    expect(await respondTo(plannable, { kind: "orderTriggers", order: ["a", "z"] })).toBe(false);
    expect(await respondTo(plannable, { kind: "orderTriggers", order: [] })).toBe(false);
    expect(await respondTo(plannable, { kind: "orderTriggers", order: ["a"], optionalAnswers: { z: true } })).toBe(
      false,
    );
    expect(
      await respondTo(plannable, {
        kind: "orderTriggers",
        order: ["a"],
        optionalAnswers: { a: "yes" } as unknown as Record<string, boolean>,
      }),
    ).toBe(false);
  });
});
