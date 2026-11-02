import { GameState, Phase, type Intent, type Seat, type ServerEvent } from "@aegis/shared";
import { Decoder, Encoder } from "@colyseus/schema";
import type { LiveSearchFallbackCounts } from "#api/bot/search/LiveSearchFallback";
import { GameEngine } from "../engine/GameEngine.js";
import type { ScenarioFixture } from "../engine/scenario/types.js";
import { BLUE_DECK, RED_DECK, type Decklist } from "../engine/testDecks.js";
import { BotPlayer } from "./BotPlayer.js";
import { createEvaluationPolicy, type BotPolicy } from "./policy.js";
import { resolveBotProfile, type BotProfile, type BotProfileName } from "./profiles.js";
import { createMatchReplayRecorder, type MatchReplayCursor } from "#api/bot/createMatchReplayRecorder";
import type { ReplayRecord } from "#api/replays/inputs/types";
import "../cards/index.js";

/**
 * Headless bot-vs-bot match runner.
 *
 * It wires a real `GameEngine` to two `BotPlayer` seats through exactly the callbacks
 * `AegisRoom` uses (`requestDecision`, `emit`, `onActionSettled`), so what the benchmark
 * measures is the shipping code path and not a simplified stand-in. The only substitution
 * is the think delay: seats are given a microtask yield instead of a timer, which removes
 * ~2s per action without changing a single decision.
 */

export interface SeatConfig {
  profile?: BotProfileName | BotProfile;
  policy?: BotPolicy<Intent | Promise<Intent>>;
  policyTimeoutMs?: number;
  /** Server-side adapter construction; only its explicit observation crosses the policy bridge. */
  policyFactory?: (
    engine: GameEngine,
    seat: Seat,
    replay: MatchReplayCursor | undefined,
  ) => BotPolicy<Intent | Promise<Intent>>;
  canChooseMainAction?: (engine: GameEngine) => boolean;
  maxMainPhaseActions?: number;
  deck?: Decklist;
  label?: string;
}

export interface MatchOptions {
  omitHandAffordances?: boolean;
  seed: number;
  firstSeat?: Seat;
  /** External experiment cancellation, e.g. an explicit model-decision budget. */
  signal?: AbortSignal;
  seats: readonly [SeatConfig, SeatConfig];
  /** Abort a match that has not ended by this turn, scoring it as a draw. */
  turnLimit?: number;
  /** Keep the public event stream for deterministic presentation analysis. */
  captureEvents?: boolean;
  captureEventFilter?: (event: ServerEvent) => boolean;
  measureDecisionLatencies?: boolean;
  /** Decode both client projections after each action and check hidden zones. */
  verifyProjections?: boolean;
  recordReplay?: boolean;
  fixture?: ScenarioFixture;
}

export interface SeatStats {
  label: string;
  attacksDeclared: number;
  securityAttacksDeclared: number;
  securityCardsTaken: number;
  digimonPlayed: number;
  digivolutions: number;
  turnsTaken: number;
  /** Main-phase policy latency (ms), including asynchronous completion; excludes fallback work. */
  decisionLatenciesMs: number[];
  inferenceFallbacks: { timeout: number; error: number };
  searchFallbacks?: LiveSearchFallbackCounts;
  searchErrors?: Record<string, number>;
}

export interface MatchResult {
  seed: number;
  winnerSeat: Seat | undefined;
  reason: string;
  turnCount: number;
  timedOut: boolean;
  rejections: {
    seat: Seat;
    intent: string;
    reason: string;
    details?: Intent;
    cardId?: string;
    hostCardId?: string;
    phase?: Phase;
    turnCount?: number;
  }[];
  errors: string[];
  projectionChecks?: number;
  seats: [SeatStats, SeatStats];
  /** Present only when `captureEvents` was requested; avoids retaining large traces in benchmarks. */
  events?: ServerEvent[];
  replay?: ReplayRecord;
}

const DEFAULT_TURN_LIMIT = 60;

function emptyStats(label: string): SeatStats {
  return {
    label,
    attacksDeclared: 0,
    securityAttacksDeclared: 0,
    securityCardsTaken: 0,
    digimonPlayed: 0,
    digivolutions: 0,
    turnsTaken: 0,
    decisionLatenciesMs: [],
    inferenceFallbacks: { timeout: 0, error: 0 },
  };
}

