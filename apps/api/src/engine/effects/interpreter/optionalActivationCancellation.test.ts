import { OptionalActivationCancelled } from "#api/engine/effects/OptionalActivationCancelled";
import { describe, expect, it, vi } from "vitest";
import { EffectTiming, type CardEffect, type DecisionResponse } from "@aegis/shared";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { internalsOf } from "#api/engine/testkit/internals";
import { irCardModule } from "#api/engine/effects/interpreter/registration/module";
import { resolveTiming, type ResolutionEnv } from "#api/engine/effects/stack";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import "../../../cards/index.js";

type Params = { effect?: CardEffect; seededSelections?: boolean; targetCount?: number };

async function prepareOptionalActivation({ effect, seededSelections = false, targetCount = 2 }: Params = {}) {
  const scenario = setupEngine({
    0: { battleArea: [{ card: "ST1-03", as: "source" }], deck: ["ST1-03"] },
    1: {
      battleArea: [
        { card: "ST1-03", as: "first" },
        { card: "ST1-03", as: "second" },
      ],
    },
  });
  await scenario.ready();
  const engine = internalsOf(scenario.engine);
  const source = engine.cardSourceOf(scenario.perm("source").topCard);
  const definition: CardEffect = effect ?? {
    trigger: "OnPlay",
    optional: true,
    frequency: "OncePerTurn",
    actions: [
      { kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: targetCount } },
      { kind: "GainMemory", controller: "mine", amount: 3 },
    ],
  };
  const module = irCardModule(source.cardId, { effects: [definition], coverage: "full", residual: [] });
  const runtime = module.effectsForTiming(EffectTiming.OnPlay, source)[0]!;
  let context: EffectContext;
  const activating = vi.fn<() => void>();
  const environment: ResolutionEnv = {
    turnSeat: 0,
    tracker: engine.tracker,
    collect: () => [{ source, effect: runtime }],
    makeContext: () => {
      context = engine.buildEffectContext(source, {});
      if (seededSelections) {
        context.selections = new Map();
      }
      return context;
    },
    ruleProcess: async () => {},
    isGameOver: () => false,
    chooseOrder: async () => 0,
    askOptional: async () => context.ask.optional(context, "Activate optional effect?"),
    onActivating: activating,
  };
  function respond(
    response: DecisionResponse,
    seat: 0 | 1 = 0,
    decisionId = scenario.state.pendingDecision!.decisionId,
  ) {
    return scenario.engine.applyIntent(seat, { type: "respondDecision", decisionId, response });
  }
  function getRequest() {
    return scenario.decisions.at(-1)!.req;
  }
  return {
    scenario,
    engine,
    source,
    runtime,
    activating,
    respond,
    getRequest,
    start: () => resolveTiming(EffectTiming.OnPlay, environment),
  };
}

