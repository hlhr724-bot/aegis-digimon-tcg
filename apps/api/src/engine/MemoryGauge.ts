import type { MemoryGaugeSnapshot } from "#api/engine/memory/MemoryGaugeSnapshot";
import type { GameState, ServerEvent, Seat } from "@aegis/shared";

/** Hard bounds of the shared gauge (API-CONTRACT GameState.memory is int8, clamped [-10, 10]). */
export const MEMORY_MIN = -10;
export const MEMORY_MAX = 10;

/**
 * Memory granted to the player who is about to take the turn when the previous
 * player passes without the gauge having already crossed (source EndTurnProcess sets
 * Memory to +/-3 for the new turn player). Stored turn-relative, so it is always +3
 * in favour of the incoming turn player.
 */
export const PASS_TURN_MEMORY = 3;

/**
 * Default minimum memory the non-turn player must reach for the turn to end
 * (source the engine.TurnEndMinMemory base value is 1). Effects can raise this;
 * that override path is the memory-gauge subsystem's responsibility.
 */
export const DEFAULT_TURN_END_MIN_MEMORY = 1;

/**
 * Single shared memory gauge (subsystem: memory-gauge; source: documented behavior,
 * documented behavior, documented behavior).
 *
 * Convention (Aegis, per API-CONTRACT GameState.memory): the value is stored
 * relative to the current `turnSeat` — positive favours the turn player, negative
 * favours the opponent. This differs from the documented rules, which stored the gauge from a fixed
 * seat-1 perspective (`Player.MemoryForPlayer` negated for seat 0); the turn-relative
 * form keeps the engine seat-agnostic and is the documented choice.
 *
 * The turn ends when the gauge crosses to the opponent's side, i.e. the opponent's
 * memory (`-memory`) reaches the turn-end minimum (source
 * `NonTurnPlayer.MemoryForPlayer >= TurnEndMinMemory`).
 *
 * Gain/set, cost payment, the cross-to-opponent predicate, and the pass-turn reset
 * are implemented here. Effect-driven gain vetoes (`ICannotAddMemoryEffect`) and
 * TurnEndMinMemory overrides are computed by the continuous-effect layer: GameEngine
 * injects `memoryGainPolicy` from `ContinuousEffectLedger.canGainMemoryFromEffect`,
 * and `effects/interpreter.ts` calls `setTurnEndMinMemory`.
 */
export type MemoryGainPolicyCheck = (seat: Seat, opts: { isTamerEffect: boolean }) => boolean;

export class MemoryGauge {
  private readonly turnEndMinMemoryOverrides = new Map<Seat, number>();
  /** Set only while a continuous pass is staging the next tier; see beginTurnEndMinMemoryRecompute. */
  private turnEndMinMemoryStaging: Map<Seat, number> | undefined;

  constructor(
    private readonly state: GameState,
    private readonly emit: (event: ServerEvent) => void = () => {},
    private readonly memoryGainPolicy: MemoryGainPolicyCheck = () => true,
  ) {}

  snapshot(): MemoryGaugeSnapshot {
    if (this.turnEndMinMemoryStaging !== undefined) {
      throw new Error("Cannot snapshot a staged memory threshold tier");
    }
    const snapshot: MemoryGaugeSnapshot = {
      version: 1,
      turnEndMinMemoryOverrides: Array.from(this.turnEndMinMemoryOverrides),
    };
    readThresholds(snapshot);
    return snapshot;
  }

  restore(snapshot: MemoryGaugeSnapshot): void {
    if (this.turnEndMinMemoryStaging !== undefined) {
      throw new Error("Cannot restore a staged memory threshold tier");
    }
    const thresholds = readThresholds(snapshot);
    this.turnEndMinMemoryOverrides.clear();
    for (const [seat, minimum] of thresholds) {
      this.turnEndMinMemoryOverrides.set(seat, minimum);
    }
  }

  /** Current gauge value, turn-relative (positive favours the turn player). */
  get value(): number {
    return this.state.memory;
  }

  /** Memory from a given seat's perspective (source Player.MemoryForPlayer). */
  memoryFor(seat: Seat): number {
    return seat === this.state.turnSeat ? this.state.memory : -this.state.memory;
  }

  /**
   * Has the gauge crossed to the opponent of `turnSeat`, ending the turn? True when
   * the non-turn player's memory has reached the turn-end minimum (source EndTurnCheck).
   */
  hasCrossedToOpponent(minMemory: number = this.turnEndMinMemoryFor()): boolean {
    const opponentSeat = (1 - this.state.turnSeat) as Seat;
    return this.memoryFor(opponentSeat) >= minMemory;
  }

