import { TurnLoopMode } from "#api/engine/turns/TurnLoopMode";
import type { TurnPhaseFrame } from "#api/engine/turns/TurnPhaseFrame";
import type { TurnStateMachineSnapshot } from "#api/engine/turns/TurnStateMachineSnapshot";
import { Phase, EffectTiming, type GameState, type Seat, type ServerEvent } from "@aegis/shared";
import { MemoryGauge, PASS_TURN_MEMORY } from "./MemoryGauge.js";

/**
 * Outcome of the breeding-phase decision window. Mirrors the two mutually-exclusive
 * actions the documented rules offers in BreedingPhase: hatch a DigiEgg into the raising area, or
 * move the raised Digimon to the battle area. `none` covers "skip / nothing to do".
 */
export type BreedingChoice = "hatch" | "move" | "none";

/**
 * Why the main phase ended, so turn-end processing can apply the right memory rule.
 *
 * - `crossed`: the gauge already crossed to the opponent during play (a paid action
 *   pushed it over); the turn ends with the gauge as-is.
 * - `passed`: the turn player voluntarily ended their turn while still holding memory
 *   (source `Passed`); the incoming turn player is granted +3 (PASS_TURN_MEMORY).
 */
export type MainPhaseEnd = "crossed" | "passed";

/**
 * Safety bound on §6-6-4 postponement. Nothing in the rules caps how many times an
 * end-of-turn effect may push the memory back, but a pair of effects that each return
 * memory every turn end would otherwise hang the server. Past the bound the turn ends.
 */
const MAX_END_TURN_POSTPONEMENTS = 100;

type ContinueTurnParams = { frame: TurnPhaseFrame; resumeMainInput: boolean };

export interface TurnFlowHooks {
  beforeTurn?: (turn: number) => Promise<void> | void;
  /** Run the effect stack for a timing window (effect-stack-resolution subsystem). */
  fireTiming(timing: EffectTiming): Promise<void>;

  /**
   * Draw `count` cards for `seat` (effect-primitives subsystem). Resolves to the
   * number actually drawn; fewer than requested means the deck ran out.
   */
  draw(seat: Seat, count: number): Promise<number>; // delegates to drawCards, now async

  /** Number of cards left in a seat's deck, for the deck-out loss check. */
  deckCount(seat: Seat): number;

  /**
   * Unsuspend the turn player's permanents at the start of the Active phase, announce
   * the affected permanent ids before resolving their reactions, and return those ids.
   * The documented rules unsuspends battle-area
   * permanents the turn player controls (plus any with Reboot) and all raising-area
   * permanents (digivolve subsystem owns Reboot/CanUnsuspend nuances).
   */
  unsuspendForActivePhase(seat: Seat): Promise<string[]>;

  /**
   * Drive the interactive breeding phase: open an input window in which the turn
   * player may perform exactly ONE breeding action (hatch a Digi-Egg, move a Digimon
   * to the battle area) or skip (§6-4-1). The action handlers live in
   * engine/actions/breeding; this hook owns the per-phase window and resolves once an
   * action has been taken or the player skipped. When no action is possible the engine
   * resolves immediately without a client round-trip (§6-4-1-3 "do nothing").
   */
  runBreedingPhase(seat: Seat): Promise<void>;

  /**
   * Drive the interactive main phase: accept the turn player's verbs (play,
   * digivolve, attack, activate, ...) until the turn ends — either because the gauge
   * crossed to the opponent or the player passed. The action handlers themselves live
   * in engine/actions; this hook owns the per-phase input loop and reports how it ended.
   */
  runMainPhase(seat: Seat): Promise<MainPhaseEnd>;
  resumeMainPhase?(seat: Seat): Promise<MainPhaseEnd>;
  isMainPhaseOpen?(): boolean;

  /** Re-check crossed memory and legal actions after start-of-main effects settle. */
  finalizeMainPhaseEntry?(): void;

  /** Has the match already ended (win check / surrender / deck-out)? Stops the loop. */
  isGameOver(): boolean;

  /** End the match because `loserSeat` must draw from an empty deck (deck-out). */
  declareDeckOutLoss(loserSeat: Seat): void;