describe("optional activation cancellation before public targets commit", () => {
  it.each([false, true])(
    "cancels after Yes without spending OPT or running later processing (seeded selections: %s)",
    async (seededSelections) => {
      const game = await prepareOptionalActivation({ seededSelections });
      const memory = game.scenario.state.memory;
      const resolving = game.start();
      await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
      expect(game.respond({ kind: "optional", accept: true }).ok).toBe(true);
      await settle(() => game.scenario.state.pendingDecision?.kind === "chooseTargets");
      expect(game.getRequest().options).toMatchObject({ min: 2, max: 2, canCancelActivation: true });
      expect(game.activating).not.toHaveBeenCalled();
      const first = game.scenario.perm("first").permanentId;
      expect(game.respond({ kind: "chooseTargets", instanceIds: [first] }).ok).toBe(false);
      expect(game.respond({ kind: "chooseTargets", instanceIds: [] }, 1).ok).toBe(false);
      expect(game.respond({ kind: "chooseTargets", instanceIds: [] }, 0, "stale").ok).toBe(false);
      expect(game.respond({ kind: "chooseTargets", instanceIds: [] }).ok).toBe(true);
      await resolving;
      expect(game.scenario.perm("first").isSuspended).toBe(false);
      expect(game.scenario.perm("second").isSuspended).toBe(false);
      expect(game.scenario.state.memory).toBe(memory);
      expect(game.engine.tracker.count(game.source.instanceId, game.runtime.effectKey)).toBe(0);
      expect(game.activating).not.toHaveBeenCalled();
      const offeredAgain = game.start();
      await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
      game.respond({ kind: "optional", accept: false });
      await offeredAgain;
    },
  );

  it("commits the chosen targets, announces once and consumes OPT before later processing", async () => {
    const game = await prepareOptionalActivation();
    const memory = game.scenario.state.memory;
    const resolving = game.start();
    await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
    game.respond({ kind: "optional", accept: true });
    await settle(() => game.scenario.state.pendingDecision?.kind === "chooseTargets");
    game.respond({
      kind: "chooseTargets",
      instanceIds: [game.scenario.perm("first").permanentId, game.scenario.perm("second").permanentId],
    });
    await resolving;
    expect(game.scenario.perm("first").isSuspended).toBe(true);
    expect(game.scenario.perm("second").isSuspended).toBe(true);
    expect(game.scenario.state.memory).toBe(memory + 3);
    expect(game.engine.tracker.count(game.source.instanceId, game.runtime.effectKey)).toBe(1);
    expect(game.activating).toHaveBeenCalledTimes(1);
  });

  it("keeps a sole legal target open for confirmation instead of automatically committing it", async () => {
    const game = await prepareOptionalActivation({ targetCount: 2 });
    game.scenario.state.players[1]!.battleArea.splice(1, 1);
    const resolving = game.start();
    await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
    game.respond({ kind: "optional", accept: true });
    await settle(() => game.scenario.state.pendingDecision?.kind === "chooseTargets");
    expect(game.getRequest().options).toMatchObject({ min: 1, max: 1, canCancelActivation: true });
    game.respond({ kind: "chooseTargets", instanceIds: [] });
    await resolving;
    expect(game.scenario.perm("first").isSuspended).toBe(false);
  });

  it.each(["payment", "draw"] as const)("does not offer cancellation after a committed %s", async (boundary) => {
    const effect: CardEffect = {
      trigger: "OnPlay",
      optional: true,
      ...(boundary === "payment" ? { cost: { kind: "payMemory" as const, memory: 1 } } : {}),
      actions: [
        ...(boundary === "draw" ? [{ kind: "Draw" as const, controller: "mine" as const, amount: 1 }] : []),
        { kind: "Suspend", target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 } },
      ],
    };
    const game = await prepareOptionalActivation({ effect });
    const resolving = game.start();
    await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
    game.respond({ kind: "optional", accept: true });
    await settle(() => game.scenario.state.pendingDecision?.kind === "chooseTargets");
    expect(game.getRequest().options?.canCancelActivation).not.toBe(true);
    expect(game.respond({ kind: "chooseTargets", instanceIds: [] }).ok).toBe(false);
    game.respond({ kind: "chooseTargets", instanceIds: [game.scenario.perm("first").permanentId] });
    await resolving;
    expect(game.scenario.perm("first").isSuspended).toBe(true);
  });
});

it("preserves mandatory later processing when only the first action is optional", async () => {
  const game = await prepareOptionalActivation({
    effect: {
      trigger: "OnPlay",
      actions: [
        {
          kind: "Suspend",
          optional: true,
          target: { filter: { controller: "opponent", kind: ["Digimon"] }, count: 1 },
        },
        { kind: "GainMemory", controller: "mine", amount: 3 },
      ],
    },
  });
  const memory = game.scenario.state.memory;
  const resolving = game.start();
  await settle(() => game.scenario.state.pendingDecision?.kind === "chooseTargets");
  expect(game.getRequest().options?.canCancelActivation).not.toBe(true);
  game.respond({ kind: "chooseTargets", instanceIds: [] });
  await resolving;
  expect(game.scenario.state.memory).toBe(memory + 3);
});

it("does not swallow a cancellation receipt from a different activation", async () => {
  const game = await prepareOptionalActivation();
  const foreign = new OptionalActivationCancelled({ activation: { available: true } });
  vi.spyOn(game.scenario.engine.decisionApi, "chooseTargets").mockRejectedValue(foreign);
  const resolving = game.start();
  const rejected = resolving.catch((error: unknown) => error);
  await settle(() => game.scenario.state.pendingDecision?.kind === "optional");
  game.respond({ kind: "optional", accept: true });
  expect(await rejected).toBe(foreign);
});