  /** Active effect override for the current turn's opponent-side end threshold. */
  turnEndMinMemoryFor(seat: Seat = this.state.turnSeat): number {
    return this.turnEndMinMemoryOverrides.get(seat) ?? DEFAULT_TURN_END_MIN_MEMORY;
  }

  /** Raise the threshold for a seat; multiple continuous effects combine by maximum. */
  setTurnEndMinMemory(seat: Seat, minimum: number): void {
    const target = this.turnEndMinMemoryStaging ?? this.turnEndMinMemoryOverrides;
    const current = target.get(seat) ?? DEFAULT_TURN_END_MIN_MEMORY;
    if (minimum > current) target.set(seat, minimum);
  }

  /**
   * Open a staged re-derivation of the continuous threshold tier.
   *
   * The turn-end condition is read SYNCHRONOUSLY (MainPhaseController.checkTurnEnd, the
   * attack gate, the attack-target projection) while the continuous pass that produces it
   * is ASYNCHRONOUS: any awaiting continuous effect ordered ahead of the one raising the
   * threshold yields mid-pass. Clearing the live map up front therefore made the gauge
   * report the default of 1 for the duration of that await, and a turn-end check landing
   * in the window (for example the one `onCombatComplete` runs after an attack) ended a
   * turn that BT17-069's inherited "the turn end condition is the opponent having 3 or
   * more memory" was still keeping open (KB Q2831).
   *
   * So the pass writes into a staging map and {@link commitTurnEndMinMemoryRecompute}
   * swaps it in at the end: readers always see the last COMPLETE snapshot, never a
   * half-derived one.
   */
  beginTurnEndMinMemoryRecompute(): void {
    this.turnEndMinMemoryStaging = new Map<Seat, number>();
  }

  /** Publish the staged tier as the live one. A pass that staged nothing clears the tier. */
  commitTurnEndMinMemoryRecompute(): void {
    if (this.turnEndMinMemoryStaging === undefined) return;
    const staged = this.turnEndMinMemoryStaging;
    this.turnEndMinMemoryStaging = undefined;
    this.turnEndMinMemoryOverrides.clear();
    for (const [seat, minimum] of staged) this.turnEndMinMemoryOverrides.set(seat, minimum);
  }

  /** Drop the continuous threshold tier outright (isolated callers and tests). */
  clearTurnEndMinMemoryOverrides(): void {
    this.turnEndMinMemoryStaging = undefined;
    this.turnEndMinMemoryOverrides.clear();
  }

  /**
   * Add `amount` memory in the turn player's favour; clamps and emits. The seatless
   * form the effect Primitives are written against (card-module contract /
   * EffectContext.Primitives.gainMemory): an effect resolving on its controller's
   * turn gains memory for that controller, the common case. A negative `amount`
   * hands memory to the opponent. Effects that must add memory to a SPECIFIC seat
   * (e.g. an opponent gaining memory) call `addMemoryForSeat`.
   */
  gainMemory(amount: number, reason = "gainMemory"): void {
    this.addMemoryForSeat(this.state.turnSeat, amount, reason);
  }

  setMemory(value: number, reason = "setMemory"): void {
    this.setAbsolute(value, reason);
  }

  /**
   * Add `amount` to `seat`'s own-perspective memory (source `Player.AddMemory`).
   * Translates the seat-relative gain into the turn-relative store: adding for the
   * turn player raises `memory`; adding for the opponent lowers it. Clamps and
   * emits. `amount === 0` is a no-op (the source explicit `plusMemory == 0` short
   * circuit).
   *
   * The documented rules additionally gates a positive add behind `CanAddMemory` (a +10 ceiling
   * plus `ICannotAddMemoryEffect` vetoes). The ceiling is enforced by the clamp;
   * the effect-driven veto is `canGainMemory`'s injected `memoryGainPolicy` check.
   */
  addMemoryForSeat(seat: Seat, amount: number, reason = "addMemory", opts?: { isTamerEffect?: boolean }): void {
    if (amount === 0) {
      return;
    }
    if (amount > 0 && !this.canGainMemory(seat, opts?.isTamerEffect ?? false)) {
      return;
    }
    const delta = seat === this.state.turnSeat ? amount : -amount;
    this.setAbsolute(this.state.memory + delta, reason);
  }

