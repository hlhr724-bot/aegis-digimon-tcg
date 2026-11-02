import type { CounterChoice } from "#shared/protocol/CounterChoice";
import type { SingleHandCostBenefit } from "#shared/protocol/SingleHandCostBenefit";
import { CardMovePosition } from "#shared/protocol/CardMovePosition";
import type { DecisionEffectSummary } from "#shared/protocol/DecisionEffectSummary";
import type { DecisionSelectionGoal } from "#shared/protocol/DecisionSelectionGoal";
import type { Seat } from "../schema/enums.js";
import type { AttackTarget } from "./intents.js";

/**
 * Server -> client events: an additional narration/log plus out-of-band info the
 * client cannot derive from a state diff alone. The synchronized GameState delta
 * remains the source of truth for what the board looks like (API-CONTRACT
 * section 5).
 *
 * `ServerEvent` is what the engine emits. What travels on EVENT_CHANNEL is the
 * envelope {@link SequencedServerEvent}: the same event plus its position in the
 * room's stream (`seq`), the batch it belongs to (`batch`) and the state revision
 * it was emitted under (`stateVersion`). The room closes each batch with a
 * `batchClosed` event, so the client groups its presentation by what the rules
 * resolved together instead of by what happened to arrive between two renders.
 */
/**
 * The DP compare of a Security Digimon battle (Comprehensive Rules §13-1-8-3), published so
 * the client can dramatize the losing side instead of inferring one from later deletions.
 *
 * `attackerDeleted` reports whether the attacker actually left after battle protection
 * and deletion replacements resolve. A tie loses on both sides, but ＜Jamming＞ and
 * leave-prevention effects can spare the attacker. `securityDigimonDeleted` retains the
 * comparison verdict; the Security Digimon is a loose card that CR 14-2-3 keeps alive
 * and CR 13-1-8-4 trashes regardless of that verdict.
 */
export interface SecurityBattleResult {
  /** Effective DP values used by the server for this comparison. */
  attackerDP?: number;
  securityCardDP?: number;
  attackerDeleted: boolean;
  securityDigimonDeleted: boolean;
}

/**
 * How a permanent gained its current top card, for the client's evolution cut-in tier.
 * Display-only provenance in the same family as {@link TargetFate}: the engine already
 * distinguishes these paths because their costs and requirements differ, so the client
 * picks a tier from the fact instead of guessing one from the board diff.
 *
 * - `normal` — the printed EvoCost colour+level path.
 * - `alternate` — a gateless alternate `[Digivolve]` requirement. Armor, X-Antibody and
 *   "digivolve from [ExactCard]" all compile down to this one shape (engine/cards/cardData.ts),
 *   so they are genuinely indistinguishable at the dispatch point and share a value rather
 *   than being guessed apart.
 * - `baseGranted` — a digivolve granted by the base card (ST7-03 / BT6-060).
 * - `burst` — ＜Burst Digivolve＞ (§8-3-2-1).
 * - `blast` — ＜Blast Digivolve＞ / ＜Blast DNA Digivolve＞ cost waiver (§16-26-1 / §16-31-1).
 * - `dna` — DNA digivolve / Jogress (§8-2-2), two permanents merging into one.
 * - `digiXros` — a DigiXros play consuming materials (§7-2-2-7).
 */
export type DigivolveMechanic =
  | "normal"
  | "alternate"
  | "baseGranted"
  | "burst"
  | "blast"
  | "dna"
  | "digiXros"
  | "appFusion";

/**
 * The keywords that pay a cost to prevent a deletion or a leave, and so need the client
 * told that they fired: each resolves through a plain decision prompt and then a silent
 * board change (Comprehensive Rules §16-18, §16-19, §16-32, §16-37, and ＜Guard＞).
 * ＜Evade＞ and ＜Barrier＞ are absent because they already have prompt/resolved events.
 */
export type PreventionKeyword = "Scapegoat" | "Decoy" | "Guard" | "Fragment" | "Armor Purge" | "Delay";

/** One pending effect in a {@link ServerEvent} `resolutionOrderChosen` answer. */
export interface ResolutionOrderEntry {
  /**
   * The source card. Absent when the source sits where the opponent cannot see it (hand,
   * deck, face-down security): naming it would reveal the card.
   */
  sourceCardId?: string;
  /** Firing window label, as `orderTriggers` lists it (e.g. "OnPlay"). */
  timing?: string;
  /** The clause, absent under the same rule as `sourceCardId`. */
  description?: string;
}

/** The public faces of an effect battle's two Digimon, read at the comparison. */
export interface EffectBattleParticipants {
  attackerSeat: Seat;
  attackerCardId: string;
  attackerArtId?: string;
  defenderCardId: string;
  defenderArtId?: string;
}

