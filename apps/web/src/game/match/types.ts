import type { RefObject } from "react";
import type { CardInstance, GameState, Permanent, Seat } from "@aegis/shared";
import type { MemoryHold } from "./present/memoryHold";
import type { AttackAnnouncement, SidePanel } from "../sidePanels";
import type { MatchNotice } from "../notices";
import type { NarrationItem } from "../narration";
import type { SecurityBranchScene, SecurityBreakScene, SecurityClashScene } from "../securityClash";
import type { PermanentBurst, ZoneShowcase } from "../showcases";
import type { RevealShowcase } from "./present/revealShowcases";
import type { EffectActivation } from "../effectSource";
import type { PresentationGate } from "./presentationGate";
import type { FieldClashScene } from "../fieldClash";
import type { AttackArrowClock } from "../attackArrowClock";
import type { PhaseBanner } from "../phaseBanner";
import type { DpPulse } from "../dpPulse";
import type { FreezePulse } from "../freezePulse";
import type { ColorName } from "../../design/theme";
import type { SoundKind } from "../../design/sound";
import { SecurityBreakPhase } from "./enums";
import type { Side } from "../side";

/**
 * Card back sent from a deck pile to the hand that just grew, in board coordinates.
 * `x`/`y` are the centre of the deck pile: `.game-draw-flight` pulls itself back
 * over that point with its own negative margins, so the card back can be resized
 * per layout without the launch point drifting.
 */
export type DrawFlight = {
  key: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  duration: number;
  /** The card's face, when the move made its identity public; a card back otherwise. */
  card?: DrawFlightCard;
  handTrash?: boolean;
  /** A physical field stack returning upright to its owner's deck. */
  deckReturn?: import("../fieldShatter").FieldShatterFace;
  /** A whole field stack preserves its orientation while approaching the owner's hand. */
  handReturn?: import("../fieldShatter").FieldShatterFace & { targetScale: number };
  /** A deck draw presents beside the pile before its real hand slot arrives. */
  presentation?: { side: Side; width: number; instanceId?: string; inward: number };
};

export type DrawFlightCard = { cardId: string; artId?: string };

export interface DrawHandArrival {
  /** Searches/returns only enter the hand, without the temporary draw face. */
  entryOnly?: boolean;
  /** Non-deck additions must not restore a card to the deck while held. */
  fromDeck?: boolean;
  /** A security card reaching the hand left security already, at its reveal or its own move. */
  fromSecurity?: boolean;
  securityCountAfter?: number;
  instanceId?: string;
  stateVersion: number;
  handCountAfter: number;
  deckCountAfter: number;
  /** The public deck card's matching showcase finishes before this draw beat. */
  afterReveal?: PresentationGate;
  /** Whole field returns finish before any of this group enters the hand. */
  beforeEntry?: PresentationGate;
  /** Explicit public identity in the event, distinct from the viewer's private hand art. */
  publicCard?: boolean;
}

export interface HeldHandArrival extends DrawHandArrival {
  seat: Seat;
}

/** A pending turn draw belongs to this turn, even while earlier ribbons are still playing. */
export interface DrawPhaseOwner {
  seat: Seat;
  phaseOrder: number;
}

/** Starburst left where a turn-start draw lands, in board coordinates. */
export type DrawBurst = { key: number; x: number; y: number };

/** The stack host and pending hand return held while its sources peel away. */
export interface HeldStackStrip {
  seat: Seat;
  permanent: Permanent;
  index: number;
  stateVersion: number;
  returnedInstanceId: string | undefined;
  /** Server-resolved figures before this Digi-Burst cost, across both public fields. */
  beforeCostDps?: ReadonlyMap<string, number>;
}

/**
 * A deleted permanent the board keeps in place until the shatter that shows it leaving has
 * begun. The batch that deletes it is presented before the clause that caused the deletion
 * has been read out, so without this the card vanished from the field the moment the batch
 * was reached and broke apart over an empty slot a beat later.
 */
export interface HeldDeletion {
  /** The shards own this physical card; older presented revisions must omit its face. */
  departed?: boolean;
  seat: Seat;
  permanent: Permanent;
  /** Where in the battle area it stood, so the row does not reflow ahead of the shatter. */
  index: number;
  /** The trash as it was before the card reached it. */
  trash: readonly CardInstance[];
}