  /** Clear duration-scoped effects/modifiers that expire at the given boundary. */
  clearDurations(boundary: DurationBoundary): Promise<void>;
}

/**
 * Boundaries at which the documented rules resets its `Until*Effects` lists. The turn machine only
 * signals the boundary; the static/duration-effect subsystem decides what to drop
 * (source TurnStateMachine.EndPhase / ActivePhase reset blocks).
 */
export type DurationBoundary =
  | "ownerTurnStart"
  | "ownerActivePhaseEnd"
  | "ownerTurnEnd"
  | "opponentTurnEnd"
  | "eachTurnEnd";

const noopHooks: TurnFlowHooks = {
  async fireTiming() {},
  async draw() {
    return 0;
  },
  deckCount() {
    return 0;
  },
  async unsuspendForActivePhase() {
    return [];
  },
  async runBreedingPhase() {},
  async runMainPhase() {
    return "passed";
  },
  finalizeMainPhaseEntry() {},
  isGameOver() {
    return false;
  },
  declareDeckOutLoss() {},
  async clearDurations() {},
};

/**
 * Four phases Active -> Draw -> Breeding -> Main, followed by turn-end processing
 * (subsystem: turn-phase-state-machine; source: documented behavior,
 * documented behavior).
 *
 * Ports the source `GameStateMachine` coroutine loop to an async driver:
 *   - `SwitchTurnPlayer()` then ActivePhase, DrawPhase, BreedingPhase, MainPhase,
 *     EndPhase, repeating until the game ends.
 *   - The first player skips their first Draw (source `if (TurnCount != 1)`), tracked
 *     via `GameState.isFirstPlayersFirstTurn`.
 *   - Active-phase unsuspend (source ActivePhase unsuspend block).
 *   - Per-phase timing windows fire through the effect stack: OnStartTurn (Active),
 *     OnStartMainPhase / OnEndMainPhase (Main), OnEndTurn (End).
 *   - The turn ends when the memory gauge crosses to the opponent; a voluntary pass
 *     grants the incoming turn player +3 (MemoryGauge.PASS_TURN_MEMORY).
 *
 * All UI, animation, network transport RPCs, and AI auto-play from the source are stripped; the
 * server is authoritative and clients only supply decisions through the hooks.
 */
export class TurnStateMachine {
  private readonly memory: MemoryGauge;
  private running = false;
  private turnActive = false;
  private frame: TurnPhaseFrame | undefined;
  private mainInputReady = false;

  constructor(
    private readonly state: GameState,
    private readonly hooks: TurnFlowHooks = noopHooks,
    memory?: MemoryGauge,
    private readonly emit: (event: ServerEvent) => void = () => {},
  ) {
    this.memory = memory ?? new MemoryGauge(state, emit);
  }

  /**
   * Run the whole game loop until the match ends. The first turn player must already
   * be set on `state.turnSeat` by setup (deck-and-setup subsystem) before this is
   * called; unlike the documented rules it is NOT switched before the first turn.
   *
   * The documented rules switched the turn player at the very top of every loop iteration, including
   * the first, because it initialised `TurnPlayer` to the eventual first player's
   * opponent. Aegis sets `turnSeat` to the actual first player at setup, so the first
   * iteration runs as-is and the switch happens only between turns.
   */
  async run(): Promise<void> {
    if (this.running || this.turnActive) {
      throw new Error("TurnStateMachine.run called while already running");
    }
    this.running = true;
    try {
      let firstIteration = true;
      while (!this.hooks.isGameOver()) {
        if (!firstIteration) {
          await this.passTurn();
        }
        firstIteration = false;

        await this.runTurnBody();
      }
    } finally {
      this.running = false;
    }
  }

  /** One full turn: four phases followed by turn-end processing. Visible for testing. */
  async runTurn(): Promise<void> {
    if (this.running) {
      throw new Error("TurnStateMachine.runTurn called while a game loop is active");
    }
    await this.runTurnBody();
  }

