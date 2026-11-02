import { describe, expect, it } from "vitest";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import type { Intent } from "@aegis/shared/protocol/intents";
import type { Seat } from "@aegis/shared/schema/enums";
import { BotArm } from "#api/bot/experiment/BotArm";
import { createBotArmOptions } from "#api/bot/experiment/createBotArmOptions";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { createEvaluationPolicy, type BotPolicy } from "#api/bot/policy";
import { createProjectedEvaluationPolicy } from "#api/bot/projectedPolicy";
import { buildBotView } from "#api/bot/view";
import { trainingObservation } from "#api/bot/training/observation";
import { setupEngine } from "#api/engine/testkit/harness";
import type { GameEngine } from "#api/engine/GameEngine";

type Policy = BotPolicy<Intent | Promise<Intent>>;
type Factory = (engine: GameEngine, seat: Seat) => Policy;

const deck = { mainDeck: [], eggDeck: [] };
const factories: { name: string; create: Factory }[] = [
  { name: "legacy", create: () => createEvaluationPolicy({ seed: 42 }) },
  { name: "projected", create: (engine, seat) => createProjectedEvaluationPolicy({ engine, seat, seed: 42 }) },
  ...Object.values(BotArm).map((arm) => ({
    name: `experiment:${arm.value}`,
    create: (engine: GameEngine, seat: Seat) =>
      createBotArmOptions({
        engine,
        seat,
        deck,
        arm: arm.value,
        onFallback: () => {
          throw new Error("Fairness test must exercise the candidate without fallback");
        },
      })?.policy ?? createEvaluationPolicy({ seed: 42 }),
  })),
  ...Object.values(BotDifficulty).flatMap((difficulty) =>
    Object.values(BotStyle).map((style) => ({
      name: `${difficulty.value}:${style.value}`,
      create: (engine: GameEngine, seat: Seat) =>
        createLevelBotOptions({ engine, seat, deck, seed: 42, difficulty: difficulty.value, style: style.value })
          .policy!,
    })),
  ),
];

async function buildPosition({ seat, hiddenVariant }: { seat: Seat; hiddenVariant: boolean }) {
  const setup = setupEngine(
    {
      0: {
        hand: ["BT1-010", "BT1-015"],
        deck: ["BT1-010", "BT1-015"],
        security: ["BT1-010", "BT1-015"],
        battleArea: [{ card: "BT1-015", as: "first" }],
      },
      1: {
        hand: ["BT1-010", "BT1-015"],
        deck: ["BT1-010", "BT1-015"],
        security: ["BT1-010", "BT1-015"],
        battleArea: [{ card: "BT1-015", as: "second" }],
      },
    },
    { fixtureIds: true },
  );
  setup.state.turnSeat = seat;
  setup.state.memory = 4;
  setup.state.turnCount = 3;
  for (const player of setup.state.players) {
    for (const card of [...player.hand, ...player.deck, ...player.security]) {
      card.faceUp = false;
    }
  }
  if (hiddenVariant) {
    const opponent = setup.state.players[1 - seat]!;
    for (const card of opponent.hand) {
      card.cardId = "BT1-084";
    }
    for (const card of opponent.security) {
      card.cardId = "BT1-025";
    }
    opponent.deck.reverse();
  }
  await setup.ready();
  return setup;
}

async function collectAnswers({ engine, seat, create }: { engine: GameEngine; seat: Seat; create: Factory }) {
  const policy = create(engine, seat);
  policy.onTurnStart();
  const view = buildBotView(engine.state, seat);
  if (view === undefined) {
    throw new Error("Fairness position must have both players seated");
  }
  const own = view.board[0]!;
  const enemy = view.opponentBoard[0]!;
  return {
    main: await policy.chooseMainAction(view),
    breeding: await policy.chooseBreedingAction(view),
    block: await policy.chooseBlockResponse(view, {
      attackerPermanentId: enemy.permanentId,
      eligibleBlockerIds: [own.permanentId],
      mustBlock: false,
      targetsPlayer: true,
    }),
    counter: await policy.chooseCounterResponse(view, {
      kind: "counterWindowOpened",
      attackerPermanentId: enemy.permanentId,
      defendingSeat: seat,
      eligibleCounters: [{ instanceId: view.hand[0]!.instanceId, effectKey: "fair-counter", description: "Draw 1" }],
    }),
    alliance: await policy.chooseAllianceResponse(view, {
      kind: "alliancePrompt",
      permanentId: own.permanentId,
      eligibleAllyIds: [],
    }),
    evade: await policy.chooseEvadeResponse(view, own.permanentId),
    barrier: await policy.chooseBarrierResponse(view, own.permanentId),
    effect: await policy.answerDecision(view, {
      decisionId: "fair-removal",
      seat,
      kind: "chooseTargets",
      options: { candidateInstanceIds: [enemy.permanentId], min: 1, max: 1 },
      promptText: "Delete 1 of your opponent's Digimon",
    }),
    option: await policy.answerDecision(view, {
      decisionId: "fair-option",
      seat,
      kind: "chooseOption",
      options: { choices: ["Draw 1", "Gain 1 memory"] },
      promptText: "Choose one",
    }),
  };
}

describe("live policies cannot distinguish opponent hidden cards", () => {
  for (const factory of factories) {
    it.each([0, 1] as const)(`${factory.name} preserves every answer for seat %i`, async (seat) => {
      const original = await buildPosition({ seat, hiddenVariant: false });
      const counterfactual = await buildPosition({ seat, hiddenVariant: true });
      expect(original.state.players[1 - seat]!.hand[0]!.cardId).not.toBe(
        counterfactual.state.players[1 - seat]!.hand[0]!.cardId,
      );
      expect(buildBotView(original.state, seat)).toEqual(buildBotView(counterfactual.state, seat));
      expect(trainingObservation(original.state, seat)).toEqual(trainingObservation(counterfactual.state, seat));
      expect(await collectAnswers({ engine: original.engine, seat, create: factory.create })).toEqual(
        await collectAnswers({ engine: counterfactual.engine, seat, create: factory.create }),
      );
    });
  }

  it("detects a deliberately injected opponent-hand reader", async () => {
    const original = await buildPosition({ seat: 0, hiddenVariant: false });
    const counterfactual = await buildPosition({ seat: 0, hiddenVariant: true });
    const create: Factory = (engine, seat) => ({
      ...createEvaluationPolicy({ seed: 42 }),
      chooseMainAction: () =>
        engine.state.players[1 - seat]!.hand[0]!.cardId === "BT1-010" ? { type: "endPhase" } : { type: "hatchEgg" },
    });
    expect(await collectAnswers({ engine: original.engine, seat: 0, create })).not.toEqual(
      await collectAnswers({ engine: counterfactual.engine, seat: 0, create }),
    );
  });
});
