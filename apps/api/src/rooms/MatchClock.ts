import { MatchInactivity } from "@aegis/shared/MatchInactivity";
import {
  type GameState,
  type Seat,
  matchTimerSettings,
  type MatchTimerOptions,
  MATCH_TIMER_OPPONENT_REFILL_SECONDS,
  MATCH_TIMER_DECISION_BONUS_SECONDS,
  MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN,
  MULLIGAN_TIMER_SECONDS,
} from "@aegis/shared";

/**
 * The furthest ahead a seat's presentation timeline may run. Honest play never comes near
 * it: it takes a minute of animation queued faster than it plays. It stops a client that
 * fires actions far faster than anyone can watch them from banking unlimited free time.
 */
export const PRESENTATION_BACKLOG_MAX_MS = 60_000;

/**
 * Which bank the deciding seat draws on:
 * - `match`: the match clock.
 * - `mulligan`: the seat's own mulligan window, which never touches the match clock.
 * - `frozen`: nothing runs, because the deciding seat's opponent is disconnected.
 */
export type ClockMode = "match" | "mulligan" | "frozen";

export interface ClockExpiry {
  seat: Seat;
  clock: Exclude<ClockMode, "frozen">;
}

/**
 * Server monotonic-time accounting.
 *
 * Each seat has its own presentation timeline, `presentEnd`: when that seat's screen
 * finishes the batches sent so far, at the seat's own Effect speed. A seat asked to act is
 * charged from `max(now, presentEnd[seat])`, so it never pays for animations still playing.
 * The server computes the timeline from the shared animation table; the client reports
 * nothing but its speed.
 */
export class MatchClock {
  private remaining: [number, number];
  private mulliganRemaining: [number, number] = [MULLIGAN_TIMER_SECONDS * 1000, MULLIGAN_TIMER_SECONDS * 1000];
  private lastTime: number;
  private running: { seat: Seat; mode: ClockMode } | undefined;
  private presentEnd: [number, number] = [0, 0];
  private lastTurn = 0;
  private bonusTurn = 0;
  private inactivityRemaining = MatchInactivity.decisionSeconds * 1000;
  private inactivityKey: string | undefined;
  private bonusGranted: [number, number] = [0, 0];

  constructor(
    private state: GameState,
    options: Partial<MatchTimerOptions>,
    privateRoom: boolean,
    now: number,
    private readonly inactivityEnabled = false,
  ) {
    const settings = matchTimerSettings(options, privateRoom);
    state.matchTimer = settings.enabled;
    state.timerStartSeconds = settings.startSeconds;
    state.timerRefillSeconds = settings.refillSeconds;
    this.remaining = [settings.startSeconds * 1000, settings.startSeconds * 1000];
    this.lastTime = now;
    this.publish();
  }

  /** Charge the previous owner before changing turns/owners or accepting a late answer. */
  rebindAfterRollback(state: GameState, previous: GameState, now: number): void {
    state.matchTimer = previous.matchTimer;
    state.timerStartSeconds = previous.timerStartSeconds;
    state.timerRefillSeconds = previous.timerRefillSeconds;
    this.state = state;
    this.presentEnd = [0, 0];
    this.running = undefined;
    this.lastTime = now;
    this.lastTurn = state.turnCount;
    this.publish();
  }