function decodeProjection(decoder: Decoder<GameState>, bytes: Uint8Array, seat: Seat): void {
  // Decoder recovery can log a missing refId and continue without throwing.
  // Capture diagnostics only around its synchronous call: any such patch makes
  // the game invalid, even if the later hidden-zone checks happen to pass.
  const error = console.error;
  const warn = console.warn;
  const diagnostics: string[] = [];
  console.error = (...args) => {
    diagnostics.push(String(args[0]));
    error(...args);
  };
  console.warn = (...args) => {
    diagnostics.push(String(args[0]));
    warn(...args);
  };
  try {
    decoder.decode(bytes);
  } finally {
    console.error = error;
    console.warn = warn;
  }
  if (diagnostics.length > 0) throw new Error(`projection seat ${seat}: decoder diagnostic: ${diagnostics[0]}`);
}

/** Run one complete match between two bot seats and report what happened. */
export async function runBotMatch(options: MatchOptions): Promise<MatchResult> {
  const turnLimit = options.turnLimit ?? DEFAULT_TURN_LIMIT;
  const state = new GameState();
  const stats: [SeatStats, SeatStats] = [
    emptyStats(options.seats[0].label ?? String(options.seats[0].profile ?? "seat0")),
    emptyStats(options.seats[1].label ?? String(options.seats[1].profile ?? "seat1")),
  ];
  const rejections: MatchResult["rejections"] = [];
  const errors: string[] = [];
  const projectionErrors = new Set<string>();
  const recordProjectionError = (message: string): void => {
    if (projectionErrors.has(message)) return;
    projectionErrors.add(message);
    errors.push(message);
  };
  const events: ServerEvent[] | undefined = options.captureEvents ? [] : undefined;
  const bots: (BotPlayer | undefined)[] = [undefined, undefined];
  let closed = false;
  let finished = false;
  let winnerSeat: Seat | undefined;
  let reason = "unfinished";
  let checkProjections: (() => void) | undefined;
  let projectionChecks = 0;
  let acceptedActions = 0;
  const recorder = options.recordReplay
    ? createMatchReplayRecorder({ seed: options.seed, firstSeat: options.firstSeat, state })
    : undefined;

  const engine = new GameEngine(state, {
    omitHandAffordances: options.omitHandAffordances,
    seed: options.seed,
    firstSeat: options.firstSeat,
    requestDecision: (seat, request) => {
      bots[seat]?.onDecisionRequested(request);
    },
    onActionSettled: (seat, intentType) => {
      bots[seat]?.onActionSettled(intentType);
    },
    emit: (event: ServerEvent) => {
      recorder?.noteEvent();
      if (closed) return;
      if (events !== undefined && (options.captureEventFilter?.(event) ?? true)) events.push(structuredClone(event));
      recordEvent(event, state, stats);
      if (event.kind === "gameOver") {
        finished = true;
        reason = event.reason;
        winnerSeat = event.result.outcome === "win" ? event.result.winnerSeat : undefined;
      }
      bots[0]?.onEvent(event);
      bots[1]?.onEvent(event);
    },
  });

  for (const seat of [0, 1] as const) {
    const config = options.seats[seat];
    const send = (intent: Intent) => {
      if (closed || options.signal?.aborted) return;
      const rejectedCardId =
        intent.type === "digivolve"
          ? state.players[seat]?.hand.find((card) => card.instanceId === intent.instanceId)?.cardId
          : undefined;
      const rejectedHostCardId =
        intent.type === "digivolve"
          ? (
              state.players[seat]?.battleArea.find((permanent) => permanent.permanentId === intent.permanentId) ??
              (state.players[seat]?.breeding?.permanentId === intent.permanentId
                ? state.players[seat]?.breeding
                : undefined)
            )?.topCard?.cardId
          : undefined;
      try {
        const result = recorder
          ? recorder.applyIntent(seat, intent, () => engine.applyIntent(seat, intent))
          : engine.applyIntent(seat, intent);
        if (result.ok) acceptedActions++;
        checkProjections?.();
        if (!result.ok)
          rejections.push({
            seat,
            intent: intent.type,
            reason: result.reason,
            details: structuredClone(intent),
            phase: state.phase,
            turnCount: state.turnCount,
            ...(rejectedCardId ? { cardId: rejectedCardId } : {}),
            ...(rejectedHostCardId ? { hostCardId: rejectedHostCardId } : {}),
          });
        return result;
      } catch (error) {
        errors.push(`seat ${seat} ${intent.type}: ${String(error)}`);
        return { ok: false as const, reason: "not-implemented" as const };
      }
    };
    const seed = options.seed + seat * 7919;
    const policy =
      config.policyFactory?.(engine, seat, recorder?.cursor) ??
      config.policy ??
      createEvaluationPolicy({ profile: resolveBotProfile(config.profile), seed });
    bots[seat] = new BotPlayer(seat, state, send, {
      policy:
        options.measureDecisionLatencies === false
          ? policy
          : timed(policy, stats[seat].decisionLatenciesMs, () => !closed),
      seed,
      thinkDelay: microtask,
      ...(config.policyTimeoutMs === undefined ? {} : { policyTimeoutMs: config.policyTimeoutMs }),
      ...(config.canChooseMainAction === undefined
        ? {}
        : { canChooseMainAction: () => config.canChooseMainAction!(engine) }),
      ...(config.maxMainPhaseActions === undefined ? {} : { maxMainPhaseActions: config.maxMainPhaseActions }),
    });
  }

  for (const seat of [0, 1] as const) {
    const deck = options.seats[seat].deck ?? (seat === 0 ? RED_DECK : BLUE_DECK);
    const seatPlayer = () => engine.seatPlayer(seat, `bot-${seat}`, { displayName: stats[seat].label, deck });
    if (recorder) {
      recorder.seatPlayer(seat, deck, seatPlayer);
    } else {
      seatPlayer();
    }
  }
  if (options.verifyProjections) {
    const encoder = new Encoder(state);
    const targets = ([0, 1] as const).map((seat) => ({
      seat,
      view: engine.makeStateView(seat)!,
      decoder: new Decoder(new GameState()),
    }));
    engine.installVisibility((ownerSeat, zone, card) => {
      for (const target of targets) engine.exposeCardToView(target.view, target.seat, ownerSeat, zone, card);
    });
    let full = true;
    checkProjections = () => {
      try {
        for (const target of targets) engine.refreshStateView(target.view, target.seat);
        const iterator = { offset: 0 };
        if (full) encoder.encodeAll(iterator);
        else encoder.encode(iterator);
        const sharedOffset = iterator.offset;
        for (const target of targets) {
          iterator.offset = sharedOffset;
          decodeProjection(
            target.decoder,
            full
              ? encoder.encodeAllView(target.view, sharedOffset, iterator)
              : encoder.encodeView(target.view, sharedOffset, iterator),
            target.seat,
          );
          const projected = target.decoder.state as GameState;
          for (const ownerSeat of [0, 1] as const) {
            const player = projected.players[ownerSeat]!;
            if (player.deck.length > 0 || player.eggDeck.length > 0)
              recordProjectionError(`projection seat ${target.seat}: deck order exposed for seat ${ownerSeat}`);
            if (ownerSeat !== target.seat && player.hand.length > 0)
              recordProjectionError(`projection seat ${target.seat}: opponent hand exposed for seat ${ownerSeat}`);
            if (ownerSeat !== target.seat && player.security.length > 0)
              recordProjectionError(`projection seat ${target.seat}: opponent security exposed for seat ${ownerSeat}`);
            const exposed = player.security.find((card) => !card.faceUp && Boolean(card.cardId || card.artId));
            if (exposed)
              recordProjectionError(
                `projection seat ${target.seat}: face-down security identity exposed for seat ${ownerSeat}: ${exposed.instanceId}`,
              );
          }
          const ownHand = projected.players[target.seat]!.hand;
          if (ownHand.length !== state.players[target.seat]!.hand.length || ownHand.some((card) => !card.cardId))
            recordProjectionError(`projection seat ${target.seat}: own hand identity missing`);
        }
        encoder.discardChanges();
        for (const target of targets) engine.forgetWithheldCards(target.view, target.seat);
        full = false;
        projectionChecks++;
      } catch (error) {
        recordProjectionError(`projection: ${String(error)}`);
        checkProjections = undefined;
      }
    };
  }
  if (options.fixture) {
    engine.startScenarioFixture(options.fixture);
  } else if (recorder) {
    recorder.startMatch(() => engine.startMatch());
  } else {
    engine.startMatch();
  }
  checkProjections?.();

  // Drive the cooperative loop: every bot action is scheduled on the macrotask queue, so
  // yielding repeatedly is all that is needed to let the match play itself out. A match
  // that wedges (an unanswered engine window) stops making progress, which is what the
  // stall detector watches for — otherwise the loop would spin forever.
  let ticksSinceProgress = 0;
  let progressSignature = "";
  let timedOut = false;
  let cancelled = false;
  for (;;) {
    await microtask();
    if (finished) break;
    if (options.signal?.aborted) {
      cancelled = true;
      break;
    }
    if (state.turnCount > turnLimit) {
      timedOut = true;
      break;
    }
    const signature = `${state.turnCount}:${state.phase}:${state.memory}:${state.pendingDecision?.decisionId ?? ""}:${acceptedActions}`;
    if (signature === progressSignature) {
      ticksSinceProgress += 1;
      if (bots.some((bot) => (bot?.diagnosticState.pendingPolicyDecisions ?? 0) > 0)) ticksSinceProgress = 0;
      if (ticksSinceProgress > 5_000) {
        errors.push(
          `match stalled at ${signature} ` +
            JSON.stringify({
              combatWindow: state.combatWindow?.toJSON(),
              bots: bots.map((bot) => bot?.diagnosticState),
              lastEvent: events?.at(-1),
            }),
        );
        break;
      }
    } else {
      progressSignature = signature;
      ticksSinceProgress = 0;
    }
  }
  checkProjections?.();

  closed = true;
  for (const bot of bots) bot?.dispose();
  for (const seat of [0, 1] as const) {
    stats[seat].inferenceFallbacks = { ...bots[seat]!.inferenceFallbacks };
    const searchFallbacks = bots[seat]!.searchFallbacks;
    if (searchFallbacks !== undefined) stats[seat].searchFallbacks = { ...searchFallbacks };
    const searchErrors = bots[seat]!.searchErrors;
    if (searchErrors !== undefined) stats[seat].searchErrors = { ...searchErrors };
  }

  return {
    seed: options.seed,
    winnerSeat,
    reason: finished ? reason : cancelled ? "cancelled" : timedOut ? "turnLimit" : "stalled",
    turnCount: state.turnCount,
    timedOut,
    rejections,
    errors,
    ...(options.verifyProjections ? { projectionChecks } : {}),
    seats: stats,
    ...(events ? { events } : {}),
    ...(recorder ? { replay: recorder.buildRecord() } : {}),
  };
}

