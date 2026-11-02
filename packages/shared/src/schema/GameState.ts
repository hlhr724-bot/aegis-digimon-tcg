import { ManualCombatStage } from "#shared/manual/ManualCombatStage";
import { GameMode } from "#shared/manual/GameMode";
import { Schema, ArraySchema, type, view } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";
import { Phase } from "./enums.js";
import type { Seat } from "./enums.js";
import { RematchStatus } from "#shared/protocol/RematchStatus";
import type { RematchMode } from "#shared/protocol/RematchMode";
import { GuestApproval } from "#shared/protocol/GuestApproval";
import { MATCH_TIMER_START_SECONDS } from "#shared/matchTimer";

/** View tag for decision details that are private to the responding seat. */
export const PRIVATE_DECISION_VIEW_TAG = 2;

/**
 * An open request for player input raised by the effect engine. While set, only a
 * matching respondDecision (or surrender) intent is accepted (see API-CONTRACT
 * intent validation contract).
 */
export class PendingDecision extends Schema {
  @type("string") decisionId!: string;
  @type("uint8") seat!: Seat; // who must respond
  @type("string") kind!: string; // "chooseTargets" | "optional" | "orderTriggers" | "selectCards" | "mulligan" | "coinToss"
  @type("string") promptText = "";
  // Candidate identities can expose private hand/deck/security information. The server view
  // unlocks this field only for `seat`; opponents still receive the public waiting metadata.
  @view(PRIVATE_DECISION_VIEW_TAG) @type("string") payloadJson = "";
}

/** The five combat prompt windows the engine can park an attack on. */
export type CombatWindowKind = "block" | "counter" | "alliance" | "evade" | "barrier";

/**
 * The combat prompt window currently awaiting an answer, mirrored into synchronized state.
 *
 * The matching `blockWindowOpened` / `counterWindowOpened` / `alliancePrompt` / `evadePrompt` /
 * `barrierPrompt` events still carry the window for the presentation queue, but a channel
 * message sent while a socket is down is never redelivered — so the fact that a window is open
 * lives here, exactly like {@link PendingDecision}, and survives a reconnect's state sync.
 */
export class CombatWindow extends Schema {
  @type("string") kind: CombatWindowKind = "block";
  @type("uint8") seat!: Seat; // who must answer
  /** Block / Counter: the attacking permanent. Empty for the keyword prompts. */
  @type("string") attackerPermanentId = "";
  /** Alliance / Evade / Barrier: the permanent the prompt is about. Empty otherwise. */
  @type("string") permanentId = "";
  /** Block: eligible blockers. Alliance: eligible allies. Empty otherwise. */
  @type(["string"]) eligiblePermanentIds = new ArraySchema<string>();
  /** Counter: the eligible `{ instanceId, effectKey, description }` entries, JSON-encoded. */
  @view(PRIVATE_DECISION_VIEW_TAG) @type("string") eligibleCountersJson = "";
  /** ＜Collision＞: the block is compulsory, so declining is not offered. */
  @type("boolean") mustBlock = false;
}

/** Stable identity of an open combat window, shared by the server mirror and the client. */
export function combatWindowKey(window: { kind: string; attackerPermanentId: string; permanentId: string }): string {
  return `${window.kind}:${window.attackerPermanentId || window.permanentId}`;
}

export type SeriesPhase = "playing" | "deckSelection" | "choosing" | "starting" | "over";
export type SeriesEndReason = "" | "won" | "forfeit" | "draw" | "aborted";

/**
 * The best-of-three this game belongs to, as both seats and spectators see it. A single-game room
 * keeps the defaults (`bestOf` 1) and nothing reads the rest.
 *
 * `phase` walks `playing` → `choosing` (the last game's loser picks who goes first) → `starting`
 * (the next room exists at `nextRoomId`) → `playing` in that room, until one seat has enough wins
 * and it is `over`.
 */
export class SeriesState extends Schema {
  @type("uint8") bestOf = 1;
  @type("uint8") gameNumber = 1;
  @type("uint8") wins0 = 0;
  @type("uint8") wins1 = 0;
  /** One entry per finished game: the winning seat, or -1 for a draw. */
  @type(["int8"]) results = new ArraySchema<number>();
  @type("string") phase: SeriesPhase = "playing";
  /** Who picks the next game's turn order while `choosing`; -1 otherwise. */
  @type("int8") chooserSeat = -1;
  @type("uint8") choiceSecondsLeft = 0;
  /** Who goes first in the next game, once known. */
  @type("int8") nextFirstSeat = -1;
  @type("string") nextRoomId = "";
  /** -1 while the series runs, and for a drawn series. */
  @type("int8") winnerSeat = -1;
  @type("string") endReason: SeriesEndReason = "";
  @type("string") rematchStatus: RematchStatus = RematchStatus.NONE.value;
  @type("int8") rematchOfferSeat = -1;
  @type("string") rematchMode: RematchMode | "" = "";
  @type("boolean") deckReady0 = false;
  @type("boolean") deckReady1 = false;
  @type("boolean") deckChanged0 = false;
  @type("boolean") deckChanged1 = false;
}