  private async runTurnBody(): Promise<void> {
    if (this.turnActive) {
      throw new Error("TurnStateMachine.runTurn called while a turn is active");
    }
    this.turnActive = true;
    try {
      const turnStart = this.hooks.beforeTurn?.(this.state.turnCount + 1);
      if (turnStart) {
        await turnStart;
      }
      if (this.hooks.isGameOver()) {
        return;
      }
      const frame: TurnPhaseFrame = {
        seat: this.state.turnSeat,
        turnCount: this.state.turnCount + 1,
        activePhaseCompleted: false,
        drawPhaseRan: false,
        breedingPhaseRan: false,
        mainPhaseRan: false,
        endWindowsRun: 0,
      };
      this.frame = frame;
      frame.activePhaseCompleted = await this.activePhase();
      if (this.hooks.isGameOver()) {
        return;
      }
      await this.continueTurn({ frame, resumeMainInput: false });
    } finally {
      this.mainInputReady = false;
      this.frame = undefined;
      this.turnActive = false;
    }
  }

  getRuntimeState(): TurnStateMachineSnapshot {
    if (
      !this.turnActive ||
      !this.mainInputReady ||
      this.frame === undefined ||
      this.hooks.isMainPhaseOpen?.() === false
    ) {
      throw new Error("Turn snapshot requires settled Main input");
    }
    const snapshot: TurnStateMachineSnapshot = {
      version: 1,
      mode: this.running ? TurnLoopMode.GAME.value : TurnLoopMode.SINGLE_TURN.value,
      frame: { ...this.frame },
    };
    if (!this.canResume(snapshot)) {
      throw new Error("Turn snapshot requires settled Main input");
    }
    return snapshot;
  }

  async resume(snapshot: TurnStateMachineSnapshot): Promise<void> {
    if (
      this.running ||
      this.turnActive ||
      this.hooks.isMainPhaseOpen?.() === true ||
      this.hooks.resumeMainPhase === undefined ||
      !this.canResume(snapshot)
    ) {
      throw new Error("Invalid, mismatched or active turn continuation");
    }
    const frame = { ...snapshot.frame };
    const mode = snapshot.mode;
    this.running = mode === TurnLoopMode.GAME.value;
    this.turnActive = true;
    this.frame = frame;
    try {
      try {
        await this.continueTurn({ frame, resumeMainInput: true });
      } finally {
        this.mainInputReady = false;
        this.frame = undefined;
        this.turnActive = false;
      }
      if (mode === TurnLoopMode.GAME.value) {
        while (!this.hooks.isGameOver()) {
          await this.passTurn();
          await this.runTurnBody();
        }
      }
    } finally {
      this.running = false;
    }
  }

  private canResume(snapshot: TurnStateMachineSnapshot): boolean {
    if (
      snapshot === null ||
      typeof snapshot !== "object" ||
      snapshot.version !== 1 ||
      (snapshot.mode !== TurnLoopMode.GAME.value && snapshot.mode !== TurnLoopMode.SINGLE_TURN.value)
    ) {
      return false;
    }
    const frame = snapshot.frame;
    return (
      frame !== null &&
      typeof frame === "object" &&
      (frame.seat === 0 || frame.seat === 1) &&
      frame.seat === this.state.turnSeat &&
      frame.turnCount === this.state.turnCount &&
      Number.isSafeInteger(frame.turnCount) &&
      frame.turnCount >= 1 &&
      frame.activePhaseCompleted === true &&
      frame.drawPhaseRan === true &&
      frame.breedingPhaseRan === true &&
      typeof frame.mainPhaseRan === "boolean" &&
      (!frame.mainPhaseRan || frame.endWindowsRun > 0) &&
      Number.isSafeInteger(frame.endWindowsRun) &&
      frame.endWindowsRun >= 0 &&
      frame.endWindowsRun <= MAX_END_TURN_POSTPONEMENTS &&
      this.state.phase === Phase.Main &&
      this.state.pendingDecision === undefined &&
      !this.hooks.isGameOver() &&
      !this.memory.hasCrossedToOpponent()
    );
  }