/**
 * Wrap a policy so every Main-phase action choice is timed. Only `chooseMainAction` is
 * instrumented. These samples do not establish combat or end-to-end latency gates.
 */
function timed(
  policy: BotPolicy<Intent | Promise<Intent>>,
  samples: number[],
  active: () => boolean,
): BotPolicy<Intent | Promise<Intent>> {
  return {
    ...policy,
    chooseMainAction(view, signal) {
      const start = process.hrtime.bigint();
      const intent = policy.chooseMainAction(view, signal);
      const record = () => {
        if (active()) samples.push(Number(process.hrtime.bigint() - start) / 1e6);
      };
      if (intent instanceof Promise) return intent.finally(record);
      record();
      return intent;
    },
  };
}

function recordEvent(event: ServerEvent, state: GameState, stats: [SeatStats, SeatStats]): void {
  switch (event.kind) {
    case "attackDeclared":
      stats[event.seat].attacksDeclared += 1;
      if (!event.redirected && event.target.kind === "player") stats[event.seat].securityAttacksDeclared += 1;
      break;
    case "securityChecked":
      // `seat` is the seat whose security was checked, so the attacker took the card.
      stats[event.seat === 0 ? 1 : 0].securityCardsTaken += 1;
      break;
    case "cardPlayed":
      if (state.turnSeat === 0 || state.turnSeat === 1) stats[state.turnSeat].digimonPlayed += 1;
      break;
    case "digivolved":
      if (state.turnSeat === 0 || state.turnSeat === 1) stats[state.turnSeat].digivolutions += 1;
      break;
    case "phaseChanged":
      if (event.phase === Phase.Breeding) stats[event.turnSeat].turnsTaken += 1;
      break;
  }
}