/**
 * Cards one batch moved to a seat's trash, kept out of the pile until that batch is narrated.
 * One patch can carry a whole chain, so without this a card shows up in the trash while the
 * screen is still presenting an earlier use of it (an Option docked, then placed under a
 * Digimon, before a cost trashes it).
 */
export interface HeldTrashArrival {
  seat: Seat;
  instanceIds: readonly string[];
  /** The state version of the batch that moved them. */
  stateVersion: number;
}

/** The shield break, and which of its two beats the defender's shield is playing. */
export type SecurityBreakCue = SecurityBreakScene & { phase: SecurityBreakPhase };

/** The artwork and card-coloured light left at a field departure, in board coordinates. */
export type DeleteBurst = {
  key: number;
  x: number;
  y: number;
  face?: import("../fieldShatter").FieldShatterFace;
  /** Whether an effect caused this deletion. */
  effectDeletion?: boolean;
  /** The card that was there, so its own art can be the thing that shatters. */
  cardId?: string;
  artId?: string;
  color?: ColorName;
  /**
   * The permanent stayed on the field and only lost its top card (＜De-Digivolve＞): the
   * card lifts off toward the trash instead of shattering.
   */
  stackStrip?: true;
  /** Public movement distinguishes top stripping from removal of inherited sources. */
  stackStripKind?: "top" | "source";
  /** Viewer moves right/up; opponent moves left/down on the shared board plane. */
  /** Host of a source-removal vignette. */
  permanentId?: string;
  stackStripDirection?: 1 | -1;
};

/** The unsuspend phase sweeping one player's board, ordered by slot. */
export type UnsuspendSweep = { seat: Seat; key: number };

export type TurnTransitionCue = { endingSeat: number; nextSeat: number; turnCount: number };

/**
 * The revealed card a check the server has not closed yet is holding on stage.
 *
 * `securityRevealed` stages it and `securityChecked` settles it, which may be a decision or
 * two later — everything in between is that card's consequence and queues behind it.
 */
export type RevealOnStage = {
  key: number;
  scene: SecurityClashScene;
  /** True once the card has played out and left the centre of the screen on its own. */
  exited?: boolean;
  /** True while the card is parked in the side dock waiting for its check to close. */
  docked?: boolean;
};

/** The board elements a draw flight is measured between. */
/** A docked security card's [Security] clause, and what waits for it to be read. */
export interface SecurityClause {
  key: number;
  gate: PresentationGate;
  releaseBoard: () => void;
  /** What the dock reads out once it runs; nothing else may read these first. */
  own: { notices: readonly MatchNotice[]; panels: readonly SidePanel[] };
  /** False while the dock is still queued behind earlier centre-stage beats. */
  docking: boolean;
  /** The latest effect announcement when the card docked; a later one supersedes this clause as the cause. */
  effectAtDock?: PresentationGate | null;
}

export interface MatchCueAnchors {
  board: RefObject<HTMLDivElement | null>;
  /**
   * Where a permanent last stood, in board coordinates, by permanent id or by the instance
   * id of its top card. Deletions are narrated after the board has already dropped the
   * permanent, so the caller keeps the last measurement rather than the element.
   */
  permanentCenter?: (permanentId: string) => { x: number; y: number } | undefined;
  /** The card that was on top of a permanent, kept the same way and for the same reason. */
  permanentCardId?: (permanentId: string) => string | undefined;
  /** The held physical face at departure, falling back to its last measured pose. */
  permanentStack?: (permanentId: string) => import("../fieldShatter").FieldShatterFace | undefined;
  permanentFace?: (permanentId: string) => import("../fieldShatter").FieldShatterFace | undefined;
  /** The painted declaration clock; a resolved battle continues it instead of replaying it. */
  attackArrowClock?: (permanentId: string, key: string) => AttackArrowClock | undefined;
  yourDeck: RefObject<HTMLDivElement | null>;
  oppDeck: RefObject<HTMLDivElement | null>;
  yourHandDock: RefObject<HTMLDivElement | null>;
  oppHandStrip: RefObject<HTMLDivElement | null>;
  yourSecurity: RefObject<HTMLDivElement | null>;
  oppSecurity: RefObject<HTMLDivElement | null>;
}