export type ServerEvent =
  | { kind: "manualAction"; seat: Seat; action: string }
  | { kind: "matchStarted"; firstSeat: Seat }
  | { kind: "phaseChanged"; phase: string; turnSeat: Seat; turnCount: number }
  | {
      kind: "cardPlayed";
      artId?: string;
      seat: Seat;
      cardId: string;
      /** Exact public played instance and its origin, captured before entering the field. */
      instanceId?: string;
      fromZone?: string;
      fromPermanentId?: string;
      permanentId?: string;
      /** Present when this play IS a digivolution mechanic that the engine models as a play
       * rather than as a `digivolved` event: DNA digivolve (§8-2-2) consumes two permanents,
       * DigiXros (§7-2-2-7) consumes materials. Absent for an ordinary play. */
      mechanic?: Extract<DigivolveMechanic, "dna" | "digiXros">;
      /** Cards consumed as DNA or DigiXros materials, for the mechanic's visual call-out.
       * Every id is already public to the receiving player when the mechanic resolves. */
      sourceCardIds?: string[];
      sourceArtIds?: string[];
    }
  | {
      kind: "digivolved";
      artId?: string;
      seat: Seat;
      permanentId: string;
      cardId: string;
      mechanic: DigivolveMechanic;
      /** Present and true when the digivolution happened in the breeding area; absent means
       * the battle area. The client announces a breeding digivolution differently, because
       * the corner slot is not where the viewer is looking. */
      inBreeding?: boolean;
    }
  | { kind: "hatched"; seat: Seat; permanentId: string; cardId: string }
  | { kind: "movedFromBreeding"; seat: Seat; permanentId: string; cardId: string }
  | { kind: "memoryChanged"; from: number; to: number; reason: string }
  | {
      /** A DP modifier landed but protection kept the displayed DP unchanged. */
      kind: "dpModifierApplied";
      permanentId: string;
      delta: number;
    }
  | {
      kind: "attackDeclared";
      seat: Seat;
      attackerPermanentId: string;
      attackerCardId: string;
      attackerArtId?: string;
      target: AttackTarget;
      /** Public identity of a permanent target at declaration time. */
      targetCardId?: string;
      targetArtId?: string;
      /**
       * Present and true when this re-narrates an attack that is already open, because its
       * target switched (§11-2-7-2: ＜Raid＞, a Counter effect, a When Attacking redirect).
       * The attack itself was declared by an earlier event, so the client re-aims what is
       * already on screen — the arrow, the open attack — instead of narrating a new
       * declaration: no second sound, announcement, feed entry or log line.
       */
      redirected?: boolean;
    }
  | {
      kind: "blockWindowOpened";
      attackerPermanentId: string;
      eligibleBlockerIds: string[];
      /**
       * ＜Collision＞ (§16-30): the defending player is forced to block whenever able, so
       * declining is illegal while an eligible blocker exists. The server enforces it either
       * way; the flag is what lets the client stop offering a choice it will reject.
       */
      mustBlock?: boolean;
    }
  | { kind: "blocked"; blockerPermanentId: string }
  | { kind: "blockDeclined"; attackerPermanentId: string }
  // §11-3 Counter Timing: opened after When Attacking effects resolve and before block
  // timing, for the defending seat to optionally activate 1 [Counter] effect (§11-3-2).
  | {
      kind: "counterWindowOpened";
      attackerPermanentId: string;
      defendingSeat: Seat;
      eligibleCounters: CounterChoice[];
    }
  | { kind: "counterResolved"; attackerPermanentId: string; activated: boolean }
  // ＜Alliance＞ (Comprehensive Rules §16-24) is attack-only; there is no block-time variant.
  | { kind: "alliancePrompt"; permanentId: string; eligibleAllyIds: string[] }
  | { kind: "allianceResolved"; permanentId: string } // the ＜Alliance＞ decision was answered (chosen or passed); dismisses the prompt overlay
  | { kind: "evadePrompt"; permanentId: string }
  | { kind: "evadeResolved"; permanentId: string; accepted: boolean }
  | { kind: "barrierPrompt"; permanentId: string }
  | { kind: "barrierResolved"; permanentId: string; accepted: boolean }
  /** A permanent battle, before optional deletion protection.
   * Losers are deletion candidates after unconditional immunity, and may still survive
   * Barrier/Evade/etc. combatResolved carries a declared attack's final deletions.
   * `effectBattle` marks a battle an effect started (for example EX13-076): it is never the
   * open attack's own battle, even against the same pair, and closes no attack. */
  | {
      kind: "battleCompared";
      attackerPermanentId: string;
      defenderPermanentId: string;
      loserPermanentIds: string[];
      effectBattle?: EffectBattleParticipants;
    }
  | { kind: "combatResolved"; seat: Seat; attackerPermanentId: string; deletedPermanentIds: string[] }
  /**
   * The attack `attackDeclared` opened is over, after End of Attack and after any
   * `combatResolved`. Sent once for every attack, including one that ends with no battle and
   * no security card checked: an attacker with ＜Security Attack -1＞, an attack ended by an
   * effect, or a target that left the field. Close anything kept open for the attack here.
   * Not sent when the attack ended the game: `gameOver` is then the last event.
   */
  | { kind: "attackEnded"; seat: Seat; attackerPermanentId: string }
  /**
   * A deletion (or leave) that a keyword paid to prevent: ＜Scapegoat＞, ＜Decoy＞, ＜Guard＞,
   * ＜Fragment＞, ＜Armor Purge＞, and a ＜Delay＞ Option that keeps a Digimon on the field. Unlike ＜Evade＞ and ＜Barrier＞, these have no prompt
   * event of their own — without this, the client sees only the cost card leaving and a
   * battle that quietly failed, and the viewer is never told which keyword saved what.
   * Emitted only when the prevention actually happened; a declined prompt emits nothing.
   */
  | {
      kind: "deletionPrevented";
      keyword: PreventionKeyword;
      /** Controller of the permanent that was saved. */
      seat: Seat;
      /** The permanent whose deletion was prevented. */
      permanentId: string;
      /** Its public identity, kept so the notice survives the card later leaving. */
      cardId?: string;
      /** The Digimon deleted to pay for it (＜Decoy＞, ＜Scapegoat＞, ＜Guard＞). */
      paidPermanentId?: string;
      /** Its public identity, captured before the payment removes it from the battle area. */
      paidCardId?: string;
    }
  | {
      // The top security card was turned face up. Emitted the moment the card is flipped —
      // before its [Security] effect, before the triggers the check fires, and before the
      // battle — so the client can show WHICH card was revealed at the moment of the attack
      // and play everything that follows from it as a consequence. `securityChecked` closes
      // the same check and carries the outcome; there is exactly one of each, in this order.
      kind: "securityRevealed";
      artId?: string;
      attackerArtId?: string;
      securityCardDP?: number;
      attackerDP?: number;
      seat: Seat;
      revealedCardId: string;
      attackerPermanentId: string;
      /**
       * Presentation hints known at the reveal, so the client can stage the card the way
       * the reference client does: a card with a [Security] effect docks at the side of the
       * screen while the effect resolves; a Security Digimon holds centre-stage for its
       * battle; anything else is simply shown and trashed. Absent on events from older
       * servers or replays, in which case the client falls back to the `securityChecked`
       * resolution.
       */
      hasSecurityEffect?: boolean;
      isDigimon?: boolean;
      /**
       * How many cards the defender's stack held as this one was turned over, this one
       * included. A state patch can carry several checks at once, so the figure the shield
       * shows while each card is revealed comes from the event, not the board. Absent on
       * events from older servers or replays.
       */
      securityCountBefore?: number;
    }
  | {
      kind: "securityChecked";
      artId?: string;
      attackerArtId?: string;
      seat: Seat;
      revealedCardId: string;
      resolution: "effect" | "battle" | "trashed";
      /** The DP compare, present exactly when a compare happened (`resolution === "battle"`
       * and the attacker was still on the field at the compare). */
      battle?: SecurityBattleResult;
    }
  | { kind: "securityRecovered"; seat: Seat; amount: number }
  // A seat's deck or egg deck was randomized. Emitted from the engine's single deck-shuffle
  // helper (`setup.shuffleDecks`), which is the only thing in the game that shuffles a deck:
  // every printed "shuffle" in the card pool shuffles a SECURITY stack instead, and §3-2-3
  // forbids reordering a deck otherwise. Carries no card identity, so it reveals nothing.
  | { kind: "deckShuffled"; seat: Seat; deck: "deck" | "eggDeck" }
  | { kind: "cardRevealed"; seat: Seat; cardId: string; artId?: string; sourceCardId?: string }
  | {
      /** Public field targets, before deletion prevention interrupts the resolving effect. */
      kind: "effectTargetsSelected";
      seat: Seat;
      sourcePermanentId: string;
      targetPermanentIds: string[];
    }
  | {
      kind: "effectActivated";
      seat: Seat;
      sourceCardId: string;
      effectKey: string;
      description: string;
      /** Main action completed; accepted activation is narrated by its effectTriggered lifecycle. */
      receiptOnly?: true;
    }
  | {
      // An effect accepted its processing. Emitted before its first cost/result mutation,
      // after any initial optional activation question. Pending questions explain their
      // own source/clause; declining them never opens a public effect lifecycle.
      kind: "effectTriggered";
      /** A leave prevention resolves before its source's attempted removal. */
      beforeRemoval?: boolean;
      seat: Seat;
      sourceCardId: string;
      /** Physical source and host; distinguish identical cards on the same seat. */
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      effectKey: string;
      description: string;
      effectTextPart?: string;
      timing?: string;
      /** Printed clause timing, separate from the watcher event that fired. */
      printedTiming?: string;
      /**
       * The clause lives in the source card's inherited text box. Some timings appear in
       * both text boxes, so without this the client can only guess which box to quote.
       */
      isInherited?: boolean;
      /**
       * The effect fired while a security check was resolving. Most such effects precede
       * `securityChecked`; a losing attacker's [On Deletion] reactions follow it. The flag
       * lets the client hold what they announce until the checked card's reveal has
       * actually been shown.
       */
      duringSecurityCheck?: boolean;
    }
  | {
      // A seat answered an `orderTriggers` prompt. Public, so the other client can show which
      // pending effects are about to resolve, and in what order, while the chain plays out.
      kind: "resolutionOrderChosen";
      seat: Seat;
      /**
       * The effects the answer puts next, first to resolve first. A full resolution plan lists
       * every offered effect; a single pick lists only the one chosen, because the order of
       * the rest is not decided yet.
       */
      entries: ResolutionOrderEntry[];
    }
  | {
      // The controller chose one option of an "activate 1 of the effects below" clause.
      // Sent before that option resolves, so the client can say which bullet is happening.
      kind: "effectOptionChosen";
      seat: Seat;
      sourceCardId: string;
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      timing?: string;
      isInherited?: boolean;
      /** The chosen option's printed bullet, without the leading "・". */
      clause: string;
    }
  | {
      kind: "effectClauseAdvanced";
      effectKey?: string;
      seat: Seat;
      sourceCardId: string;
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      timing?: string;
      isInherited?: boolean;
      clause: string;
    }
  | {
      // A triggered effect (On Play / When Digivolving / On Deletion / ...) finished
      // resolving. `timing` is the enum member name (e.g. "OnPlay") so the client can
      // slice the matching printed clause out of the card's effect text for a transient
      // overlay. Distinct from `effectActivated`, which is a [Main] activated ability.
      kind: "effectResolved";
      seat: Seat;
      sourceCardId: string;
      digivolutionPerformed?: boolean;
      /** Physical source and host copied from the matching `effectTriggered`. */
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      effectKey: string;
      description: string;
      timing?: string;
      /** The clause lives in the source card's inherited text box (see `effectTriggered`). */
      isInherited?: boolean;
    }
  | {
      // A triggered effect's condition was met, but it had nothing it could do (a cost-free
      // "you may" with no legal target), so it was never offered and opened no lifecycle.
      // Log-only: it tells the players the trigger was not ignored.
      kind: "effectHadNoEffect";
      seat: Seat;
      sourceCardId: string;
      sourceInstanceId?: string;
      sourcePermanentId?: string;
      effectKey: string;
      description: string;
      timing?: string;
      isInherited?: boolean;
    }
  | {
      // Generic zone movement for the log. Identity-free by default: the event is
      // broadcast the instant it happens, which is normally BEFORE the state patch
      // that lands the cards in their destination, so a client cannot reliably
      // resolve `instanceIds` against its own zone index at delivery time.
      kind: "cardsMoved";
      /** Identity-free movement of face-down deck cards under a field permanent. */
      deckToUnder?: { seat: Seat; permanentId: string; count: number };
      /** The field permanent whose digivolution cards received these cards. */
      placedUnder?: { permanentId: string };
      /** Actual deleted field cards, captured before removal; excludes their supporting cards. */
      deletedPermanents?: {
        permanentId: string;
        instanceId: string;
        cardId: string;
        artId?: string;
        seat: Seat;
      }[];
      /**
       * Field permanents a move returned whole to hand or deck, captured before removal so the client
       * can send each one from where it stood. Absent for cards returned from any other zone.
       */
      returnedPermanents?: {
        permanentId: string;
        instanceId: string;
        cardId: string;
        artId?: string;
        seat: Seat;
      }[];
      /**
       * Option permanents trashed from the battle area (a ＜Delay＞ paying its cost, an effect
       * trashing an Option), captured before removal. Trashing is not deletion (CR 4-16-3), so
       * they never appear in `deletedPermanents`; the client still shows them leaving the field.
       */
      trashedPermanents?: {
        permanentId: string;
        instanceId: string;
        cardId: string;
        artId?: string;
        seat: Seat;
      }[];
      /**
       * Top cards stripped off a permanent that stays on the field (＜De-Digivolve＞, or an
       * effect that trashes stack tops, or an Armor Purge cost). The permanent was not
       * deleted, so it gets no
       * `deletedPermanents` entry; `cardIds` and `seat` name the stripped cards and their owner.
       */
      strippedStackTops?: {
        permanentId: string;
        reason: "deDigivolve" | "trashTop" | "armorPurge";
        /** One atomic stripping invocation; each move waits for its matching resolved top. */
        sequenceId?: string;
        /** The card whose effect stripped the stack, when an effect did. */
        sourceCardId?: string;
      };
      /**
       * Digivolution cards an effect trashed from under a permanent that stays on the field.
       * `hostCardId` is the permanent's top card, so the client can name the Digimon that lost
       * them; `cardIds` and `seat` name the trashed cards and their owner.
       */
      trashedSources?: {
        permanentId: string;
        hostCardId: string;
        /** Public field DP before paying Digi-Burst, held until its source removal is shown. */
        digiBurstDpBefore?: { permanentId: string; currentDP: number }[];
        /** The card whose effect trashed them, when an effect did. */
        sourceCardId?: string;
      };
      /** A scheduled turn-end deletion, attributed to the card that installed it. */
      turnEndDeletion?: { sourceCardId: string; deletedCardId: string };
      /**
       * The battle itself deleted these permanents — the blow the attack landed, not an
       * effect that fired around it. `combatResolved` names the same losers, but it is held
       * until the attack reaches its end-of-attack seam, and a decision inside an [On
       * Deletion] trigger can strand it several batches (and a prompt) behind the deletion.
       * The client stages the clash from this flag so the blow plays while its loser is
       * still on the board.
       */
      battleDeletion?: true;
      /** A draw, another hand addition, or an internal bridge to an immediate play/use.
       * Carries no card identity. A staging move is not a visible hand arrival. */
      handAddition?: "draw" | "transfer" | "staging";
      deckReturnOrder?: true;
      /** These cards were the security card being checked, so they left security at its reveal. */
      fromSecurityCheck?: true;
      /** Automatic bonus draw from digivolution, rather than a card effect. */
      drawReason?: "digivolution";
      /** The card finished resolving after it was used as an Option, not discarded by an effect. */
      optionUsed?: true;
      instanceIds: string[];
      from: string;
      fromSeat?: Seat;
      fromHost?: { permanentId: string; hostCardId: string };
      to: string;
      /**
       * Card identities, in `instanceIds` order — present only when the movement
       * itself makes them public (an effect trashing security cards turns them face
       * up in a public trash). Carried on the event so the destruction scene and the
       * panel can name the cards without racing the state patch.
       */
      cardIds?: string[];
      artIds?: string[];
      /**
       * The seat whose zone the movement is about, when the event names one: the stack
       * the cards left (with `cardIds`, an effect trashing security cards) or the stack
       * they joined (an effect adding to security, whose face-down cards stay unnamed).
       */
      seat?: Seat;
    }
  | {
      /** Passive derivation after one physical peel, without a new effect/rules window. */
      kind: "stackTopResolved";
      sequenceId: string;
      permanentId: string;
      strippedInstanceId: string;
      topInstanceId: string;
      baseDP: number;
      currentDP: number;
    }
  | { kind: "turnEnded"; endingSeat: Seat; nextSeat: Seat; turnCount: number } // turn transition overlay
  | {
      kind: "actionRejected";
      intent: string;
      reason: string;
      /** Correlates a refused answer with the decision the client optimistically closed. */
      decisionId?: string;
    } // sent to the offending client only
  | {
      kind: "gameOver";
      // A discriminated `result` — rather than a bare `winnerSeat: Seat` with a
      // -1 sentinel, or `winnerSeat: Seat | -1` — so a draw can't be silently
      // misread as seat -1 winning: every consumer must branch on `outcome`
      // before it can reach a `winnerSeat`, so the type checker catches a
      // consumer that forgets the draw case instead of it shipping a UI bug.
      result: { outcome: "win"; winnerSeat: Seat } | { outcome: "draw" };
      reason: "security" | "deckOut" | "surrender" | "effect" | "timeout";
    }
  | {
      /**
       * Sent once, right after `gameOver`: every zone that stayed hidden during the match, for
       * both players, so the board can be reviewed in full. Order is the zone's own order, top
       * first (`deck[0]` and `security[0]` are the top cards).
       */
      kind: "finalReveal";
      players: FinalRevealPlayer[];
    }
  | {
      /**
       * The room finished everything one entry into the engine produced. It is sent after
       * the state patch carrying that batch's mutations, so a client that groups cues by
       * `batch` knows the board it is narrating over.
       */
      kind: "batchClosed";
      batch: string;
      stateVersion: number;
      /** `seq` of the last event of the batch, so a client can tell a gap from a short batch. */
      lastSeq: number;
    };

