import type { SingleHandCostBenefit } from "@aegis/shared/protocol/SingleHandCostBenefit";
import type { Action, ActivateForeignEffectOverrides, CardInstance, Seat, TargetFate } from "@aegis/shared";
import type { CardSource } from "../CardSource.js";
import type { DecisionApi } from "./decisions.js";
import type { GameAccess } from "./gameAccess.js";
import type { Primitives } from "./primitives/index.js";
import type { DiscardedStackSourceProof, TriggerInfo } from "./triggers.js";
import type { DecisionEffectSummary } from "@aegis/shared/protocol/DecisionEffectSummary";
import type { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";

/**
 * What canTrigger / canActivate / resolve receive at runtime
 * (card-module contract).
 */
export interface EffectContext {
  activeSingleHandCostBenefit?: SingleHandCostBenefit;
  activeDecisionSummary?: DecisionEffectSummary;
  activeDecisionSelectionGoal?: DecisionSelectionGoal;
  /** Exact permanent rotated by a compound cost still resolving. */
  pendingRotationHostPermanentId?: string;
  source: CardSource;
  /** Original host for "this Digimon" targets; moving its source into a different
   * permanent during resolution must not transfer those targets (BT21-021 Q4727). */
  sourcePermanentIdAtCreation?: string;
  /** Placement proof for an inherited source discarded from its live host during this event. */
  discardedStackSourceProof?: DiscardedStackSourceProof;
  /**
   * Rules identity of the effect currently resolving when it differs from the physical
   * card's combined kinds. For example, a DUAL Digimon directly activating its Option-side
   * [Main] produces an Option effect (BT25-104 Q6496-Q6498).
   */
  effectSourceKinds?: readonly string[];
  trigger: TriggerInfo;
  /**
   * Printed timing of the effect currently resolving (the IR `CardEffect.trigger`, e.g. "OnPlay").
   * Set by `runEffect`; surfaced on each DecisionRequest so the client overlay can show only the
   * relevant printed clause instead of the card's full effect text. Display-only.
   */
  activeTiming?: string;
  /**
   * The clause resolving now is optional and its only gate is a cost the controller pays by
   * picking cards. The selection is the question, so it is always asked and may be answered
   * with nothing — which declines the clause. Set by `runEffect` from the built effect's
   * `costIsTheQuestion`; read by `payCost`.
   */
  costIsTheQuestion?: boolean;
  /** A public Main declaration has committed this resolution's leading processing condition. */
  declaredProcessingCondition?: boolean;
  /** Internal marker for effects re-derived by the continuous-effect pass. */
  continuousPass?: boolean;
  /** Registering a resident clause at a payment window; cleared for future triggered bodies. */
  residentCostRegistration?: boolean;
  isResidentCostSourceActive?: () => boolean;
  /** Exact rules clause currently resolving, including inherited/security provenance. Display-only. */
  activeEffectText?: string;
  /** Catalog provenance for a copied clause, independent of its activating rules source. */
  activeEffectTextCardId?: string;
  activeEffectTextPart?: string;
  activeEffectTextEmphasis?: string;
  activeEffectIsInherited?: boolean;
  /**
   * Context-specific rules applied while a borrowed CardEffect resolves. This is seeded only by
   * an ActivateForeignEffect action and never mutates the lender's compiled IR.
   */
  borrowedEffectOverrides?: ActivateForeignEffectOverrides;
  /** Stable compiled effect identity used by installed reactive actions; never derived from prose. */
  activeEffectKey?: string;
  /** Stable zero-based action path within the active compiled effect. */
  activeActionPath?: string;
  /** Optional By decisions made before this effect's actions resolve (§15-1-2). */
  predecidedOptionalActions?: Map<Action, boolean>;
  /** Optional cost choices made before the first action; payment still occurs in order. */
  predecidedOptionalCosts?: Map<Action, boolean>;
  costDeclinedAtSelection?: Set<Action>;
  payingDeclinableCost?: boolean;
  /**
   * The option an optional Modal's combined "which option, or don't use?" prompt already chose
   * (see `declinableModalChoices`). `runModal` consumes it instead of asking again.
   */
  preselectedModalOption?: { action: Action; optionIndex: number };
  /** Cost card/permanent IDs chosen before an effect starts, replayed at payment. */
  predecidedCostSelections?: Map<Action, readonly string[]>;
  /** The action whose cost is currently resolving, for replaying one preselected payment. */
  activeCostDecisionAction?: Action;
  /**
   * What the IR action currently running will do to the permanents it asks the controller
   * to pick (`targetFateOf`, set and restored by `runAction`). Surfaced on each
   * `chooseTargets` request so the client can badge a picked target with its coming fate.
   * Display-only.
   */
  activeTargetFate?: TargetFate;
  /** Public board targets whose pending removal caused a nested prevention decision. Display-only. */
  affectedPermanentIds?: readonly string[];
  /** The selected permanent will become the attacker; it is not a target of the source card. */
  activeSelectionContext?: "attackSource";
  /**
   * How many `payCost` frames are currently on the stack. Non-zero means every decision
   * raised right now is asking the controller to PAY a cost, not to pick a target — the
   * two are indistinguishable from the request shape alone (both arrive as `selectCards`
   * over the controller's own cards). Costs nest (a `digivolve` cost runs its own cost
   * inside), so this is a depth counter rather than a boolean; `payCost` increments on
   * entry and restores in a `finally`. Surfaced as `purpose: "cost"` on the request.
   */
  payingCostDepth?: number;
  /**
   * Set while an action whose "you may" the controller already accepted asks for its pick. The
   * controller's single-card picks then accept zero cards as a back-out. Surfaced as
   * `purpose: "acceptedOptional"`.
   */
  pickingAcceptedOptional?: boolean;
  optionalActivationCancellation?: { available: boolean };
  /** This target selection is the optional action's activation choice. */
  selectingOptionalTarget?: boolean;
  /** Temporary restrictions installed by a RestrictEffect action in this resolution. */
  effectRestrictions?: Set<string>;
  game: GameAccess;
  fx: Primitives;
  ask: DecisionApi;
  /** Shared per-turn use ledger, exposed for passive effects whose use is consumed at payment. */
  usage?: {
    count(instanceId: string, effectKey: string): number;
    register(instanceId: string, effectKey: string): void;
  };
  /**
   * Re-entrantly resolves the current timing window. Only the completed pre-Counter
   * attack drain retires its unactivatable remainder; ordinary drains leave it pending
   * while an unfinished effect can still make a processing cost payable.
   */
  drainCurrentTimingWindow?: (options?: { retireUnactivatable?: boolean }) => Promise<void>;
  /**
   * Resume the remaining actions of this effect immediately after an effect-driven attack is
   * declared. Combat invokes this before declaration-triggered effects and before Counter Timing.
   */
  continueEffectAfterAttackDeclaration?: () => Promise<void>;
  /**
   * Per-effect-resolution store for `SelectBind` targets: handle (e.g. "A") -> the chosen
   * permanentId. Populated when a `SelectBind` action resolves and read by a later action's
   * `Filter.relativeTo.selectionRef` / `Target.fromSelectionRef` / `PlaceUnder.underSelectionRef`
   * ("select A, then act on B with DP <= A's"). Fresh per `runEffect`; absent means no binding.
   */
  selections?: Map<string, string>;
  /**
   * Loose card instances already committed to the action currently being declared. Cost
   * selection must not reuse one of them (for example, an under-Tamer card chosen as the
   * imminent digivolution card cannot also pay a would-digivolve placement cost).
   */
  reservedCostInstanceIds?: ReadonlySet<string>;
  /**
   * Attribute snapshot of each `SelectBind` target, taken at the moment it was bound. A clause
   * that deletes the chosen Digimon and then compares against it ("delete it and 1 of your
   * opponent's Digimon with as much or less DP as it" — BT16-070) still needs those attributes
   * after the permanent has left the board, where `selections` alone resolves to nothing.
   */
  selectionFacts?: Map<
    string,
    { dp?: number; level?: number; playCost?: number; digivolutionCount?: number; names?: readonly string[] }
  >;
  /**
   * When set, this effect is conferred from a digivolution-stack card onto
   * `conferredToPermanentId` (GrantStatic grant:"effects").
   */
  conferredToPermanentId?: string;
  /** Physical source of the GrantStatic copy, used to preserve independent Q1943 frequency. */
  conferralGranterInstanceId?: string;
  /**
   * Effect-RESULT bindings, scoped to the CURRENT effect resolution (fresh per `runEffect`,
   * like `selections`). A producing action writes its outcome here so a SUBSEQUENT gating
   * Condition ("if this effect didn't delete / used / digivolved") can read it. Generalizes
   * the established `endAttack()`-returns-bool precedent. Built once (08-01), reused by 08-03
   * (delete-outcome), 08-06 (option-use), 08-08 (digivolve-result).
   *
   * `lastDeleteCount`: permanents ACTUALLY removed by the most recent Delete in this resolution
   *   (an immune/prevented target contributes 0 — KB BT23-069 Q5338). Undefined => no Delete ran.
   * `lastDigivolveResult`: whether the most recent digivolve in this resolution happened.
   * `lastOptionUsed`: whether an Option-use happened (set by the 08-06 use verb; declared here).
   * `lastEffectActed`: whether the most recent place/trash branch action actually moved >=1 card —
   *   the "if you did (either)" gate for an OR-modal whose tail is conditional on the branch acting
   *   (BT16-094: place-from-hand OR trash, then -7000 DP only if you did either). Set by
   *   PlayWithoutCost / Trash; an optional selection declined to nothing leaves it false.
   * `lastPlayedPermanentIds`: permanents created by the most recent play action in this resolution.
   *   A following DelayedDelete action uses it for "At the next end of your opponent's turn,
   *   delete it" on a Digimon just played by this effect.
   */
  lastDeleteCount?: number;
  /** Whether the most recent Delete selected a target, even if deletion was prevented. */
  lastDeleteTargetSelected?: boolean;
  /**
   * The MAX printed level among permanents deleted by the most recent Delete (or `deleteOwn`
   * subsequent target filter's `levelComparison.relativeTo:"lastDeleted"` binds its threshold
   * to this (BT8-107: delete an opponent's Digimon with level ≤ the cost-deleted Digimon's).
   * Undefined => no Digimon with a level was deleted in this resolution.
   */
  lastDeletedLevel?: number;
  /** Live DP captured before the most recent deletion, for DP-bounded follow-up targets. */
  lastDeletedDP?: number;
  lastDigivolveResult?: boolean;
  digivolutionPerformed?: boolean;
  lastOptionUsed?: boolean;
  lastOptionUsedInstanceId?: string;
  lastEffectActed?: boolean;
  /** Whether the opponent declined the immediately preceding opponent-choice action. */
  lastOpponentDeclined?: boolean;
  /** A printed optional activation was declined, so its provisional OPT mark must be restored. */
  oncePerTurnActivationDeclined?: boolean;
  /** A processing choice or mandatory action in this activation was actually chosen. */
  oncePerTurnActivationChosen?: boolean;
  /** Presentation receipt, called after an activation choice and before its first mutation. */
  onActivationChosen?: () => void;
  /** Presentation receipt shared by context copies; distinguishes an activation question from a later operation. */
  isActivationPending?: () => boolean;
  /**
   * The controller's preset answer to every yes/no question this activation asks them
   * (true = use, false = skip), from the resolution plan they sent when ordering it.
   */
  presetOptionalAnswer?: boolean;
  /** Whether the most recently dispatched action's condition matched. */
  lastActionConditionMatched?: boolean;
  lastPlayedPermanentIds?: string[];
  /**
   * Permanents suspended by the most recent suspend cost/action in this effect resolution.
   * Used by clauses like "with as much or less DP as the Digimon this effect suspended".
   */
  lastSuspendedPermanentIds?: string[];
  lastTrashedCards?: { instanceId: string; cardId: string; dp: number }[];
  /**
   * Cards revealed by the most recent Reveal/RevealAdd action in this effect resolution.
   * Kept as a snapshot because the cards may be immediately returned to deck bottom/hand/trash,
   * while a following action still needs to count "among the revealed cards".
   */
  lastRevealedCards?: { instanceId: string; cardId: string; ownerSeat: Seat }[];
  /**
   * Set by the universal ＜Delay＞ activation wrapper after it has validated and consumed an
   * armed Delay keyword grant before trashing the source permanent. Inner actions marked
   * `requiresDelayArmed` must accept this flag because the source permanent may already be gone.
   */
  delayArmedConsumed?: boolean;
  /**
   * Accumulated pay-time play-cost REDUCTION computed by a `ReducePlayCost` action resolving in a
   * `BeforePayCost` window (EX9-043 / BT25-076). The play action fires that window for the in-hand
   * card BEFORE paying, then reads this delta to floor the cost (`max(0, cost - playCostDelta)`).
   * SERVER-AUTHORITATIVE: the optional payment runs inside the engine; the client never supplies
   * the delta (T-08-26). Undefined / 0 => no reduction (payment declined or none eligible).
   */
  playCostDelta?: number;
  /** Temporary maximum-level adjustment for a subsequent effect-driven hand play. */
  playLevelCeilingDelta?: number;
  /**
   * Battle-area permanent ids a `wouldBePlayed` self-reducer's cost body (BT12-112) selected to be
   * relocated as a digivolution card under the card being played — collected during
   * `fireBeforePayCost`, BEFORE that card's own permanent exists (`ctx.fx.relocatePermanent` needs a
   * real destination id, so the relocation itself can't run yet). The engine reads this list once the
   * played permanent is created and performs the deferred `relocatePermanent` calls then (mirrors the
   * BT10-093 cross-permanent reducer's `pendingPlayReducerPlacements` queue). Undefined / empty =>
   * no self-reducer requested a relocation this play. `shedOwnCards` relocates only the source
   * permanent's top card and trashes the rest of its stack by rule (BT15-102 per KB Q2599, BT12-112
   * per KB Q2250/Q2251); without it the whole permanent moves under the played card.
   */
  pendingSelfReducerRelocations?: { permanentId: string; shedOwnCards?: boolean }[];
  /** Loose card instance ids committed under the card being played once its permanent exists. */
  pendingSelfReducerPlacements?: string[];
  /**
   * The set of permanent ids ACTUALLY deleted by the most recent `DeleteByDPBudget` action in
   * this resolution (CAP-A3). Written by the executor after the batch delete; read by the
   * `scaleFactor` resolver when `scaling.filter.deletedByThisEffect` is true. Undefined if no
   * `DeleteByDPBudget` has run in this resolution yet.
   */
  lastDeletedByThisEffectIds?: string[];
  /** All permanents actually deleted across every Delete action in this effect resolution. */
  deletedThisEffectIds?: string[];
  /** Snapshot of the most recent actually deleted permanents for typed follow-up conditions. */
  lastDeletedPermanentSnapshots?: Array<{ permanentId: string; controllerSeat: Seat; topCard: CardInstance }>;
  /** Seat-relative memory gained by the immediately preceding GainMemory action. */
  lastMemoryGainAmount?: number;
  /** Loose card instances moved by the immediately preceding PlaceUnder action. */
  lastPlacedUnderInstanceIds?: string[];
  /**
   * Loose card instances moved by all PlaceUnder actions in this effect resolution. Reset at the
   * action-bearing runEffect boundary; nested resolutions restore their caller's accumulator.
   */
  placedUnderInstanceIdsThisEffect?: string[];
  /**
   * The permanent ids resolved by the most recent primary-target action in this effect
   * resolution. Written after each `resolvePermanentTargets` call for a non-sameTarget target;
   * read by a subsequent action whose `target.sameTarget` is true (CAP-A9, BT19-089). Undefined
   * before the first action resolves its targets.
   */
  lastResolvedPermanentIds?: string[];
  /**
   * True while the action being resolved is immediately followed by a sibling whose
   * `target.sameTarget` is set, so the current action's choice is also the next action's
   * subject. Actions that normally narrow their candidate pool to permanents they can
   * actually change (Unsuspend skipping ready Digimon) must keep the wider printed pool in
   * that case: "Unsuspend 1 of your Digimon; it gains <Blocker>" may pick an already
   * unsuspended Digimon purely for the keyword (KB Q963, BT1-095).
   */
  nextActionChainsSameTarget?: boolean;
  /**
   * Named sets of permanent ids produced by actions that use `bindResultAs` (e.g. PlayPerLevel).
   * A downstream action's `filter.boundRef` restricts candidates to the named set. Fresh per
   * `runEffect`; absent means no binding has been written yet.
   */
  boundPlayed?: Map<string, Set<string>>;
  /** Card identities produced by a named play cost, retained if its permanent becomes DNA material. */
  boundCardInstances?: Map<string, Set<string>>;
  /**
   * Named integer counters written by actions that carry `trackCount` (e.g. Suspend
   * with `trackCount:"suspendedThisEffect"`). A subsequent `RepeatPerCount` action reads
   * the count to loop its nested `action` that many times (BT2-041). Fresh per `runEffect`.
   */
  namedCounts?: Map<string, number>;
  /** Colors snapshotted from cards paid by the current return cost. */
  lastReturnedColors?: string[];
}