function microtask(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

export interface SeriesOptions {
  games: number;
  baseSeed?: number;
  seats: readonly [SeatConfig, SeatConfig];
  turnLimit?: number;
  /** Swap which seat plays first half-way through so seat advantage cancels out. */
  alternateSeats?: boolean;
}

export interface SeriesResult {
  games: number;
  /** Wins credited to the configuration listed first in `seats`, regardless of seat. */
  winsA: number;
  winsB: number;
  draws: number;
  /** Wins / decisive games for configuration A. */
  winRateA: number;
  averageTurns: number;
  totalRejections: number;
  /** Rejections attributed to each configuration, so a baseline's noise stays its own. */
  rejectionsA: number;
  rejectionsB: number;
  rejectionReasons: Record<string, number>;
  errors: string[];
  statsA: AggregateStats;
  statsB: AggregateStats;
}

export interface AggregateStats {
  label: string;
  attacksPerTurn: number;
  securityAttacksPerTurn: number;
  securityTakenPerGame: number;
  digimonPlayedPerGame: number;
  digivolutionsPerGame: number;
  medianDecisionMs: number;
  p95DecisionMs: number;
  maxDecisionMs: number;
}

/** Play `games` matches between two configurations and aggregate the outcome. */
export async function runBotSeries(options: SeriesOptions): Promise<SeriesResult> {
  const baseSeed = options.baseSeed ?? 1;
  const alternate = options.alternateSeats ?? true;
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let totalTurns = 0;
  let totalRejections = 0;
  let rejectionsA = 0;
  let rejectionsB = 0;
  const rejectionReasons: Record<string, number> = {};
  const errors: string[] = [];
  const rawA: SeatStats[] = [];
  const rawB: SeatStats[] = [];

  for (let game = 0; game < options.games; game += 1) {
    const swap = alternate && game % 2 === 1;
    const seats = (swap ? [options.seats[1], options.seats[0]] : [options.seats[0], options.seats[1]]) as [
      SeatConfig,
      SeatConfig,
    ];
    const result = await runBotMatch({ seed: baseSeed + game * 104_729, seats, turnLimit: options.turnLimit });

    const seatOfA: Seat = swap ? 1 : 0;
    if (result.winnerSeat === undefined) draws += 1;
    else if (result.winnerSeat === seatOfA) winsA += 1;
    else winsB += 1;

    totalTurns += result.turnCount;
    totalRejections += result.rejections.length;
    for (const rejection of result.rejections) {
      if (rejection.seat === seatOfA) rejectionsA += 1;
      else rejectionsB += 1;
      const key = `${rejection.intent}:${rejection.reason}`;
      rejectionReasons[key] = (rejectionReasons[key] ?? 0) + 1;
    }
    errors.push(...result.errors);
    rawA.push(result.seats[seatOfA]);
    rawB.push(result.seats[seatOfA === 0 ? 1 : 0]);
  }

  const decisive = winsA + winsB;
  return {
    games: options.games,
    winsA,
    winsB,
    draws,
    winRateA: decisive === 0 ? 0 : winsA / decisive,
    averageTurns: totalTurns / options.games,
    totalRejections,
    rejectionsA,
    rejectionsB,
    rejectionReasons,
    errors,
    statsA: aggregate(options.seats[0].label ?? "A", rawA),
    statsB: aggregate(options.seats[1].label ?? "B", rawB),
  };
}

function aggregate(label: string, samples: readonly SeatStats[]): AggregateStats {
  const games = Math.max(1, samples.length);
  const totalTurns = Math.max(
    1,
    samples.reduce((sum, sample) => sum + sample.turnsTaken, 0),
  );
  const latencies = samples.flatMap((sample) => sample.decisionLatenciesMs).sort((a, b) => a - b);
  const quantile = (fraction: number): number =>
    latencies.length === 0 ? 0 : latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))]!;

  return {
    label,
    attacksPerTurn: samples.reduce((sum, sample) => sum + sample.attacksDeclared, 0) / totalTurns,
    securityAttacksPerTurn: samples.reduce((sum, sample) => sum + sample.securityAttacksDeclared, 0) / totalTurns,
    securityTakenPerGame: samples.reduce((sum, sample) => sum + sample.securityCardsTaken, 0) / games,
    digimonPlayedPerGame: samples.reduce((sum, sample) => sum + sample.digimonPlayed, 0) / games,
    digivolutionsPerGame: samples.reduce((sum, sample) => sum + sample.digivolutions, 0) / games,
    medianDecisionMs: quantile(0.5),
    p95DecisionMs: quantile(0.95),
    maxDecisionMs: latencies[latencies.length - 1] ?? 0,
  };
}