  setMemoryForSeat(seat: Seat, value: number, reason = "setMemory"): void {
    if (value > this.memoryFor(seat) && !this.canGainMemory(seat)) {
      return;
    }
    const raw = seat === this.state.turnSeat ? value : -value;
    this.setAbsolute(raw, reason);
  }

  /**
   * Whether `seat` may currently gain memory (source `Player.CanAddMemory`): false at
   * the +10 own-perspective ceiling, or when a memory-locking static effect forbids
   * it. The ceiling is checked here; `ICannotAddMemoryEffect` equivalents are checked
   * via the injected `memoryGainPolicy` (backed by
   * `ContinuousEffectLedger.canGainMemoryFromEffect`).
   */
  canGainMemory(seat: Seat, isTamerEffect = false): boolean {
    if (this.memoryFor(seat) >= MEMORY_MAX) return false;
    return this.memoryGainPolicy(seat, { isTamerEffect });
  }

  /**
   * Reset the gauge for the player who is about to take the turn after a manual pass
   * (source EndTurnProcess: Memory := +/-3 for the new turn player). Call this with the
   * gauge already expressed relative to the incoming turn player.
   */
  resetForPassedTurn(reason = "passTurn"): void {
    this.setAbsolute(PASS_TURN_MEMORY, reason);
  }

  /**
   * Largest memory cost `seat` can afford right now (source Player.MaxMemoryCost):
   * the distance, in `seat`'s own perspective, down to the gauge's far extreme.
   * In the turn-relative convention this is `memoryFor(seat) - MEMORY_MIN`.
   */
  maxCostFor(seat: Seat): number {
    return this.memoryFor(seat) - MEMORY_MIN;
  }

  /** Whether `seat` can pay `cost` memory (0 <= cost <= MaxMemoryCost). */
  canPay(seat: Seat, cost: number): boolean {
    return cost >= 0 && cost <= this.maxCostFor(seat);
  }

  /**
   * Pay `cost` memory as `seat` (source cost payment): the paying seat's own
   * perspective drops by `cost`, mirrored into the turn-relative gauge and clamped.
   * Paying as the turn player moves the gauge toward (and possibly across) the
   * opponent's side, which is the rulebook signal the turn passes — that transition
   * is the turn state machine's concern, not this method's. No-op for non-positive
   * cost. Returns the gauge value after.
   */
  pay(seat: Seat, cost: number, reason = "payCost"): number {
    if (cost > 0) {
      // Turn player's perspective == +memory, so paying lowers `memory`; the
      // non-turn player's perspective == -memory, so paying raises it.
      const delta = seat === this.state.turnSeat ? -cost : cost;
      this.setAbsolute(this.state.memory + delta, reason);
    }
    return this.state.memory;
  }

  private setAbsolute(next: number, reason: string): void {
    const from = this.state.memory;
    const clamped = Math.max(MEMORY_MIN, Math.min(MEMORY_MAX, Math.trunc(next)));
    if (clamped === from) {
      return;
    }
    this.state.memory = clamped;
    this.emit({ kind: "memoryChanged", from, to: clamped, reason });
  }

  // Effect-driven TurnEndMinMemory overrides (IChangeEndTurnMinMemoryEffect raising
  // the default of 1) are set via setTurnEndMinMemory, called from
  // effects/interpreter.ts; CanAddMemory vetoes (ICannotAddMemoryEffect) are checked
  // via the injected memoryGainPolicy, backed by
  // ContinuousEffectLedger.canGainMemoryFromEffect.
}

function readThresholds(value: unknown): Map<Seat, number> {
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("turnEndMinMemoryOverrides" in value) ||
    !Array.isArray(value.turnEndMinMemoryOverrides)
  ) {
    throw new Error("Invalid memory threshold snapshot");
  }
  const thresholds = new Map<Seat, number>();
  for (const entry of value.turnEndMinMemoryOverrides) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("Invalid memory threshold entry");
    }
    const [seat, minimum] = entry;
    if (
      (seat !== 0 && seat !== 1) ||
      typeof minimum !== "number" ||
      !Number.isFinite(minimum) ||
      minimum < DEFAULT_TURN_END_MIN_MEMORY ||
      thresholds.has(seat)
    ) {
      throw new Error("Invalid or duplicate memory threshold entry");
    }
    thresholds.set(seat, minimum);
  }
  return thresholds;
}
