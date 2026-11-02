import type { ReplayEngineSnapshot } from "#api/replays/inputs/ReplayEngineSnapshot";
import type { GameEngineHooks } from "#api/engine/gameEngine/types";
import { snapshotGameEngine } from "#api/engine/snapshot/snapshotGameEngine";
import { restoreGameEngine } from "#api/engine/snapshot/restoreGameEngine";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { GameState, type Intent, type IntentResult, type Seat, type SequencedServerEvent } from "@aegis/shared";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { GameEngine } from "../../engine/GameEngine.js";
import type { ReplayDivergence, ReplayInput, ReplayRecord, ReplaySite } from "./types.js";
import { translateLegacySubTriggerKeys } from "#api/replays/inputs/translateLegacySubTriggerKeys";
import "../../cards/index.js";

export interface RunReplayOptions {
  snapshot?: ReplayEngineSnapshot;
  onDecision?: (request: DecisionRequest) => void;
  stopBeforeTurn?: number;
  /**
   * Stop before applying `inputs[untilInput]`, once the engine has gone idle, so the state can be
   * inspected as it stood when that input arrived.
   */
  untilInput?: number;
  /** Stop at the first divergence instead of playing on. */
  stopOnDivergence?: boolean;
  /**
   * Called as each batch that emitted closes, after its `stateVersion` bump, with the state and the
   * batch's events stamped as `AegisRoom.stamp()` stamps them: where the room captures its
   * `ReplayRecording` frame. Every batch here is a broadcast batch (see `runReplay`).
   */
  onBatch?: (state: GameState, events: SequencedServerEvent[]) => void;
  /** Called with the idle engine just before each input that is applied once idle. */
  beforeInput?: (input: ReplayInput, index: number, engine: GameEngine) => void;
}

export interface ReplayRun {
  getSnapshot(): ReplayEngineSnapshot;
  activate(hooks: import("#api/engine/gameEngine/types").GameEngineHooks): void;
  engineEvents: number;
  pendingRequest?: import("@aegis/shared").DecisionRequest;
  reachedTurn?: number;
  resumeBatchOffset: number;
  engine: GameEngine;
  state: GameState;
  /** How many inputs were applied. */
  applied: number;
  divergences: ReplayDivergence[];
  /**
   * Apply one more intent after the record's inputs, through the same batch bookkeeping (and
   * `onBatch`), and wait for the engine to go idle again.
   */
  applyIntent(seat: Seat, intent: Intent): Promise<IntentResult>;
}

/** Macrotask turns allowed for the engine to go quiet before an input is applied anyway. */
const MAX_IDLE_TURNS = 1_000;

/**
 * Rebuild a recorded match on a fresh engine and feed it the recorded inputs.
 *
 * The engine is constructed with the same rule-affecting hooks as `AegisRoom` (seed, imposed first
 * seat) and the state carries the room's deck format. An input recorded without a site is applied
 * once the engine is idle, because that is when the room receives one: a message or a timer can
 * only run once every pending promise continuation has settled. An input recorded at a site (the
 * room issued it synchronously from inside its handling of the engine, see `ReplaySite`) is applied
 * at the same site, at the moment the engine has emitted the recorded number of events.
 *
 * The room's batch bookkeeping is reproduced (one batch per input, an implicit batch for events
 * emitted after an input returned, `stateVersion` bumped when a batch that emitted closes), so the
 * replayed `stateVersion` and event count are compared with the recorded ones at every input.
 *
 * Each engine event is stamped as `AegisRoom.stamp()` does (`seq`, `batch`, the `stateVersion` it
 * was emitted at) and handed to `onBatch` with its batch. The room keeps events out of its replay
 * recording only in a `recipient` batch, one opened for a single client; it opens those only to
 * send that client a room-made event (a refusal, a reopened prompt), never around an engine call,
 * so every engine event lands in a broadcast batch and there is nothing here to exclude.
 */
