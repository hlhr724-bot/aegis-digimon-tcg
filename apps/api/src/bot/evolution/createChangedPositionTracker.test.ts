import { beforeAll, describe, expect, it } from "vitest";
import type { GameEngine } from "#api/engine/GameEngine";
import type { MatchReplayCursor } from "#api/bot/createMatchReplayRecorder";
import { runBotMatch, type SeatConfig } from "#api/bot/matchHarness";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { mainActionReady } from "#api/bot/training/actions";
import { chooseHeuristic, SEED_HEURISTIC, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { createHeuristicExposureChooser } from "#api/bot/evolution/createHeuristicExposureChooser";
import { createChangedPositionTracker } from "#api/bot/evolution/createChangedPositionTracker";
import { getReplaySearchWindow } from "#api/bot/evolution/getReplaySearchWindow";
import { actionKey, informationKey } from "#api/bot/evolution/mcts";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";
import { runReplay } from "#api/replays/inputs/run";

const CANDIDATE: HeuristicProgram = {
  ...SEED_HEURISTIC,
  rules: [...SEED_HEURISTIC.rules, { feature: "cost", weight: 3, advice: "Spend memory on expensive actions." }],
};

async function playExposureMatch() {
  let tracker: ReturnType<typeof createChangedPositionTracker> | undefined;
  const exposure = createHeuristicExposureChooser({
    program: CANDIDATE,
    baseline: SEED_HEURISTIC,
    seed: 42,
    onDecision: (decision) => tracker?.observe(decision),
  });
  const candidate: SeatConfig = {
    deck: randomDeck(1).deck,
    canChooseMainAction: mainActionReady,
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
    policyFactory: (engine: GameEngine, seat, replay: MatchReplayCursor | undefined) => {
      tracker = createChangedPositionTracker({ engine, seat, replay: replay! });
      return createTrainingPolicy(engine, seat, exposure.choose);
    },
  };
  const opponent: SeatConfig = {
    deck: randomDeck(2).deck,
    canChooseMainAction: mainActionReady,
    maxMainPhaseActions: Number.POSITIVE_INFINITY,
    policyFactory: (engine, seat) =>
      createTrainingPolicy(engine, seat, (window) => chooseHeuristic(SEED_HEURISTIC, window, 42 + seat)),
  };
  const result = await runBotMatch({
    seed: 42,
    seats: [candidate, opponent],
    recordReplay: true,
    measureDecisionLatencies: false,
  });
  const record = result.replay!;
  return { record, positions: tracker!.getPositions(record), skipped: tracker!.skipped, report: exposure.report };
}

let played: Awaited<ReturnType<typeof playExposureMatch>>;

beforeAll(async () => {
  played = await playExposureMatch();
}, 120_000);

describe("changed exposure positions", () => {
  it("restore as replay search roots with the live information and both choices legal", async () => {
    const { record, positions, skipped, report } = played;
    expect(report.changed).toBeGreaterThan(0);
    expect(positions.length).toBeGreaterThan(0);
    expect(skipped.unrecorded).toBe(0);

    for (const position of positions) {
      const restored = await runReplay(record, { untilInput: position.inputIndex, stopOnDivergence: true });
      expect(restored.divergences).toEqual([]);
      expect(restored.applied).toBe(position.inputIndex);
      const root = getReplaySearchWindow({ engine: restored.engine, seat: position.seat });
      expect(informationKey(root)).toBe(position.information);
      expect(root.observation.turn).toBe(position.turn);
      expect(position.candidateAction).not.toBe(position.baselineAction);
      expect(root.actions[position.candidateAction]).toBeDefined();
      expect(root.actions[position.baselineAction]).toBeDefined();
      const chosen = root.actions[position.candidateAction]!.intent;
      expect(record.inputs[position.inputIndex]).toMatchObject({
        kind: "intent",
        seat: position.seat,
        ok: true,
        intent: chosen.type === "playCard" ? { type: chosen.type, instanceId: chosen.instanceId } : chosen,
      });
      expect(actionKey(root, position.baselineAction)).not.toBe(actionKey(root, position.candidateAction));
    }
  }, 120_000);

  it("map live main choices into the restored root, which leaves out effect activations", async () => {
    const { record, positions } = played;
    const position = positions[0]!;
    const restored = await runReplay(record, { untilInput: position.inputIndex, stopOnDivergence: true });
    const root = getReplaySearchWindow({ engine: restored.engine, seat: position.seat });
    const activation = {
      intent: { type: "activateEffect", sourceInstanceId: "source", effectKey: "main" } as const,
      label: "Activate",
    };
    const live = { ...root, actions: [activation, ...root.actions] };
    const tracker = createChangedPositionTracker({
      engine: restored.engine,
      seat: position.seat,
      replay: { nextInputIndex: () => position.inputIndex },
    });

    tracker.observe({ window: live, candidate: position.candidateAction + 1, baseline: position.baselineAction + 1 });
    tracker.observe({ window: live, candidate: 0, baseline: position.baselineAction + 1 });

    expect(tracker.getPositions(record)).toEqual([position]);
    expect(tracker.skipped).toEqual({ unmapped: 1, unrecorded: 0 });
  }, 120_000);

  it("start a replay continuation from a bot position with the baseline choice", async () => {
    const { record, positions } = played;
    const position = positions[0]!;
    let first = true;
    const result = await runReplayContinuation({
      record,
      inputIndex: position.inputIndex,
      seat: position.seat,
      expectedInformation: position.information,
      sampleSeed: 7,
      program: SEED_HEURISTIC,
      choose: (window) => {
        if (first) {
          first = false;
          return position.baselineAction;
        }
        return chooseHeuristic(SEED_HEURISTIC, window, 7);
      },
    });
    expect(result.failures).toEqual([]);
    expect(result.reason).not.toBe("stalled");
  }, 120_000);
});