  private async continueTurn({ frame, resumeMainInput }: ContinueTurnParams): Promise<void> {
    const continuePhases = async (): Promise<MainPhaseEnd> => {
      if (this.memory.hasCrossedToOpponent()) {
        return "crossed";
      }
      if (!frame.activePhaseCompleted) {
        await this.completeActivePhase();
        frame.activePhaseCompleted = true;
      }
      if (this.hooks.isGameOver() || this.memory.hasCrossedToOpponent()) {
        return "crossed";
      }
      if (!frame.drawPhaseRan) {
        frame.drawPhaseRan = true;
        await this.drawPhase();
      }
      if (this.hooks.isGameOver() || this.memory.hasCrossedToOpponent()) {
        return "crossed";
      }
      if (!frame.breedingPhaseRan) {
        frame.breedingPhaseRan = true;
        await this.breedingPhase();
      }
      if (this.hooks.isGameOver() || this.memory.hasCrossedToOpponent()) {
        return "crossed";
      }
      const ending = await this.mainPhase(frame.mainPhaseRan);
      frame.mainPhaseRan = true;
      return ending;
    };
    let ending: MainPhaseEnd;
    if (resumeMainInput) {
      ending = await this.resumeMainInput();
      frame.mainPhaseRan = true;
    } else {
      ending = await continuePhases();
    }
    if (this.hooks.isGameOver()) {
      return;
    }
    while (frame.endWindowsRun < MAX_END_TURN_POSTPONEMENTS) {
      frame.endWindowsRun++;
      const postponed = await this.endTurnWindow(ending);
      if (this.hooks.isGameOver()) {
        return;
      }
      if (!postponed) {
        break;
      }
      ending = await continuePhases();
      if (this.hooks.isGameOver()) {
        return;
      }
    }
    await this.closeTurn();
  }

  private async resumeMainInput(): Promise<MainPhaseEnd> {
    const endingWindow = this.hooks.resumeMainPhase!(this.state.turnSeat);
    this.mainInputReady = true;
    let ending: MainPhaseEnd;
    try {
      ending = await endingWindow;
    } finally {
      this.mainInputReady = false;
    }
    await this.hooks.fireTiming(EffectTiming.OnEndMainPhase);
    return ending;
  }

  // --- Active phase -------------------------------------------------------------
  // source TurnStateMachine.ActivePhase: bump the turn counter, fire OnStartTurn, then
  // unsuspend the turn player's permanents.
  private async activePhase(): Promise<boolean> {
    this.setPhase(Phase.Active);
    this.state.turnCount += 1;
    await this.hooks.clearDurations("ownerTurnStart");

    await this.hooks.fireTiming(EffectTiming.OnStartTurn);
    if (this.hooks.isGameOver() || this.memory.hasCrossedToOpponent()) return false;
    await this.completeActivePhase();
    return true;
  }

  private async completeActivePhase(): Promise<void> {
    await this.hooks.unsuspendForActivePhase(this.state.turnSeat);

    await this.hooks.clearDurations("ownerActivePhaseEnd");
  }

  // --- Draw phase ---------------------------------------------------------------
  // source TurnStateMachine.DrawPhase: the first player's first turn skips the draw
  // (`if (TurnCount != 1)`); otherwise draw 1, losing on an empty deck.
  private async drawPhase(): Promise<void> {
    this.setPhase(Phase.Draw);

    if (this.state.isFirstPlayersFirstTurn) {
      return; // first player skips the first Draw (rulebook)
    }

    if (this.hooks.deckCount(this.state.turnSeat) === 0) {
      this.hooks.declareDeckOutLoss(this.state.turnSeat);
      return;
    }

    await this.hooks.draw(this.state.turnSeat, 1);
  }

  // --- Breeding phase -----------------------------------------------------------
  // source TurnStateMachine.BreedingPhase: an interactive window in which the turn
  // player takes at most one breeding action (hatch / move) or skips. The engine's
  // hook owns the input loop and resolves when the action is taken or skipped (and
  // immediately when nothing is possible).
  private async breedingPhase(): Promise<void> {
    this.setPhase(Phase.Breeding);
    await this.hooks.runBreedingPhase(this.state.turnSeat);
  }