export type ServerEventKind = ServerEvent["kind"];

/**
 * One event as it travels on EVENT_CHANNEL. An intersection rather than a wrapper object,
 * so every existing consumer keeps reading `event.kind` and its payload unchanged.
 *
 * - `seq` — monotonic per room, starting at 1, with no gaps. A gap means a lost message.
 * - `batch` — the batch this event belongs to; every batch is ended by a `batchClosed`.
 * - `stateVersion` — the room's state revision this event was emitted under.
 */
export type SequencedServerEvent = ServerEvent & {
  seq: number;
  batch: string;
  stateVersion: number;
};

/**
 * Runtime enumeration of ServerEventKind, pinned to the type in both directions the
 * same way DECISION_KINDS is: `satisfies` rejects an entry that isn't a real kind, and
 * `_ServerEventKindsComplete` rejects a kind missing from this array.
 *
 * It exists so the client can assert that every event the server can send reaches a
 * player-facing surface (match log, opponent action feed, combat-prompt overlay) or is
 * listed as deliberately silent — see uiCompleteness.test.ts. Without it, a new event
 * kind could ship narrating nothing and no test would notice.
 */
export const SERVER_EVENT_KINDS = [
  "manualAction",
  "matchStarted",
  "phaseChanged",
  "cardPlayed",
  "digivolved",
  "hatched",
  "movedFromBreeding",
  "memoryChanged",
  "attackDeclared",
  "blockWindowOpened",
  "blocked",
  "blockDeclined",
  "counterWindowOpened",
  "counterResolved",
  "alliancePrompt",
  "allianceResolved",
  "evadePrompt",
  "evadeResolved",
  "barrierPrompt",
  "barrierResolved",
  "battleCompared",
  "combatResolved",
  "attackEnded",
  "deletionPrevented",
  "securityRevealed",
  "securityChecked",
  "securityRecovered",
  "deckShuffled",
  "cardRevealed",
  "effectTargetsSelected",
  "effectActivated",
  "effectTriggered",
  "resolutionOrderChosen",
  "effectOptionChosen",
  "effectClauseAdvanced",
  "effectResolved",
  "effectHadNoEffect",
  "dpModifierApplied",
  "cardsMoved",
  "stackTopResolved",
  "turnEnded",
  "actionRejected",
  "gameOver",
  "finalReveal",
  "batchClosed",
] as const satisfies readonly ServerEventKind[];

