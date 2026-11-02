import { beforeAll, describe, expect, it } from "vitest";
import type { GameEngine } from "#api/engine/GameEngine";
import type { MatchReplayCursor } from "#api/bot/createMatchReplayRecorder";
import { runBotMatch, type SeatConfig } from "#api/bot/matchHarness";
import { createTrainingPolicy } from "#api/bot/training/policy";
import { mainActionReady } from "#api/bot/training/actions";
import { chooseHeuristic, SEED_HEURISTIC, type HeuristicProgram } from "#api/bot/evolution/heuristic";
import { createHeuristicExposureChooser } from "#api/bot/evolution/createHeuristicExposureChooser";
import { createChangedPositionTracker, type ChangedPosition } from "#api/bot/evolution/createChangedPositionTracker";
import { randomDeck } from "#api/bot/evolution/randomDecks";
import { runReplayContinuation } from "#api/bot/evolution/runReplayContinuation";
import { createEvaluationPolicy } from "#api/bot/policy";
import { runReplay } from "#api/replays/inputs/run";
import type { ReplayRecord } from "#api/replays/inputs/types";

const CANDIDATE: HeuristicProgram = {
  ...SEED_HEURISTIC,
  rules: [...SEED_HEURISTIC.rules, { feature: "cost", weight: 3, advice: "Spend memory on expensive actions." }],
};

let record: ReplayRecord;
let position: ChangedPosition;

async function hasSecurityReveal(replay: ReplayRecord, inputIndex: number): Promise<boolean> {
  let revealed = false;
  await runReplay(replay, {
    untilInput: inputIndex,
    stopOnDivergence: true,
    onBatch: (_state, events) => {
      revealed ||= events.some((event) => event.kind === "securityRevealed");
    },
  });
  return revealed;
}

beforeAll(async () => {
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
  record = result.replay!;
  const positions = tracker!.getPositions(record);
  for (const entry of positions) {
    if (await hasSecurityReveal(record, entry.inputIndex)) {
      position = entry;
      return;
    }
  }
  throw new Error("Expected a bot root after a security reveal");
}, 180_000);

function continueFrom(replay: ReplayRecord, overrides: Partial<Parameters<typeof runReplayContinuation>[0]> = {}) {
  return runReplayContinuation({
    record: replay,
    inputIndex: position.inputIndex,
    seat: position.seat,
    expectedInformation: position.information,
    sampleSeed: 11,
    program: SEED_HEURISTIC,
    choose: () => position.baselineAction,
    ...overrides,
  });
}

describe("bot replay continuation roots", () => {
  it("keep a root after a security reveal usable because the recorded hidden state is true", async () => {
    expect(record.seats.every((seat) => seat.bot === true)).toBe(true);
    const result = await continueFrom(record);
    expect(result.failures).toEqual([]);
    expect(result.valid).toBe(true);
  }, 120_000);

  it("refuse the same root when a seat is human, as before", async () => {
    const human: ReplayRecord = { ...record, seats: [{ deck: record.seats[0].deck }, record.seats[1]] };
    await expect(continueFrom(human)).rejects.toThrow("unsupported revealed or ordered hidden knowledge");
  }, 120_000);

  it("share one library shuffle between arms that use the same sample seed", async () => {
    const first = await continueFrom(record);
    const second = await continueFrom(record);
    expect(second).toMatchObject({ valid: first.valid, reward: first.reward, turn: first.turn, reason: first.reason });
  }, 120_000);

  it("use the supplied opponent policy and continuation chooser after the root", async () => {
    let roots = 0;
    let continued = 0;
    let opponentDecisions = 0;
    const result = await continueFrom(record, {
      choose: () => {
        roots++;
        return position.candidateAction;
      },
      chooseAfterRoot: (window) => {
        continued++;
        return chooseHeuristic(SEED_HEURISTIC, window, 3);
      },
      opponent: {
        policyFactory: (engine, seat) =>
          createTrainingPolicy(engine, seat, (window) => {
            opponentDecisions++;
            return chooseHeuristic(SEED_HEURISTIC, window, 5);
          }),
        canChooseMainAction: mainActionReady,
        maxMainPhaseActions: Number.POSITIVE_INFINITY,
      },
      maxMainPhaseActions: Number.POSITIVE_INFINITY,
    });
    expect(result.failures).toEqual([]);
    expect(roots).toBe(1);
    expect(continued).toBeGreaterThan(0);
    expect(opponentDecisions).toBeGreaterThan(0);
  }, 120_000);

  it("uses the Standard evaluation policy throughout a live search rollout", async () => {
    const result = await continueFrom(record, {
      rolloutPolicy: createEvaluationPolicy({ seed: 11 }),
      rolloutTurns: 1,
      maxDurationMs: 120_000,
    });
    expect(result.reason).toBe("rolloutCutoff");
    expect(result.valid).toBe(true);
    expect(result.failures).toEqual([]);
  }, 120_000);
});
