import { expect, it } from "vitest";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";
import { informationKey } from "#api/bot/evolution/mcts";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { createEvaluationPolicy } from "#api/bot/policy";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { mainActions, mainActionReady } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import type { TrainingWindow } from "#api/bot/training/policy";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import fixture from "#api/engine/scenarios/assembly-root-declaration.fixture";
import "#api/cards/index";

it("plays an Assembly root action with its own materials when the rollout teacher would pass", async () => {
  const setup = setupScenario(fixture);
  setup.engine.randomStreams = [new SeededRandom({ seed: 31 }), new SeededRandom({ seed: 32 })];
  setup.engine.snapshotContinuation.enable();
  const loop = setup.engine.startTurnLoop();
  await advance(setup.engine).waitForMainPhase(0);
  const root: TrainingWindow = {
    observation: trainingObservation(setup.state, 0),
    kind: "main",
    selected: [],
    actions: mainActions(setup.engine, 0, { includeSpecialActions: true, digiXrosValidationBudget: 256 }),
  };
  const assemblyIndex = root.actions.findIndex((action) => action.assembly !== undefined);
  const snapshot = JSON.parse(JSON.stringify(snapshotGameEngine({ engine: setup.engine, allowContinuation: true })));
  setup.engine.applyIntent(0, { type: "surrender" });
  await loop.catch(() => undefined);
  expect(assemblyIndex).toBeGreaterThanOrEqual(0);
  const passingTeacher = { ...createEvaluationPolicy(), chooseMainAction: () => ({ type: "endPhase" as const }) };
  const result = await runReplayContinuation({
    engineSnapshot: snapshot,
    seat: 0,
    expectedInformation: informationKey(root),
    sampleSeed: 31,
    program: SEED_RESIDUAL,
    opponentProgram: SEED_RESIDUAL,
    rolloutPolicy: passingTeacher,
    rootWindow: root,
    choose: () => assemblyIndex,
    rolloutTurns: 1,
    maxRolloutDecisions: 128,
    profile: DEFAULT_BOT_PROFILE,
    seenOpponentCards: { main: [], eggs: [] },
    opponent: { policyFactory: () => createEvaluationPolicy(), canChooseMainAction: mainActionReady },
  });
  expect(result.failures).toEqual([]);
  expect(result.reason).toBe("rolloutCutoff");
  expect(result.valid).toBe(true);
}, 60_000);