type _ServerEventKindsComplete =
  Exclude<ServerEventKind, (typeof SERVER_EVENT_KINDS)[number]> extends never ? true : never;
const _serverEventKindsComplete: _ServerEventKindsComplete = true;
void _serverEventKindsComplete;

export interface FinalRevealCard {
  cardId: string;
  artId: string;
}

export interface FinalRevealPlayer {
  seat: Seat;
  hand: FinalRevealCard[];
  deck: FinalRevealCard[];
  eggDeck: FinalRevealCard[];
  security: FinalRevealCard[];
}

/**
 * `cardsMoved.to` for a return that lands UNDER the whole deck rather than on top.
 *
 * Not a {@link Zone} member: the deck bottom is a POSITION within the deck, while `Zone`
 * members are the storage arrays the engine switches on (`zoneArrayOf`), so adding one there
 * would push a non-array through every one of those switches. `cardsMoved.to` is a free-form
 * display label that no rules code branches on, which is why the position is safe to name here.
 */
export const DECK_BOTTOM = CardMovePosition.DECK_BOTTOM.value;

/**
 * The ServerEvent kinds answered by a dedicated intent (declareBlock/
 * declineBlock, respondCounter, respondAlliance, respondEvade, respondBarrier)
 * rather than respondDecision. `satisfies` pins each entry to a real
 * ServerEventKind, so renaming or removing one of these in the ServerEvent union
 * fails typecheck here; see the UI completeness invariant in API-CONTRACT.md for
 * how new combat-prompt events get UI coverage enforced (uiCompleteness.test.ts).
 */
