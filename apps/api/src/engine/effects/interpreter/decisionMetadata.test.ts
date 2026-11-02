import { describe, expect, it } from "vitest";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { CardEffect } from "@aegis/shared/effects/ir/card";
import { EffectTiming } from "@aegis/shared/schema/enums";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { registerIrCard } from "#api/engine/effects/interpreter/registration/module";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import "#api/cards/BT1/BT1-009";

interface WithEffectsParams {
  effects: CardEffect[];
  run: () => Promise<void>;
}

async function runWithEffects({ effects, run }: WithEffectsParams): Promise<void> {
  const original = runtimeCompiledCard("BT1-009");
  if (original === undefined) {
    throw new Error("Expected the registered source card");
  }
  registerIrCard("BT1-009", { effects, coverage: "full", residual: [] });
  try {
    await run();
  } finally {
    registerIrCard("BT1-009", original);
  }
}

function prepareSource() {
  return setupEngine(
    {
      0: {
        battleArea: [{ card: "BT1-009", as: "source" }],
        hand: ["BT1-012", "BT1-012"],
        trash: ["BT1-012", "BT1-013"],
        deck: ["BT1-010", "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
      },
    },
    { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true },
  );
}

describe("structured metadata on resolving decisions", () => {
  it("aligns filtered modal options with their summaries and a null decline", async () => {
    const action: Action = {
      kind: "Modal",
      choose: 1,
      optional: true,
      labels: ["Unavailable", "Memory", "Draw"],
      options: [
        [{ kind: "RawUnparsed", text: "unavailable" }],
        [{ kind: "GainMemory", amount: 2 }],
        [{ kind: "Draw", controller: "mine", amount: 1 }],
      ],
    };
    await runWithEffects({
      effects: [{ trigger: "OnPlay", actions: [action] }],
      run: async () => {
        const setup = prepareSource();
        setup.state.memory = 3;
        await advance(setup.engine).fire(EffectTiming.OnPlay, setup.perm("source"));
        const request = setup.decisions.find(({ req }) => req.kind === "chooseOption")!.req;
        expect(request.options!.choices).toEqual(["Memory", "Draw", "Don't use"]);
        expect(request.options!.choiceSummaries).toMatchObject([
          { memoryGain: 2, cardsDrawn: 0 },
          { memoryGain: 0, cardsDrawn: 1 },
          null,
        ]);
        expect(request.options!.effectControllerSeat).toBe(0);
        expect(setup.state.memory).toBe(5);
      },
    });
  });

  it("keeps payment purpose separate from subsequent retrieval and restores nested context", async () => {
    const actions: Action[] = [
      {
        kind: "Draw",
        controller: "mine",
        amount: 1,
        cost: { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } },
      },
      {
        kind: "Return",
        to: "hand",
        from: ["trash"],
        target: { filter: { controller: "mine", zone: "trash" }, count: 1 },
      },
    ];
    await runWithEffects({
      effects: [{ trigger: "OnPlay", actions }],
      run: async () => {
        const setup = prepareSource();
        await advance(setup.engine).fire(EffectTiming.OnPlay, setup.perm("source"));
        const requests = setup.decisions.filter(({ req }) => req.kind === "selectCards").map(({ req }) => req);
        expect(requests.some((request) => request.options?.purpose === "cost")).toBe(true);
        const retrieval = requests.find(
          (request) => request.options?.selectionGoal === DecisionSelectionGoal.GAIN.value,
        )!;
        expect(retrieval).toBeDefined();
        expect(retrieval.options?.singleHandCostBenefit).toBeUndefined();
        expect(retrieval.options?.purpose).toBeUndefined();
        expect(setup.state.players[0]!.hand).toHaveLength(3);
        expect(setup.state.players[0]!.trash).toHaveLength(2);
      },
    });
  });

  it("labels each reveal slot independently while preserving its actual destination", async () => {
    const action: Action = {
      kind: "RevealAdd",
      revealCount: 2,
      add: [
        { filter: {}, count: 1, to: "hand" },
        { filter: {}, count: 1, to: "play" },
      ],
      rest: "trash",
    };
    await runWithEffects({
      effects: [{ trigger: "OnPlay", actions: [action] }],
      run: async () => {
        const setup = prepareSource();
        const beforeHand = setup.state.players[0]!.hand.length;
        await advance(setup.engine).fire(EffectTiming.OnPlay, setup.perm("source"));
        const goals = setup.decisions
          .filter(({ req }) => req.kind === "selectCards")
          .map(({ req }) => req.options?.selectionGoal);
        expect(goals).toEqual([DecisionSelectionGoal.GAIN.value, DecisionSelectionGoal.PLAY.value]);
        expect(setup.state.players[0]!.hand).toHaveLength(beforeHand + 1);
        expect(setup.state.players[0]!.battleArea).toHaveLength(2);
      },
    });
  });

  it("carries watcher body summaries and future payments onto simultaneously pending triggers", async () => {
    const actions: Action[] = [
      { kind: "SubTrigger", event: "whenPlayed", actions: [{ kind: "GainMemory", amount: 2 }] },
      {
        kind: "SubTrigger",
        event: "whenPlayed",
        cost: { kind: "payMemory", memory: 1 },
        actions: [{ kind: "Draw", controller: "mine", amount: 1 }],
      },
    ];
    await runWithEffects({
      effects: [{ trigger: "AllTurns", actions }],
      run: async () => {
        const setup = prepareSource();
        setup.state.memory = 10;
        await setup.ready();
        const card = setup.state.players[0]!.hand[0]!;
        expect(setup.engine.applyIntent(0, { type: "playCard", instanceId: card.instanceId })).toEqual({ ok: true });
        await settle();
        const request = setup.decisions.find(({ req }) => req.kind === "orderTriggers")!.req;
        expect(new Set(request.options!.triggerKeys).size).toBe(2);
        expect(request.options!.triggerSummaries).toMatchObject([
          { memoryGain: 2, cardsDrawn: 0 },
          { memoryGain: 0, cardsDrawn: 1, memoryCost: { maximum: 1 } },
        ]);
        expect(request.options!.triggerControllerSeats).toEqual([0, 0]);
        expect(setup.state.memory).toBe(8);
      },
    });
  });

  it("publishes the gated resources while paying a whole-clause hand cost", async () => {
    await runWithEffects({
      effects: [
        {
          trigger: "OnPlay",
          optional: true,
          cost: { kind: "trash", target: { filter: { controller: "mine", zone: "hand" }, count: 1 } },
          actions: [{ kind: "Draw", controller: "mine", amount: 2 }],
        },
      ],
      run: async () => {
        const setup = prepareSource();
        await advance(setup.engine).fire(EffectTiming.OnPlay, setup.perm("source"));
        const request = setup.decisions.find(({ req }) => req.options?.purpose === "cost")!.req;
        expect(request.options).toMatchObject({
          min: 0,
          max: 1,
          effectControllerSeat: 0,
          singleHandCostBenefit: { cardsDrawn: 2, memoryGain: 0, cardsRecovered: 0 },
          effectSummary: { cardsDrawn: 2, memoryCost: { maximum: 0 } },
        });
        expect(setup.state.players[0]!.hand).toHaveLength(3);
        expect(setup.state.players[0]!.trash).toHaveLength(3);
      },
    });
  });

  it("uses the later action benefit for its preselected cost and clears it for retrieval", async () => {
    await runWithEffects({
      effects: [
        {
          trigger: "OnPlay",
          actions: [
            { kind: "Draw", controller: "mine", amount: 1 },
            {
              kind: "Draw",
              controller: "mine",
              amount: 2,
              optional: true,
              cost: {
                kind: "trash",
                raw: "By trashing 1 card",
                target: { filter: { controller: "mine", zone: "hand" }, count: 1 },
              },
            },
            {
              kind: "Return",
              to: "hand",
              from: ["trash"],
              target: { filter: { controller: "mine", zone: "trash" }, count: 1 },
            },
          ],
        },
      ],
      run: async () => {
        const setup = prepareSource();
        await advance(setup.engine).fire(EffectTiming.OnPlay, setup.perm("source"));
        const requests = setup.decisions.filter(({ req }) => req.kind === "selectCards").map(({ req }) => req);
        const cost = requests.find((request) => request.options?.purpose === "cost")!;
        const retrieval = requests.find(
          (request) => request.options?.selectionGoal === DecisionSelectionGoal.GAIN.value,
        )!;
        expect(cost.options).toMatchObject({
          min: 0,
          max: 1,
          singleHandCostBenefit: { cardsDrawn: 2, memoryGain: 0, cardsRecovered: 0 },
          effectSummary: { cardsDrawn: 2 },
        });
        expect(retrieval.options?.effectSummary).toMatchObject({ cardsDrawn: 0, cardsReturnedFromTrash: 1 });
        expect(retrieval.options?.singleHandCostBenefit).toBeUndefined();
        expect(retrieval.options?.purpose).toBeUndefined();
        expect(setup.state.players[0]!.hand).toHaveLength(5);
        expect(setup.state.players[0]!.trash).toHaveLength(2);
      },
    });
  });
});
