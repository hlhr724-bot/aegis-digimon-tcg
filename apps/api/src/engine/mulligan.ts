import type { MulliganCoordinatorState } from "#api/engine/turns/MulliganCoordinatorState";
import { PendingDecision, type DecisionRequest, type GameState, type Seat } from "@aegis/shared";

/**
 * The opening-hand mulligan window (subsystem: deck-and-setup; source: Comprehensive
 * Rules §5-2-1-4/5 "re-draw"). After opening hands are dealt, each player — STARTING
 * WITH THE FIRST PLAYER — may declare a single redraw of their hand.
 *
 * Unlike the in-game decisions routed through DecisionManager, the mulligan is
 * answered by its own dedicated `mulligan` intent (API-CONTRACT §4; DecisionManager
 * deliberately does not match `mulligan`). This small coordinator owns that window:
 *   - {@link request} opens the window for one seat: it mirrors a `mulligan`
 *     PendingDecision into synchronized state (so the client sees the prompt and the
 *     "only respond while a decision is open" gate is consistent), sends the
 *     DecisionRequest to that seat, and returns a promise.
 *   - {@link answer} is called when that seat's `mulligan` intent arrives: it clears
 *     the pending state and resolves the promise with the keep/redraw choice.
 *
 * Only one mulligan is open at a time (the engine sequences the seats, first player
 * first). {@link cancel} unwinds an open window (match torn down mid-setup) so the
 * awaiting setup code does not leak.
 */
export interface MulliganTransport {
  requestDecision(seat: Seat, req: DecisionRequest): void;
}

export class MulliganCoordinator {
  private open: { seat: Seat; decisionId: string; resolve: (keep: boolean) => void } | undefined;
  private seq = 0;

  constructor(
    private readonly state: GameState,
    private readonly transport: MulliganTransport,
  ) {}

  getRuntimeState(): MulliganCoordinatorState {
    this.assertSnapshotBoundary();
    return { sequence: this.seq };
  }

  restoreRuntimeState(state: unknown): void {
    this.assertSnapshotBoundary();
    if (
      state === null ||
      typeof state !== "object" ||
      !("sequence" in state) ||
      typeof state.sequence !== "number" ||
      !Number.isSafeInteger(state.sequence) ||
      state.sequence < 0
    ) {
      throw new Error("Invalid mulligan sequence state");
    }
    this.seq = state.sequence;
  }

  private assertSnapshotBoundary(): void {
    if (this.open !== undefined || this.state.pendingDecision !== undefined) {
      throw new Error("Cannot snapshot or restore an open mulligan request");
    }
  }

  /** Is a mulligan window currently open (awaiting a `mulligan` intent)? */
  get isOpen(): boolean {
    return this.open !== undefined;
  }

  /** The seat whose mulligan window is open, if any. */
  get pendingSeat(): Seat | undefined {
    return this.open?.seat;
  }

  /**
   * Open the mulligan window for `seat` and resolve when its `mulligan` intent
   * arrives. Resolves to `keep` (true = keep the hand, false = the player chose to
   * redraw). Throws if a window is already open (the engine must sequence seats).
   */
  request(seat: Seat): Promise<boolean> {
    if (this.open !== undefined) {
      throw new Error("MulliganCoordinator.request called while a mulligan window is open");
    }
    this.seq += 1;
    const decisionId = `mull-${this.seq}`;

    const req: DecisionRequest = {
      decisionId,
      seat,
      kind: "mulligan",
      promptText: "Redraw your opening hand?",
    };

    const pending = new PendingDecision();
    pending.decisionId = decisionId;
    pending.seat = seat;
    pending.kind = "mulligan";
    pending.promptText = req.promptText;
    pending.payloadJson = "";
    this.state.pendingDecision = pending;

    return new Promise<boolean>((resolve) => {
      this.open = { seat, decisionId, resolve };
      this.transport.requestDecision(seat, req);
    });
  }

  /**
   * Apply a `mulligan` intent. Returns true when it matched the open window (correct
   * seat) and was accepted; false otherwise so the engine can reject the intent
   * without touching state.
   */
  answer(seat: Seat, keep: boolean): boolean {
    const open = this.open;
    if (open === undefined) return false;
    if (open.seat !== seat) return false;
    this.resolveOpen(keep);
    return true;
  }

  /** Abandon an open window (match ended / seat left): resolve as "keep" so setup unwinds. */
  cancel(): void {
    if (this.open !== undefined) this.resolveOpen(true);
  }

  private resolveOpen(keep: boolean): void {
    const open = this.open;
    if (open === undefined) return;
    this.open = undefined;
    this.state.pendingDecision = undefined;
    open.resolve(keep);
  }
}