  update(
    now: number,
    inputSeat: Seat | undefined,
    mode: ClockMode = "match",
    inputKey?: string,
  ): ClockExpiry | undefined {
    if (!this.state.matchTimer || this.state.gameOver) {
      this.running = undefined;
      this.state.timerActiveSeat = -1;
      this.state.inactivitySeat = -1;
      this.lastTime = now;
      return;
    }
    const charged = this.running;
    if (charged !== undefined && charged.mode !== "frozen") {
      const bank = this.bank(charged.mode);
      const elapsed = Math.max(0, now - Math.max(this.lastTime, this.presentEnd[charged.seat]));
      bank[charged.seat] = Math.max(0, bank[charged.seat] - elapsed);
      if (this.inactivityEnabled && charged.mode === "match") {
        this.inactivityRemaining = Math.max(0, this.inactivityRemaining - elapsed);
      }
      this.lastTime = now;
      // Expiry wins over a turn bonus or an answer arriving at the deadline.
      if (
        bank[charged.seat] === 0 ||
        (this.inactivityEnabled && charged.mode === "match" && this.inactivityRemaining === 0)
      ) {
        this.running = undefined;
        this.publish();
        this.state.timerActiveSeat = -1;
        this.state.inactivitySeat = -1;
        return { seat: charged.seat, clock: charged.mode };
      }
    }
    this.lastTime = now;
    if (this.state.turnCount > this.lastTurn) {
      // The opening turn uses the initial reserve; later turns grant both seats their bonuses.
      if (this.lastTurn > 0) {
        const owner = this.state.turnSeat;
        const opponent = (1 - owner) as Seat;
        this.addTime(owner, this.state.timerRefillSeconds * 1000);
        this.addTime(opponent, MATCH_TIMER_OPPONENT_REFILL_SECONDS * 1000);
      }
      this.lastTurn = this.state.turnCount;
    }
    if (inputSeat !== undefined && inputKey !== undefined && inputKey !== this.inactivityKey) {
      this.inactivityKey = inputKey;
      this.inactivityRemaining = MatchInactivity.decisionSeconds * 1000;
    }
    this.running = inputSeat === undefined ? undefined : { seat: inputSeat, mode };
    this.publish();
    this.state.timerActiveSeat =
      inputSeat !== undefined && mode !== "frozen" && now >= this.presentEnd[inputSeat] ? inputSeat : -1;
    this.state.inactivitySeat =
      this.inactivityEnabled &&
      inputSeat !== undefined &&
      mode !== "mulligan" &&
      this.state.pendingDecision?.kind !== "mulligan"
        ? inputSeat
        : -1;
  }

  resetInactivity(): void {
    this.inactivityRemaining = MatchInactivity.decisionSeconds * 1000;
    this.publish();
  }

  /**
   * Combo time: an effect asked `seat` to decide something. Adds a few seconds to its match
   * clock, up to a per-turn ceiling, so a long chain of effects does not drain the bank.
   */
  grantDecisionBonus(seat: Seat): void {
    this.grantComboBonus(seat);
  }

  /** Feedback #39: a confirmed card play or digivolution earns the same bounded combo time. */
  grantCardBonus(seat: Seat): void {
    this.grantComboBonus(seat);
  }

  private grantComboBonus(seat: Seat): void {
    if (!this.state.matchTimer || this.state.gameOver) return;
    if (this.state.turnCount !== this.bonusTurn) {
      this.bonusTurn = this.state.turnCount;
      this.bonusGranted = [0, 0];
    }
    const allowance = MATCH_TIMER_DECISION_BONUS_MAX_SECONDS_PER_TURN * 1000 - this.bonusGranted[seat];
    this.bonusGranted[seat] += this.addTime(seat, Math.min(MATCH_TIMER_DECISION_BONUS_SECONDS * 1000, allowance));
    this.publish();
  }

  /** Each seat's screen plays the batch that just closed, after what it still has queued. */
  presentBatch(now: number, durationMs: readonly [number, number]): void {
    for (const seat of [0, 1] as const) {
      const end = Math.max(this.presentEnd[seat], now) + durationMs[seat];
      this.presentEnd[seat] = Math.min(end, now + PRESENTATION_BACKLOG_MAX_MS);
    }
    this.state.timerActiveSeat = -1;
  }

  /** A reconnecting client catches up without replaying, so its screen is current now. */
  resetPresentation(seat: Seat, now: number): void {
    this.presentEnd[seat] = Math.min(this.presentEnd[seat], now);
  }

  private bank(mode: Exclude<ClockMode, "frozen">): [number, number] {
    return mode === "mulligan" ? this.mulliganRemaining : this.remaining;
  }

  /** Adds up to `ms` to the seat's match clock without passing its starting reserve. */
  private addTime(seat: Seat, ms: number): number {
    if (ms <= 0) return 0;
    const before = this.remaining[seat];
    this.remaining[seat] = Math.min(this.state.timerStartSeconds * 1000, before + ms);
    return this.remaining[seat] - before;
  }

  private publish(): void {
    this.state.inactivityRemainingSeconds =
      this.inactivityEnabled && this.state.matchTimer ? Math.ceil(this.inactivityRemaining / 1000) : 0;
    this.state.timerRemaining0 = Math.ceil(this.remaining[0] / 1000);
    this.state.timerRemaining1 = Math.ceil(this.remaining[1] / 1000);
    this.state.mulliganTimerRemaining0 = Math.ceil(this.mulliganRemaining[0] / 1000);
    this.state.mulliganTimerRemaining1 = Math.ceil(this.mulliganRemaining[1] / 1000);
  }
}