export interface MatchCues {
  /** Recent moments, keyed by occurrence ID and ordered by presentation. */
  narration: ReadonlyMap<string, NarrationItem>;
  /** The viewer's own refused action: immediate, and outside the queue. */
  rejection: MatchNotice | null;
  dismissRejection: () => void;
  /** Dismiss one item by ID, or the oldest when omitted. */
  advanceNarration: (id?: string) => boolean;
  /** Stop or restart every reading clock, for a viewer reading the column. */
  holdNarration: (held: boolean) => void;
  /** Compatibility signal: recent narration never locks input. */
  narrationLock: boolean;
  /** The side panels currently on screen, oldest slot first. A read-only view of {@link narration}. */
  sidePanels: readonly SidePanel[];
  /** The notices currently on screen, the refusal included. A read-only view of {@link narration}. */
  notices: readonly MatchNotice[];
  /** Raises a notice for a refused action, which no server event narrates for the viewer. */
  raiseRejection: (reason: string) => void;
  attackAnnouncement: AttackAnnouncement | null;
  /** An attack has been declared, but the clause that caused it is still being read: draw no arrow yet. */
  attackAwaitingCause: boolean;
  turnTransition: TurnTransitionCue | null;
  securityClash: SecurityClashScene | null;
  /** The defender's shield arming and shattering, ahead of the reveal. */
  securityBreak: SecurityBreakCue | null;
  /** The revealed card, held to the side while its effect resolves. */
  securityBranch: SecurityBranchScene | null;
  /** A used Option parked with the security-effect animation while its [Main] resolves. */
  optionBranch: SecurityBranchScene | null;
  /**
   * True from the moment a security check is queued until the centre-stage scene has
   * finished showing the revealed card. Nothing that speaks for that card — its effect
   * notice, its branch, the decision it asks the viewer — may be presented while it is
   * set (battle-animation-spec.md §4b: the reveal is steps 6–9, the effect is step 10b).
   * A card an effect trashes out of a stack holds the same way, until its scene is over.
   */
  securityRevealPending: boolean;
  /**
   * The viewer's prompt is waiting for the presentation to reach the board the question
   * was asked about. The queue is fast-forwarding through the batches in between and the
   * prompt opens as soon as it arrives, or at the latest after
   * {@link PLAY_LEAD_IN_BUDGET_MS} — a beat that never runs can never leave the viewer
   * unable to answer (docs/presentation-queue-plan.md 3.2, decision barrier).
   */
  decisionBarrierPending: boolean;
  /** Finite visual beats must finish before any new decision is displayed. */
  decisionAnimationsPending: boolean;
  /** The queue still owes a finite beat; open-ended security and Option docks do not count. */
  playbackPending: boolean;
  /** The revision of the newest batch the queue has been handed, once the first batch arrives. */
  consumedStateVersion: number | undefined;
  /**
   * The server revision the queue is presenting, or undefined when it is caught up and
   * the live state is what to show. `GameScreen` renders the snapshot at this revision
   * (net/presentedState.ts); interactivity keeps reading the live state.
   */
  presentedStateVersion: number | undefined;
  /**
   * The queue has something on screen to fast-forward: a moment is being read out, or the
   * board is still held at an older revision than the live state. Desktop shows its skip
   * button while this is set; a phone taps the board instead.
   */
  presenting: boolean;
  /**
   * The server has ended the match, and the queue is still playing what led there. The
   * result waits for it, bounded by `useResultHold`'s clocks; legality does not.
   */
  resultPending: boolean;
  /** The player whose board the unsuspend phase is currently sweeping. */
  unsuspendSweep: UnsuspendSweep | null;
  /** Bursts left where permanents were deleted, in board coordinates. */
  deleteBursts: readonly DeleteBurst[];
  /** The opponent's card, held centre-screen while its zone change is announced. */
  zoneShowcase: ZoneShowcase | null;
  /** Cards the opponent's effect revealed, held centre-screen so the viewer can read them. */
  revealShowcase: RevealShowcase | null;
  /** The colour-keyed burst each permanent is currently playing, by permanent id. */
  permanentBursts: ReadonlyMap<string, PermanentBurst>;
  /** Permanents held back from the board while their showcase is still up. */
  pendingPermanentIds: ReadonlySet<string>;
  /** "Breeding Phase" / "Main Phase", announced as the phase opens. */
  phaseBanner: PhaseBanner | null;
  /** Turn actions wait until all queued phase announcements have finished. */
  phaseTransitionPending: boolean;
  /**
   * Hand/deck presentation for the seat whose queued draw phase has not reached the
   * screen yet. Only that seat is held: the other one keeps drawing on screen, because
   * its cards belong to a turn the ribbons have already announced.
   */
  heldDrawState: { seat: Seat; state: GameState } | undefined;
  /** Keep card rotation from exposing a Main attack before its phase announcement. */
  heldPhaseState: GameState | undefined;
  /** The gauge value kept until the effect clause that moved it has been read out. */
  heldMemory: MemoryHold | undefined;
  /**
   * The board as it stood when a security check revealed its card, held until that check's
   * battle has been drawn. The server trashes the loser before it closes the check, and the
   * board draws whatever state says the moment the patch lands, so without this the attacker
   * leaves the field and the cards reach the trash while the clash that kills them is still
   * playing centre stage — the viewer watches a battle between two cards already in the bin.
   */
  heldBlowState: GameState | undefined;
  /**
   * The battle area and trash as they stood when a security card with a [Security] effect
   * was revealed, held until its clause has been on screen for a readable beat.
   */
  heldSecurityEffectState: GameState | undefined;
  /** Keep the raising area unchanged until its Breeding announcement finishes. */
  heldBreedingState: { seat: Seat; player: GameState["players"][number] } | undefined;
  /** Deleted permanents still on the board, by the key of the shatter that will take them. */
  heldDeletions: ReadonlyMap<number, HeldDeletion>;
  /** Stack hosts stay on the field until their source peels finish. */
  heldStackStrips: ReadonlyMap<number, HeldStackStrip>;
  /** Cards the server has already trashed whose move to the trash is not on screen yet. */
  heldTrashArrivals: ReadonlyMap<number, HeldTrashArrival>;
  /** Incoming hand cards retained until their draw/reveal gates hand over the physical slot. */
  heldHandArrivals: ReadonlyMap<number, HeldHandArrival>;
  /** The last announced phase persists through the gaps between ribbons. */
  displayedPhase: GameState["phase"] | undefined;
  /**
   * The turn the ribbons have reached. The live state flips the moment the server resolves
   * the handover, which on a fast opponent lands in the same patch as the cues for the turn
   * that just ended; a readout bound to it announces the next turn over a card still in
   * flight. Bind the readout to this instead — legality still reads the live state.
   */
  displayedTurn: { seat: Seat; count: number } | undefined;
  /** Keep last turn's suspended cards rotated until their Unsuspend announcement starts. */
  heldSuspendedIds: ReadonlySet<string>;
  /** The zone-specific moment each activating effect source is currently playing. */
  effectSources: readonly EffectActivation[];
  /** The deck piles currently riffling, as `${seat}:${pile}`. */
  deckRiffles: ReadonlyMap<string, number>;
  /** The seats whose security stack a recovered card is currently flying back onto. */
  securityFlights: ReadonlyMap<number, number>;
  /**
   * While the opening five cards are being dealt, how many of them a seat's shield has
   * already been seen to take. The stack is full on the server from the first patch, so
   * the shield counts up with the deal rather than starting at its final figure.
   */
  securityDealCounts: ReadonlyMap<Seat, number>;
  /** Permanents currently taking the claw and the shake for a battle they lost. */
  combatImpactIds: ReadonlySet<string>;
  /** The board battle currently playing: its arrow stays up and its losers keep a ghost on the board. */
  fieldClash: FieldClashScene | null;
  /** The DP change each permanent is currently pulsing over, by permanent id. */
  dpPulses: ReadonlyMap<string, DpPulse>;
  /** Permanents whose persistent DP badge waits for the queued impact animation to finish. */
  dpBadgeSuppressedIds: ReadonlySet<string>;
  /** The attack/block lock each permanent is currently jolting over, by permanent id. */
  freezePulses: ReadonlyMap<string, FreezePulse>;
  securityHitSeat: number | null;
  /**
   * The figure each shield must keep while a scene is still holding a card the board has
   * already dropped. Pass it through {@link shieldSecurityCount} with the live count —
   * absent for a seat whose stack nothing is currently spending.
   */
  heldSecurityCounts: ReadonlyMap<Seat, number>;
  drawFlights: readonly DrawFlight[];
  drawBursts: readonly DrawBurst[];
  /** Plays a cue for a locally triggered action, sharing the repeat suppression with the event fan-out. */
  playCue: (kind: SoundKind) => void;
  /** Fast-forward the decorative cues currently in flight. */
  skipAnimations: () => void;
  effectAwaitingConfirmation: boolean;
  confirmEffect: () => void;
}