export async function runReplay(record: ReplayRecord, options: RunReplayOptions = {}): Promise<ReplayRun> {
  let state = new GameState();
  state.gameMode = record.rules.gameMode ?? GameMode.AUTOMATIC.value;
  state.format = record.rules.deckFormat;
  state.unlimited = record.rules.unlimited;
  // The room keeps it in its own recording, so an exported frame carries it as a player's file does.
  state.matchLogId = record.matchId;
  const inputs = record.inputs;
  const limit = Math.min(options.untilInput ?? inputs.length, inputs.length);
  const divergences: ReplayDivergence[] = [];

  let liveHooks: import("#api/engine/gameEngine/types").GameEngineHooks | undefined;
  let pendingRequest: import("@aegis/shared").DecisionRequest | undefined;
  let resumeTurn: (() => void) | undefined;
  let reachedTurn: number | undefined;
  let resumeBatchOffset = 0;
  let emitted = options.snapshot?.engineEvents ?? 0;
  let progress = 0;
  let cursor = options.snapshot?.inputIndex ?? 0;
  let stopped = false;
  let advancedBeyondRecord = false;
  let batch: OpenBatch | undefined;
  let batchSeq = options.snapshot?.batchSequence ?? 0;
  let eventSeq = options.snapshot?.eventSequence ?? 0;
  let batchDepth = 0;
  let started = options.snapshot?.started ?? false;
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > limit) {
    throw new Error("Replay snapshot input index exceeds the requested replay range");
  }

  const withBatch = <T>(run: () => T): T => {
    const opened = batch ?? (batch = openBatch());
    batchDepth += 1;
    try {
      return run();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && batch === opened) closeBatch();
    }
  };
  // Mirrors AegisRoom.closeBatch: the match clock runs before the bump and `broadcastPatch` after
  // it, and both can issue a room input on the spot.
  const closeBatch = () => {
    const closing = batch;
    batch = undefined;
    if (!closing || closing.emitted === 0) return;
    applyDueAt("batchClose");
    state.stateVersion += 1;
    // The patch carrying the batch refreshes the public count mirrors (`AegisRoom.onBeforePatch`);
    // refresh them here so a captured frame has current counts. They are derived from the zone
    // arrays and nothing the engine or the divergence checks reads.
    engine.syncCounts();
    engine.flushHandAffordances();
    options.onBatch?.(state, closing.events);
    // The room's `stampClose` gives the batch's `batchClosed` its own seq, kept out of the frame.
    eventSeq += 1;
    applyDueAt("batchClose");
  };
  const openBatch = (): OpenBatch => ({ id: `batch-${++batchSeq}`, emitted: 0, events: [] });
  const startOnce = (start: () => void) => {
    if (started) return;
    started = true;
    withBatch(start);
  };

  const replayHooks: GameEngineHooks = {
    deferHandAffordances: true,
    seed: record.seed,
    randomKey: record.randomKey,
    ...(record.firstSeat !== undefined ? { firstSeat: record.firstSeat } : {}),
    beforeTurn: (turn) => {
      if (liveHooks) return liveHooks.beforeTurn?.(turn);
      applyDueAt("beforeTurn");
      if (turn !== options.stopBeforeTurn) return;
      reachedTurn = turn;
      resumeBatchOffset = batch && batch.emitted > 0 ? 1 : 0;
      return new Promise<void>((resolve) => {
        resumeTurn = resolve;
      });
    },
    requestDecision: (seat, request) => {
      if (liveHooks) return liveHooks.requestDecision(seat, request);
      options.onDecision?.(request);
      pendingRequest = request;
      if (!record.seats[seat].bot) {
        engine.syncCounts();
        engine.flushHandAffordances();
      }
      progress += 1;
      applyDueAt("decisionRequest");
    },
    onBothReady: () => (liveHooks ? liveHooks.onBothReady?.() : applyDueAt("bothReady")),
    onActionSettled: (seat, type) => {
      if (liveHooks) return liveHooks.onActionSettled?.(seat, type);
      progress += 1;
    },
    emit: (event) => {
      if (liveHooks) return liveHooks.emit(event);
      emitted += 1;
      progress += 1;
      if (!batch) {
        const implicit = (batch = openBatch());
        queueMicrotask(() => {
          if (batchDepth === 0 && batch === implicit) closeBatch();
        });
      }
      batch.emitted += 1;
      batch.events.push({ ...event, seq: ++eventSeq, batch: batch.id, stateVersion: state.stateVersion });
      if (event.kind === "matchStarted") applyDueAt("matchStarted");
    },
  };
  let engine: GameEngine;
  if (options.snapshot === undefined) {
    engine = new GameEngine(state, replayHooks);
  } else {
    const restored = restoreGameEngine({ snapshot: options.snapshot.engine, hooks: replayHooks });
    engine = restored.engine;
    state = engine.state;
  }

  /** Apply the next inputs while they were recorded at this site and at exactly this point. */
  function applyDueAt(site: ReplaySite): void {
    while (!stopped && cursor < limit) {
      const input = inputs[cursor]!;
      if (!("site" in input) || input.site !== site) return;
      if (input.stateVersion !== state.stateVersion) return;
      if (input.engineEvents !== undefined && input.engineEvents !== emitted) return;
      applyNext();
    }
  }

  function applyNext(): void {
    const index = cursor++;
    const input = inputs[index]!;
    const before = divergences.length;
    const diverge = (divergence: Omit<ReplayDivergence, "index" | "inputKind" | "seat" | "intentType">) =>
      divergences.push({ index, inputKind: input.kind, ...seatAndType(input), ...divergence });
    const positionDivergences: Omit<ReplayDivergence, "index" | "inputKind" | "seat" | "intentType">[] = [];
    if (state.stateVersion !== input.stateVersion)
      positionDivergences.push({
        kind: "state-version",
        expected: input.stateVersion,
        actual: state.stateVersion,
        message: `input #${index} (${describe(input)}): stateVersion ${state.stateVersion}, recorded ${input.stateVersion}`,
      });
    if (input.engineEvents !== undefined && emitted !== input.engineEvents)
      positionDivergences.push({
        kind: "event-count",
        expected: input.engineEvents,
        actual: emitted,
        message: `input #${index} (${describe(input)}): ${emitted} engine events so far, recorded ${input.engineEvents}`,
      });
    try {
      const outcome = apply(input);
      const rejectedAgain = input.kind === "intent" && input.ok === false && outcome?.ok === false;
      if (!rejectedAgain) positionDivergences.forEach(diverge);
      if (input.kind === "intent" && outcome !== undefined) {
        if (input.threw)
          diverge({
            kind: "threw",
            expected: "threw",
            actual: "returned",
            message: `input #${index} (${describe(input)}): returned, recorded a throw`,
          });
        else if (input.ok !== undefined && outcome.ok !== input.ok) {
          const reason = outcome.ok ? undefined : outcome.reason;
          const recorded = input.ok ? "accepted" : `rejected${input.reason ? ` (${input.reason})` : ""}`;
          const replayed = outcome.ok ? "accepted" : `rejected (${reason})`;
          diverge({
            kind: "intent-result",
            expected: recorded,
            actual: replayed,
            ...(reason ? { reason } : {}),
            message: `input #${index} (${describe(input)}): ${replayed}, recorded ${recorded}`,
          });
        }
      }
    } catch (error) {
      positionDivergences.forEach(diverge);
      const reason = error instanceof Error ? error.message : String(error);
      if (!(input.kind === "intent" && input.threw))
        diverge({
          kind: "threw",
          expected: "returned",
          actual: "threw",
          reason,
          message: `input #${index} (${describe(input)}): threw ${reason}`,
        });
    }
    if (options.stopOnDivergence && divergences.length > before) stopped = true;
  }

  /** Apply one input through the engine method the room used; returns an intent's outcome. */
  function apply(input: ReplayInput): { ok: true } | { ok: false; reason: string } | undefined {
    switch (input.kind) {
      case "seat":
        // The replay carries no identities; placeholders stand in for the session and the name.
        withBatch(() =>
          engine.seatPlayer(input.seat, `replay-seat-${input.seat}`, {
            displayName: `Seat ${input.seat}`,
            deck: structuredClone(input.deck),
            ...input.deckRules,
            betaBattleMode: true,
          }),
        );
        return undefined;
      case "intent": {
        const intent = translateLegacySubTriggerKeys(
          structuredClone(input.intent),
          state.pendingDecision && pendingRequest
            ? { decisionId: pendingRequest.decisionId, triggerKeys: pendingRequest.options?.triggerKeys }
            : undefined,
        );
        const result = withBatch(() => engine.applyIntent(input.seat, intent));
        applyDueAt("afterIntent");
        return result;
      }
      case "startMatch":
        startOnce(() => engine.startMatch());
        return undefined;
      case "startScenarioFixture":
        startOnce(() => engine.startScenarioFixture(input.fixture));
        break;
      case "startDevScenario":
        throw new Error(
          `Historical named development replay is unsupported; supply a fixture start: ${input.scenario}`,
        );
      case "disconnect":
        withBatch(() => engine.handleDisconnect(input.seat, input.final));
        return undefined;
      case "reconnect":
        withBatch(() => engine.handleReconnect(input.seat));
        return undefined;
      case "clearReady":
        withBatch(() => engine.clearReady(input.seat));
        return undefined;
      case "expireRankedRound":
        withBatch(() => engine.win.declareDraw("timeout"));
        return undefined;
      case "expireMatchTimer":
        withBatch(() => engine.expireMatchTimer(input.seat));
        return undefined;
      case "expireMulliganWindow":
        // The room ignores the outcome, so a refusal here is not compared either.
        withBatch(() => engine.applyIntent(input.seat, { type: "mulligan", keep: true }));
        return undefined;
      case "expireCombatWindow":
        withBatch(() => engine.expireCombatWindow());
        return undefined;
    }
  }

  while (!stopped && cursor < limit) {
    await waitForIdle(() => progress);
    if (stopped || cursor >= limit) break;
    const input = inputs[cursor]!;
    if ("site" in input && input.site !== undefined)
      divergences.push({
        index: cursor,
        kind: "position",
        inputKind: input.kind,
        ...seatAndType(input),
        expected: input.site,
        actual: "idle",
        message: `input #${cursor} (${describe(input)}): recorded at ${input.site}, never reached there; applied once idle`,
      });
    options.beforeInput?.(input, cursor, engine);
    applyNext();
  }
  await waitForIdle(() => progress);
  return {
    getSnapshot() {
      if (
        liveHooks !== undefined ||
        advancedBeyondRecord ||
        divergences.length > 0 ||
        batch !== undefined ||
        batchDepth !== 0 ||
        (pendingRequest !== undefined && state.pendingDecision)
      ) {
        throw new Error("Replay snapshot requires a settled input boundary");
      }
      return {
        engine: snapshotGameEngine({ engine }),
        inputIndex: cursor,
        engineEvents: emitted,
        batchSequence: batchSeq,
        eventSequence: eventSeq,
        started,
      };
    },
    activate(hooks) {
      liveHooks = hooks;
      resumeTurn?.();
    },
    engineEvents: emitted,
    pendingRequest: state.pendingDecision ? pendingRequest : undefined,
    reachedTurn,
    resumeBatchOffset,
    engine,
    state,
    applied: cursor,
    divergences,
    applyIntent: async (seat, intent) => {
      advancedBeyondRecord = true;
      const result = withBatch(() => engine.applyIntent(seat, intent));
      await waitForIdle(() => progress);
      return result;
    },
  };
}

/** The room's `OpenBatch`, less what only a room with clients needs. */
interface OpenBatch {
  id: string;
  emitted: number;
  events: SequencedServerEvent[];
}

/**
 * Wait until the engine is idle.
 *
 * The engine resolves effects on promise continuations and schedules no timers of its own (the
 * decision timeout is off, as in the room), so one macrotask turn drains all of its pending work.
 * The progress counter (events, decision requests, settled actions) confirms it: the engine is
 * idle once a further full turn passes without any of them.
 */
async function waitForIdle(progress: () => number): Promise<boolean> {
  let last = progress();
  for (let turn = 0; turn < MAX_IDLE_TURNS; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const now = progress();
    if (now === last && turn > 0) return true;
    last = now;
  }
  return false;
}

function seatAndType(input: ReplayInput): { seat?: Seat; intentType?: Intent["type"] } {
  if (input.kind === "intent") return { seat: input.seat, intentType: input.intent.type };
  return "seat" in input ? { seat: input.seat } : {};
}

function describe(input: ReplayInput): string {
  if (input.kind === "intent") return `seat ${input.seat} ${input.intent.type}`;
  return "seat" in input ? `${input.kind} seat ${input.seat}` : input.kind;
}
