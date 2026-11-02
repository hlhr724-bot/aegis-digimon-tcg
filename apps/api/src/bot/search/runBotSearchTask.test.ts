import { expect, it } from "vitest";
import { runBotSearchTask } from "#api/bot/search/runBotSearchTask";
import type { BotSearchTask } from "#api/bot/search/BotSearchTask";
import { currentEpochMs } from "#api/bot/search/currentEpochMs";
import { DEFAULT_BOT_PROFILE } from "#api/bot/profiles";
import { SEED_RESIDUAL } from "#api/bot/evolution/residualPolicy";
import { mainActions } from "#api/bot/training/actions";
import { trainingObservation } from "#api/bot/training/observation";
import { setupEngine } from "#api/engine/testkit/harness";
import { advance } from "#api/engine/testkit/advance";
import { SeededRandom } from "#api/engine/random/SeededRandom";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

async function createSearchTask(): Promise<BotSearchTask> {
  const setup = setupEngine({
    0: { hand: ["BT1-010", "BT1-011"], deck: ["BT1-012", "BT1-013", "BT1-014"], security: ["BT1-015"] },
    1: { hand: ["BT1-016"], deck: ["BT1-017", "BT1-018", "BT1-019"], security: ["BT1-020"] },
  });
  setup.engine.randomStreams = [new SeededRandom({ seed: 78 }), new SeededRandom({ seed: 79 })];
  const loop = setup.engine.startTurnLoop();
  await advance(setup.engine).waitForMainPhase(0);
  const actions = mainActions(setup.engine, 0, { includeSpecialActions: true });
  const snapshot = snapshotGameEngine({ engine: setup.engine });
  const observation = trainingObservation(setup.state, 0);
  setup.engine.applyIntent(0, { type: "surrender" });
  await loop;
  return {
    snapshot: deepFreeze(snapshot),
    root: { observation, kind: "main", selected: [], actions },
    seat: 0,
    program: SEED_RESIDUAL,
    opponentProgram: SEED_RESIDUAL,
    profile: DEFAULT_BOT_PROFILE,
    simulations: 4,
    candidateLimit: 2,
    deadlineEpochMs: currentEpochMs() + 60_000,
    seed: 78,
    rootPriors: actions.map(() => 1 / actions.length),
    seenOpponentCards: { main: [], eggs: [] },
  };
}

it("replays every simulation from one immutable engine snapshot with repeatable rewards", async () => {
  const task = await createSearchTask();
  expect(task.root.actions.length).toBeGreaterThan(1);
  const first = await runBotSearchTask({ task, signal: new AbortController().signal });
  const second = await runBotSearchTask({ task, signal: new AbortController().signal });
  expect(first.report.completed).toBe(4);
  expect(first.report.invalid).toBe(0);
  expect(second.action).toBe(first.action);
  expect(second.report.root).toEqual(first.report.root);
}, 120_000);

it("searches a JSON-transferred task with the same rollouts and final states as the original task", async () => {
  const task = await createSearchTask();
  const collect = async (searchTask: BotSearchTask) => {
    const rollouts: unknown[] = [];
    const result = await runBotSearchTask({
      task: searchTask,
      signal: new AbortController().signal,
      onRollout: ({ action, sample, reward, valid, reason, state }) =>
        rollouts.push({ action, sample, reward, valid, reason, state: JSON.stringify(state.toJSON()) }),
    });
    return { action: result.action, root: result.report.root, rollouts };
  };
  const original = await collect(task);
  const transferred = await collect(JSON.parse(JSON.stringify(task)) as BotSearchTask);
  expect(original.rollouts).toHaveLength(4);
  expect(transferred).toEqual(original);
}, 120_000);
