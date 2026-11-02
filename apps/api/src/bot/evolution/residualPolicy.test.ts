import { expect, it } from "vitest";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { buildBotView } from "../view.js";
import { createProjectedEvaluationPolicy } from "../projectedPolicy.js";
import { createResidualPolicy, SEED_RESIDUAL } from "./residualPolicy.js";
import { parseHeuristic } from "./heuristic.js";
import { Phase } from "@aegis/shared/schema/enums";
import "../../cards/index.js";

it.each([0, 1] as const)("deploys a rookie with an explicit breeding override in seat %s", async (seat) => {
  const setup = setupEngine({ [seat]: { breeding: { card: "BT1-010", as: "raising" }, hand: ["BT1-015"] } });
  await setup.ready();
  setup.state.turnSeat = seat;
  setup.state.phase = Phase.Breeding;
  setup.state.memory = seat === 0 ? 3 : -3;
  const candidate = createResidualPolicy({
    engine: setup.engine,
    seat,
    seed: 719,
    program: parseHeuristic({ ...SEED_RESIDUAL, breedingDeployLevel: 3 }),
  });
  const control = createResidualPolicy({ engine: setup.engine, seat, seed: 719, program: SEED_RESIDUAL });
  const view = buildBotView(setup.state, seat)!;
  expect(control.chooseBreedingAction(view)).toEqual({ type: "endPhase" });
  const intent = candidate.chooseBreedingAction(view);
  expect(intent).toEqual({ type: "moveFromBreeding", permanentId: setup.perm("raising").permanentId });
  expect(setup.engine.applyIntent(seat, intent)).toEqual({ ok: true });
  await settle(() => setup.state.players[seat]!.battleArea.some((unit) => unit.topCard.cardId === "BT1-010"));
  expect(setup.events.filter((event) => event.kind === "actionRejected")).toEqual([]);
});

it("starts with the identical seeded balanced actions and rejects unknown bases", async () => {
  const setup = setupEngine({ 0: { hand: ["BT1-010", "BT1-011"] } });
  await setup.ready();
  const view = buildBotView(setup.state, 0)!;
  for (const seed of [1, 2, 71, 7919]) {
    const base = createProjectedEvaluationPolicy({ engine: setup.engine, seat: 0, seed });
    const residual = createResidualPolicy({ engine: setup.engine, seat: 0, seed, program: SEED_RESIDUAL });
    expect(residual.chooseMainAction(view)).toEqual(base.chooseMainAction(view));
    expect(residual.chooseBreedingAction(view)).toEqual(base.chooseBreedingAction(view));
  }
  expect(parseHeuristic(SEED_RESIDUAL).basePolicy).toBe("projected-balanced");
  expect(() => parseHeuristic({ ...SEED_RESIDUAL, basePolicy: "unknown" })).toThrow("base policy");
});

it("applies a conditional learned preference and executes its authoritative action", async () => {
  const setup = setupEngine({ 0: { hand: [{ card: "BT1-010", as: "preferred" }, "BT1-011"] } });
  await setup.ready();
  const program = parseHeuristic({
    ...SEED_RESIDUAL,
    rules: [
      {
        feature: "bias",
        weight: 100,
        advice: "Develop this rookie when affordable.",
        when: { kind: "main", sourceCardIds: ["BT1-010"], maximum: { cost: 3 } },
      },
    ],
  });
  const traces: unknown[] = [];
  const policy = createResidualPolicy({
    engine: setup.engine,
    seat: 0,
    seed: 1,
    program,
    onDecision: (trace) => traces.push(trace),
  });
  const intent = policy.chooseMainAction(buildBotView(setup.state, 0)!);
  expect(intent).toMatchObject({ type: "playCard", instanceId: setup.inst("preferred").instanceId });
  expect(setup.engine.applyIntent(0, intent).ok).toBe(true);
  await settle(() => setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "BT1-010"));
  expect(setup.state.players[0]!.battleArea.some((unit) => unit.topCard.cardId === "BT1-010")).toBe(true);
  expect(traces).toMatchObject([{ sourceCardId: "BT1-010", reasons: [{ value: 100 }] }]);
});

it("does not expose opposing hidden card identities to learned features", async () => {
  const traces: { features: unknown; score: unknown }[] = [];
  for (const hidden of ["BT1-010", "BT1-084"]) {
    const setup = setupEngine({ 0: { hand: ["BT1-010"] }, 1: { hand: [hidden] } });
    await setup.ready();
    const policy = createResidualPolicy({
      engine: setup.engine,
      seat: 0,
      seed: 71,
      program: SEED_RESIDUAL,
      onDecision: (trace) => traces.push(trace as { features: unknown; score: unknown }),
    });
    policy.chooseMainAction(buildBotView(setup.state, 0)!);
  }
  expect(traces[0]!.features).toEqual(traces[1]!.features);
  expect(traces[0]!.score).toEqual(traces[1]!.score);
});