/**
 * Top-level synchronized object. Holds the shared memory gauge, the turn/phase
 * cursor, both players, and the current pending decision (if any). Mirrors
 * documented behavior.
 */
export class ManualTable extends Schema {
  @type("uint32") revision = 0;
  @type(["string"]) history = new ArraySchema<string>();
  @type("int8") undoRequester = -1;
  @type("boolean") canUndo = false;
  @type("int8") resultRequester = -1;
  @type("int8") proposedWinner = -1;
  @type("string") revealedJson = "[]";
  @type("string") turnPhase: Phase = Phase.Main;
  @type("string") combatStage: ManualCombatStage = ManualCombatStage.NONE.value;
  @type("int8") attackerSeat = -1;
  @type("string") attackerPermanentId = "";
  @type("string") attackTargetPermanentId = "";
  @type("string") blockerPermanentId = "";
  @type("int8") signalSeat = -1;
  @type("string") signalPermanentId = "";
  @type("string") signalInstanceId = "";
  @type("string") signalCardId = "";
  @type("string") signalArtId = "";
  @type("string") signalTargetPermanentId = "";
  @type("int8") signalTargetSeat = -1;
  @type("uint32") signalRevision = 0;
  @type("int8") restartRequester = -1;
  @type("int8") restartFirstSeat = -1;
  @type("uint32") restartCount = 0;
  @type("boolean") canHatch = false;
  @type("boolean") canMoveFromBreeding = false;
}

export class GameState extends Schema {
  @type("string") matchLogId = "";
  @type("string") matchId = "";
  @type("string") roomCode = ""; // set for private rooms, empty for public
  @type("string") phase: Phase = Phase.None;
  @type("uint32") turnCount = 0;
  @type("uint8") turnSeat: Seat = 0; // active player
  @type("boolean") isFirstPlayersFirstTurn = true; // first player skips first Draw (rulebook)

  // Single shared memory gauge. Convention: positive favors turnSeat; crossing to
  // the opponent's side ends the turn (see TurnStateMachine). Clamped [-10, 10].
  @type("int8") memory = 0;

  @type([PlayerState]) players = new ArraySchema<PlayerState>(); // index === seat

  @type(PendingDecision) pendingDecision?: PendingDecision; // undefined when no decision is open

  @type(CombatWindow) combatWindow?: CombatWindow; // undefined when no combat prompt is open
  /**
   * Revision of this state, incremented once per closed batch of events (see
   * SequencedServerEvent). It pairs a patch with the batch whose mutations it carries,
   * so the client can narrate a batch over the board that batch produced.
   */
  @type("uint32") stateVersion = 0;

  /** Public, server-owned clock snapshots; -1 means both clocks are paused. */
  @type("boolean") matchTimer = false;
  @type("uint16") timerStartSeconds = MATCH_TIMER_START_SECONDS;
  @type("uint16") timerRefillSeconds = 60;
  @type("uint16") timerRemaining0 = MATCH_TIMER_START_SECONDS;
  @type("uint16") timerRemaining1 = MATCH_TIMER_START_SECONDS;
  @type("int8") timerActiveSeat = -1;
  @type("int8") inactivitySeat = -1;
  @type("uint8") inactivityRemainingSeconds = 0;
  /** Each seat's own mulligan window; it is separate from the match clock. */
  @type("uint8") mulliganTimerRemaining0 = 30;
  @type("uint8") mulliganTimerRemaining1 = 30;

  @type("boolean") gameOver = false;
  @type("int8") winnerSeat = -1; // -1 until decided
  @type("string") spectatorCode = ""; // code-only observer access for public and private matches

  @type(SeriesState) series = new SeriesState();

  /** Authoritative banlist choice, including after reconnect. Append to preserve field indexes. */
  @type("boolean") unlimited = false;
  @type("string") format = "standard";
  @type("boolean") allowRollback = false;
  @type("uint32") rollbackRevision = 0;
  @type("string") rollbackRequestId = "";
  @type("int8") rollbackRequesterSeat = -1;
  @type("string") rollbackKind = "";
  @type("boolean") rollbackBusy = false;
  @type("boolean") canUndoAction = false;
  @type("boolean") canRollbackTurn = false;
  @type("int8") undoActionSeat = -1;
  @type("int8") rollbackTurnSeat = -1;
  @type("float64") rankedDeadlineAt = 0;
  @type("uint16") rankedRemainingSeconds = 0;
  @type("int32") rankedOvertimeTurn = -1;
  @type("string") gameMode: GameMode = GameMode.AUTOMATIC.value;
  @type(ManualTable) manual = new ManualTable();
  @type("string") guestApproval: GuestApproval = GuestApproval.NOT_REQUIRED.value;
}