export const COMBAT_PROMPT_EVENTS = [
  "blockWindowOpened",
  "counterWindowOpened",
  "alliancePrompt",
  "evadePrompt",
  "barrierPrompt",
] as const satisfies readonly ServerEventKind[];

export type CombatPromptEvent = (typeof COMBAT_PROMPT_EVENTS)[number];

/**
 * What the action currently resolving will do to the permanents it is asking the
 * player to pick. Projected by the engine from the IR action kind alone (there is
 * one dispatch point, `runAction`), so the client can badge a chosen target with
 * its coming fate instead of guessing one out of the prompt's printed English.
 * Display-only: nothing in the rules reads it back.
 */
export type TargetFate =
  | "delete"
  | "trash"
  | "returnToHand"
  | "returnToDeck"
  | "returnToEggDeck"
  | "suspend"
  | "unsuspend"
  | "digivolve";

/**
 * Sent on the dedicated "decision" channel when the engine pauses for input. The
 * engine awaits the matching respondDecision intent (correlated by decisionId).
 */
export interface DecisionRequest {
  decisionId: string;
  seat: Seat;
  /**
   * The state revision this decision was raised at: the `stateVersion` the batch that
   * raised it closes with. The client's presentation queue uses it as a barrier — it
   * fast-forwards up to that revision before showing the prompt, so the board the
   * viewer answers over is the board the question was asked about.
   */
  stateVersion?: number;
  kind: "optional" | "chooseTargets" | "selectCards" | "orderCards" | "orderTriggers" | "chooseOption" | "mulligan";
  promptText: string;
  /** The card whose effect is asking for input (so the client can show its name/sigil/text without guessing from the event log). */
  sourceCardId?: string;
  sourceInstanceId?: string;
  sourcePermanentId?: string;
  // kind-specific options the UI needs to render the prompt and constrain input:
  options?: {
    selectionGoal?: DecisionSelectionGoal;
    effectControllerSeat?: Seat;
    singleHandCostBenefit?: SingleHandCostBenefit;
    effectSummary?: DecisionEffectSummary;
    choiceSummaries?: (DecisionEffectSummary | null)[];
    triggerSummaries?: (DecisionEffectSummary | null)[];
    triggerControllerSeats?: Seat[];
    candidateInstanceIds?: string[]; // selectable cards/permanents
    visibleInstanceIds?: string[]; // full display set (e.g. all revealed cards); ids absent from candidateInstanceIds render disabled
    /** Authoritative identities for temporarily revealed cards that may not yet exist in the client's zone index. */
    visibleCards?: { instanceId: string; cardId: string; artId?: string }[];
    /** Offered readable trash cards with a still-pending discarded-source effect; not a promised outcome. */
    pendingEffectInstanceIds?: string[];
    min?: number;
    max?: number; // selection count bounds
    maxTotalPlayCost?: number; // summed printed play-cost budget for multi-card selections
    allowedTargetCombinations?: string[][];
    maxTotalDP?: number; // summed live-DP budget for aggregate permanent selections
    differentColors?: boolean; // prevent selecting cards that share a color with an already-picked card
    distinctCardIds?: boolean; // prevent selecting multiple instances with the same card number
    distinctNames?: boolean; // prevent selecting cards sharing a name, including exact-name aliases
    /** Lets the client present a dedicated interaction without inferring semantics from prompt text. */
    selectionContext?: "attackSource" | "attackTarget" | "partitionActivation" | "materialSaveActivation";
    orderDestination?: "deckTop" | "deckBottom" | "stackTop" | "stackBottom"; // explains how ordered positions map to the destination
    choices?: string[]; // modal labels for chooseOption
    /** `chooseOption` only: the zone whose ends the "top" and "bottom" choices name. */
    topBottomZone?: "digivolutionCards" | "security" | "deck";
    /**
     * `chooseOption` only: the choice is which digivolution requirement an effect-driven
     * digivolution uses. `costs` aligns with `choices`; `costDelta` is the effect's own
     * signed adjustment (negative = reduction), so the client can show "4 − 2 = 2".
     */
    digivolveCostChoice?: {
      fromCardId: string;
      intoCardId: string;
      intoArtId?: string;
      costs: number[];
      costDelta: number;
    };
    /**
     * `chooseOption` only: the index into `choices` of the entry that declines the optional
     * effect instead of choosing one of its options. Answering with it is the same as
     * answering "no" to an `optional` prompt, and it is the timeout default. Absent when
     * every choice is a real option.
     */
    declineIndex?: number;
    activation?: { index: number; total: number };
    /** Aligned to `choices` when each choice is a printed effect of a card: the client shows the card and its clause. */
    choiceEffects?: { cardId: string; timing?: string; isInherited?: boolean }[];
    /**
     * Aligned to `choices` when the resolving clause prints one bullet per option: the printed
     * bullet of each choice. An empty string marks an entry with no printed text (the decline).
     */
    choiceClauses?: string[];
    triggerKeys?: string[]; // pending choices for orderTriggers; see `acceptsResolutionPlan` for how many to send
    triggerCardIds?: string[]; // authoritative source card for each triggerKeys entry
    /**
     * Firing window of each `triggerKeys` entry (e.g. "OnPlay", "WhenDigivolving"),
     * aligned by index; an empty string marks an entry the engine has no timing for.
     * Two triggers of the SAME permanent differ only by this, so the chooser needs it
     * to tell them apart without inventing a "copy" that is not on the board.
     */
    triggerTimings?: string[];
    triggerDescriptions?: string[];
    /**
     * Aligned to `triggerKeys`: the printed trigger condition that armed a watcher entry ("When
     * effects trash cards from under this Tamer"). A card whose one clause lists several
     * conditions pends once per event, and the description alone cannot tell those apart. An
     * empty string marks an entry with no separate condition.
     */
    triggerReasons?: string[];
    /** Whether each pending activation belongs to the inherited text box. */
    triggerIsInherited?: boolean[];
    /**
     * Whether each pending activation can ask its controller a yes/no question, aligned to
     * `triggerKeys`. Only a display hint for the per-effect Ask/Yes/No preset; a preset sent
     * for an entry marked false is accepted and simply never consulted.
     */
    triggerIsOptional?: boolean[];
    /**
     * `orderTriggers` only: the controller's older pending effects. They triggered earlier and
     * resolve after every offered entry (CR §15-4-5-2/3), so the prompt lists them without
     * letting the player pick them. Aligned with each other, not with `triggerKeys`.
     */
    waitingTriggerCardIds?: string[];
    waitingTriggerDescriptions?: string[];
    waitingTriggerIsInherited?: boolean[];
    /**
     * `orderTriggers` only: the engine accepts a resolution plan — the full order for the
     * offered entries plus preset yes/no answers — instead of exactly one key. Absent on
     * prompts that only read the first key (simultaneous would-leave replacements).
     */
    acceptsResolutionPlan?: boolean;
    acceptsIndexedResolutionPlan?: boolean;
    timing?: string; // printed timing label of the resolving effect (e.g. "On Play"), for the overlay to show only that clause
    /** Exact clause that raised this decision, preserving main/inherited provenance without client-side guessing. */
    effectText?: string;
    /** Printed card supplying copied effect text; does not change the effect's rules source. */
    effectTextCardId?: string;
    /** Exact resolving clause identity, including installed reactive effects. */
    effectKey?: string;
    /** Optional question accepts this effect's activation; false for choices inside an active effect. */
    activationConfirmation?: boolean;
    /** Verbatim printed passage associated with this decision. */
    effectTextPart?: string;
    /** Passage emphasized within the complete resolving clause. Display-only. */
    effectTextEmphasis?: string;
    isInherited?: boolean;
    /** What the resolving action will do to the permanents picked here (`chooseTargets` only). */
    targetFate?: TargetFate;
    /** Public board permanents already selected by the effect that opened this follow-up decision. */
    affectedPermanentIds?: string[];
    /** Client-translated prompt text; `digivolveHost` asks which card an effect digivolves. */
    promptKey?: "activateBlitz" | "attackAlreadyResolving" | "digivolveHost";
    /**
     * Why the engine is asking. `"cost"` means the selection IS the payment of a cost the
     * resolving clause charges, so declining it (an empty selection on a `min: 0` request)
     * forfeits the whole clause. A request without this field is an ordinary target/effect
     * choice. The two are otherwise indistinguishable from the request shape — both arrive
     * as `selectCards` over the controller's own cards — which is exactly what an automated
     * seat needs to tell apart before answering.
     *
     * `"acceptedOptional"` marks a pick of an action whose "you may" the controller already
     * accepted. A `min: 0` there only lets the player back out; an empty answer does nothing.
     * `"optionalTarget"` asks the activation choice itself through a zero-to-one target pick.
     */
    purpose?: "cost" | "acceptedOptional" | "optionalTarget";
    declinesCost?: boolean;
    canCancelActivation?: boolean;
    /** Effect-driven play awaiting the existing Assembly material picker for this card. */
    assemblyCardId?: string;
    /** Authoritative prohibition applied to this effect-driven material declaration. */
    playCostReductionBlocked?: boolean;
    /** Effect-driven play awaiting the existing DigiXros material picker for this card. */
    digiXrosCardId?: string;
    /** Already-authorized material groups and quotas for an effect-driven DigiXros picker. */
    digiXrosMaterialLimits?: { candidateInstanceIds: string[]; max: number }[];
    /** Paid source cards that will enter trash before this DigiXros is placed. */
    digiXrosRuleTrashInstanceIds?: string[];
  };
}

