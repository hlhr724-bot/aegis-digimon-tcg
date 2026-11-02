import { expect, it } from "vitest";
import "#api/cards/index";
import { setupEngine } from "#api/engine/testkit/harness";
import { mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import { buildBotView } from "#api/bot/view";
import {
  actionCardId,
  actionFeatures,
  chooseHeuristic,
  parseHeuristic,
  scoreHeuristicRules,
} from "#api/bot/evolution/heuristic";
import { chooseFastHeuristic } from "#api/bot/evolution/chooseFastHeuristic";
import { scoreFastHeuristic } from "#api/bot/evolution/scoreFastHeuristic";
import { createResidualPolicy, SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";

const combo = {
  ...SEED_RESIDUAL,
  rules: [
    {
      feature: "playTamer",
      weight: 100,
      advice: "Establish Rina beside a suspended Ulforce.",
      when: {
        kind: "main",
        sourceCardIds: ["BT11-112"],
        ownBoard: { cardIds: ["BT11-032"], suspended: true, minimum: 1 },
        ownHand: { cardIds: ["BT11-112"], minimum: 1, maximum: 1 },
      },
    },
  ],
};

it.each([
  {},
  { cardIds: [] },
  { cardIds: ["unknown"], minimum: 1 },
  { cardIds: ["BT11-032"] },
  { cardIds: ["BT11-032"], minimum: -1 },
  { cardIds: ["BT11-032"], minimum: 1.5 },
  { cardIds: ["BT11-032"], maximum: 101 },
  { cardIds: ["BT11-032"], minimum: 2, maximum: 1 },
  { cardIds: ["BT11-032"], minimum: 1, suspended: "yes" },
  { cardIds: ["BT11-032"], minimum: 1, opponentHand: true },
])("rejects malformed owned-card count predicate %j", (ownBoard) => {
  expect(() => parseHeuristic({ ...combo, rules: [{ ...combo.rules[0], when: { ownBoard } }] })).toThrow(
    "owned-card predicate",
  );
});

it("rejects unknown conditions and hand suspension filters without changing legacy bytes", () => {
  expect(() => parseHeuristic({ ...combo, rules: [{ ...combo.rules[0], when: { hiddenDeck: [] } }] })).toThrow(
    "condition",
  );
  expect(() =>
    parseHeuristic({
      ...combo,
      rules: [{ ...combo.rules[0], when: { ownHand: { cardIds: ["BT11-112"], minimum: 1, suspended: false } } }],
    }),
  ).toThrow("owned-card predicate");
  expect(JSON.stringify(parseHeuristic(SEED_RESIDUAL))).toBe(JSON.stringify(SEED_RESIDUAL));
});

it.each([0, 1] as const)(
  "scores only seat %i's observed top board and exact hand cards across both interpreters",
  async (seat) => {
    const setup = setupEngine({
      0: { hand: ["BT11-112", "BT1-010"], battleArea: [{ card: "BT11-032", suspended: true }] },
      1: { hand: ["BT11-112", "BT1-010"], battleArea: [{ card: "BT11-032", suspended: true }] },
    });
    await setup.ready();
    const program = parseHeuristic(combo);
    const window = {
      observation: trainingObservation(setup.state, seat),
      kind: "main",
      selected: [],
      actions: [
        {
          intent: { type: "playCard" as const, instanceId: setup.state.players[seat]!.hand[0]!.instanceId },
          sourceId: setup.state.players[seat]!.hand[0]!.instanceId,
          label: "Play Rina",
        },
      ],
    };
    const features = actionFeatures(window, 0);
    const source = actionCardId(window, 0);
    expect(scoreHeuristicRules(program, features, "main", source, window.observation).score).toBe(100);
    expect(scoreFastHeuristic(program, features, "main", source, window.observation)).toBe(100);
    expect(scoreHeuristicRules(program, features, "main", source).score).toBe(0);
    expect(scoreFastHeuristic(program, features, "main", "BT1-010", window.observation)).toBe(0);
    const own = window.observation.players.find((player) => player.seat === seat)!;
    own.board[0]!.suspended = false;
    expect(scoreFastHeuristic(program, features, "main", source, window.observation)).toBe(0);
    const unit = own.board[0]!;
    own.breeding = { ...unit, suspended: true, inBreeding: true };
    own.board = [{ ...unit, top: { ...unit.top, cardId: "BT1-010" }, stack: [unit.top], suspended: true }];
    expect(scoreHeuristicRules(program, features, "main", source, window.observation).score).toBe(0);
    own.board = [];
    expect(scoreHeuristicRules(program, features, "main", source, window.observation).score).toBe(0);
    own.board = window.observation.players.find((player) => player.seat !== seat)!.board;
    own.hand = own.hand.filter((card) => card.cardId !== "BT11-112");
    expect(scoreFastHeuristic(program, features, "main", source, window.observation)).toBe(0);
  },
);

it("supplies actual observed combo context to residual main and reference/fast action selection", async () => {
  const setup = setupEngine({
    0: { hand: ["BT11-112", "BT1-010"], battleArea: [{ card: "BT11-032", suspended: true }] },
    1: { hand: ["BT11-112"] },
  });
  await setup.ready();
  const program = parseHeuristic(combo);
  const window = {
    observation: trainingObservation(setup.state, 0),
    kind: "main",
    selected: [],
    actions: mainActions(setup.engine, 0),
  };
  const index = chooseHeuristic(program, window, 71);
  expect(actionCardId(window, index)).toBe("BT11-112");
  expect(chooseFastHeuristic(program, window, 71)).toBe(index);
  const traces: { reasons: { value: number }[]; sourceCardId?: string }[] = [];
  const policy = createResidualPolicy({
    engine: setup.engine,
    seat: 0,
    seed: 71,
    program,
    onDecision: (trace) => traces.push(trace as (typeof traces)[number]),
  });
  const view = buildBotView(setup.state, 0)!;
  const base = createResidualPolicy({ engine: setup.engine, seat: 0, seed: 71, program: SEED_RESIDUAL });
  expect(policy.chooseBreedingAction(view)).toEqual(base.chooseBreedingAction(view));
  expect(policy.chooseMainAction(view)).toMatchObject({
    type: "playCard",
    instanceId: setup.state.players[0]!.hand[0]!.instanceId,
  });
  expect(traces).toMatchObject([{ sourceCardId: "BT11-112", reasons: [{ value: 100 }] }]);
});