  // --- Main phase ---------------------------------------------------------------
  // source TurnStateMachine.MainPhase: fire OnStartMainPhase, run the interactive verb
  // loop until the turn ends, then fire OnEndMainPhase (the source `EndMainPhase:` exit).
  private async mainPhase(resuming = false): Promise<MainPhaseEnd> {
    if (!resuming) this.setPhase(Phase.Main);

    // Open the authoritative Main input window before any phase patch can reach a
    // client. `fireTiming` is asynchronous even when no start-of-main effect needs
    // input; opening the controller afterwards left a real interval where the UI
    // showed Main and play validation succeeded, but no controller existed to end
    // the turn when that play crossed memory.
    const endingWindow = this.hooks.runMainPhase(this.state.turnSeat);

    if (!resuming) await this.hooks.fireTiming(EffectTiming.OnStartMainPhase);
    if (this.hooks.isGameOver()) {
      return "crossed";
    }
    this.hooks.finalizeMainPhaseEntry?.();

    this.mainInputReady = true;
    let ending: MainPhaseEnd;
    try {
      ending = await endingWindow;
    } finally {
      this.mainInputReady = false;
    }

    await this.hooks.fireTiming(EffectTiming.OnEndMainPhase);
    return ending;
  }

  // --- Turn-end processing -------------------------------------------------------
  // source turn-end is split across the engine.EndTurnProcess (fires OnEndTurn,
  // applies the pass-turn +/-3) and TurnStateMachine.EndPhase (duration resets,
  // clears isFirstPlayerFirstTurn). Both run here, in source order: the OnEndTurn
  // window fires while the phase is still notionally the turn player's, then the
  // phase flips to End and durations clear.
  private async endTurnWindow(ending: MainPhaseEnd): Promise<boolean> {
    // Voluntary pass while the gauge has not already crossed: the incoming turn
    // player starts with +3 (source EndTurnProcess, which applies this BEFORE OnEndTurn
    // fires). We are still in the outgoing player's frame here, so +3 for the
    // incoming player is -3 (-PASS_TURN_MEMORY) now; passTurn()'s negation flips it to
    // +3 for the incoming player on the next iteration.
    if (ending === "passed" && !this.memory.hasCrossedToOpponent()) {
      this.memory.setMemory(-PASS_TURN_MEMORY, "passTurn");
    }

    // §6-6-4 postponement is a MOVE: the gauge has to have been on the opponent's side
    // going into the window and be back on the turn player's side coming out. Snapshotting
    // it here (after the pass bonus) is what keeps a turn that never crossed at all from
    // postponing itself forever.
    const crossedBeforeWindow = this.memory.hasCrossedToOpponent();

    await this.hooks.fireTiming(EffectTiming.OnEndTurn);
    if (this.hooks.isGameOver()) return false;

    return crossedBeforeWindow && !this.memory.hasCrossedToOpponent();
  }

  private async closeTurn(): Promise<void> {
    // Keep the legacy protocol marker while duration cleanup runs: ordinary Main
    // intents must remain closed. It is not a game phase and must not emit a
    // phaseChanged event; turnEnded announces the handoff after cleanup finishes.
    this.state.phase = Phase.End;
    this.state.isFirstPlayersFirstTurn = false;

    await this.hooks.clearDurations("eachTurnEnd");
    await this.hooks.clearDurations("ownerTurnEnd");
    await this.hooks.clearDurations("opponentTurnEnd");

    if (this.hooks.isGameOver()) {
      return;
    }

    this.emit({
      kind: "turnEnded",
      endingSeat: this.state.turnSeat,
      nextSeat: (1 - this.state.turnSeat) as Seat,
      turnCount: this.state.turnCount,
    });
  }

  /**
   * Hand the turn to the opponent (source GameContext.SwitchTurnPlayer). Memory is
   * stored turn-relative, so flipping the active seat negates the gauge to keep it in
   * the new turn player's frame.
   */
  private passTurn(): void {
    const next = (1 - this.state.turnSeat) as Seat;
    this.state.turnSeat = next;
    this.state.memory = -this.state.memory; // re-frame the gauge for the new turn player
  }

  private setPhase(phase: Phase): void {
    this.state.phase = phase;
    this.emit({
      kind: "phaseChanged",
      phase,
      turnSeat: this.state.turnSeat,
      turnCount: this.state.turnCount,
    });
  }
}