export type DecisionKind = DecisionRequest["kind"];

/**
 * Runtime enumeration of TargetFate, pinned to the type the same way DECISION_KINDS
 * is: a fate added to the union without a client badge fails typecheck here.
 */
export const TARGET_FATES = [
  "delete",
  "trash",
  "returnToHand",
  "returnToDeck",
  "returnToEggDeck",
  "suspend",
  "unsuspend",
  "digivolve",
] as const satisfies readonly TargetFate[];

type _TargetFatesComplete = Exclude<TargetFate, (typeof TARGET_FATES)[number]> extends never ? true : never;
const _targetFatesComplete: _TargetFatesComplete = true;
void _targetFatesComplete;

/**
 * Runtime enumeration of DecisionKind, pinned to the type in both directions:
 * `satisfies` rejects an entry that isn't a real DecisionKind, and
 * `_DecisionKindsComplete` below rejects a DecisionKind missing from this
 * array. A UI decision-kind renderer added without updating this list — or a
 * new DecisionRequest.kind added without a UI renderer — fails typecheck or
 * apps/web/src/game/decisionContract.test.tsx, which also requires every
 * `options` field to name the web module that reads it.
 */
export const DECISION_KINDS = [
  "optional",
  "chooseTargets",
  "selectCards",
  "orderCards",
  "orderTriggers",
  "chooseOption",
  "mulligan",
] as const satisfies readonly DecisionKind[];

type _DecisionKindsComplete = Exclude<DecisionKind, (typeof DECISION_KINDS)[number]> extends never ? true : never;
const _decisionKindsComplete: _DecisionKindsComplete = true;
void _decisionKindsComplete;
