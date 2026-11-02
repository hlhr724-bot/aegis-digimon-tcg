import { getSingleHandActionCostBenefit } from "#api/engine/effects/interpreter/getSingleHandActionCostBenefit";
import { getDecisionActionSummary } from "#api/engine/effects/interpreter/getDecisionActionSummary";
import { getDecisionSelectionGoal } from "#api/engine/effects/interpreter/getDecisionSelectionGoal";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";
// The per-kind dispatch for every IR action.

import type { EffectContext } from "../../EffectContext.js";
import { requireOpponentAsk } from "../../../decisions/decisionApi.js";
import { evaluateCondition } from "../conditions.js";
import { borrowedProcessingCost } from "../borrowedProcessingCost.js";
import { canPayCost, costIsAskedAsSelection, payCost, payOneCostOption } from "../costs.js";
import { describeAction, describeCost } from "../describe.js";
import { type ActionScope, installActionRunner } from "../dispatch.js";
import { unsupported } from "../errors.js";
import { definitionMatches } from "../matching/definition.js";
import { permanentMatchesFilter } from "../matching/permanent.js";
import { scaleFactor } from "../scaling.js";
import { targetFateOf } from "../targetFate.js";
import { DEFAULT_PLAY_ZONES, candidateLooseInstances, zoneList } from "../targeting/loose.js";
import { candidatePermanents, raiseDeletionDpCap, resolvePermanentTargets } from "../targeting/permanents.js";
import { targetAfterSelfPlacementCost } from "../targeting/afterCost.js";
import { runBoardAction } from "./board.js";
import { availableEffectPlayAssemblyReduction } from "./effectPlayAssembly.js";
import { canAttemptAttack, runCombatAction } from "./combat.js";
import { runControlFlowAction } from "./controlFlow.js";
import { runDigivolutionAction } from "./digivolution.js";
import { canAttemptDigivolve, canAttemptDigivolveBeforeCost } from "./digivolve.js";
import { canAttemptDnaDigivolve } from "#api/engine/effects/interpreter/actions/dna";
import { runGrantStaticAction } from "./grantStatic.js";
import { canReactivateOwnEffect, runMetaAction } from "./meta.js";
import { DECLINE_MODAL_CHOICE_LABEL, declinableModalChoices, modalHasAvailableOption } from "./modal.js";
import { canAttemptLink } from "./link.js";
import { canAttemptPlaceUnder } from "./placeUnder.js";
import { allowsOptionalProcessingCostWithoutTarget } from "../processingCondition.js";
import { paysProcessingCostBeforeOptional } from "../paysProcessingCostBeforeOptional.js";
import {
  applyDecodeHostScope,
  applyPlayDpCeilingModifier,
  applyPlayCostCeiling,
  materializeLevelComparisonScaling,
  materializePlayCostLteScaling,
  ownStackPlayCandidates,
  isEffectPlayProhibited,
  playableCandidates,
  runPlayAction,
} from "./play.js";
import { canAttemptUseOptionWithoutCost } from "./borrowed.js";
import { returnableDigivolutionCards, runRemovalAction } from "./removal.js";
import { runResourceAction } from "./resources.js";
import { runRestrictionAction } from "./restrictions.js";
import { runRevealAction } from "./reveal.js";
import { runSecurityAction } from "./security.js";
import { runStaticAction } from "./statics.js";
import { CardKind, digiXrosRequirementFor } from "@aegis/shared";
import type { Action, Cost, Target, ZoneRef } from "@aegis/shared";
import { canDetachPermanentTop, isDetachTopAction } from "../targeting/detachTop.js";
import { printedPassage } from "#api/engine/decisions/printedPassage";
import type { DecisionApi } from "#api/engine/effects/context/decisions";

function clearDeleteOutcome(ctx: EffectContext, action: Extract<Action, { kind: "Delete" }>): void {
  ctx.lastDeleteCount = 0;
  ctx.lastDeleteTargetSelected = false;
  ctx.lastDeletedByThisEffectIds = [];
  ctx.lastDeletedPermanentSnapshots = [];
  ctx.lastDeletedLevel = undefined;
  ctx.lastDeletedDP = undefined;
  ctx.lastEffectActed = false;
  if (action.trackCount !== undefined) {
    ctx.namedCounts ??= new Map();
    ctx.namedCounts.set(action.trackCount, 0);
  }
}

/**
 * Some effects pay by trashing a card from a stack and then play a matching card from trash
 * (EX10-058 Q5160). The paid card is not in the play zone during the normal optional-play
 * preflight, but it becomes a legal target atomically after payment. Keep this exception narrow:
 * only a trash cost sourced from digivolution cards can create a subsequent trash play target.
 */
function trashCostCanCreatePlayTarget(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlayWithoutCost" }>,
  cost: Cost,
): boolean {
  if (
    !action.from?.includes("trash") ||
    cost.kind !== "trash" ||
    cost.target === undefined ||
    cost.target.filter.zone !== "digivolutionCards"
  ) {
    return false;
  }
  const payable = candidateLooseInstances(ctx, cost.target, ["digivolutionCards"]);
  if (payable.length === 0 || !canPayCost(ctx, cost)) return false;
  // The target is evaluated against the post-payment trash zone. Ignore a literal zone marker
  // while matching the prospective stack card against the target's definition predicates.
  const prospectiveTarget = {
    ...action.target,
    filter: { ...action.target.filter, zone: undefined },
  };
  // Match the same playability boundary as runPlayAction before allowing the cost prompt.
  // In particular, an effect-play prohibition is checked only after the cost in the normal
  // resolver; admitting a prohibited source here would make this exception pay a cost for a
  // play that can never happen. Keep Option-only cards out of a kind-less play target too,
  // matching playableCandidates in play.ts.
  const requestedKinds = [
    ...(prospectiveTarget.filter.kind ?? []),
    ...(prospectiveTarget.orFilters ?? []).flatMap((filter) => filter.kind ?? []),
    ...(prospectiveTarget.filter.orFilters ?? []).flatMap((filter) => filter.kind ?? []),
  ];
  const potentialTargets = candidateLooseInstances(ctx, prospectiveTarget, ["digivolutionCards"]).filter(
    (candidate) => {
      if (ctx.fx.isPlayProhibited?.(ctx.source.ownerSeat, candidate.cardId, "play") === true) return false;
      if (requestedKinds.length > 0) return true;
      const kinds = ctx.game.definitionOf({ cardId: candidate.cardId } as never).kinds;
      return !kinds.includes(CardKind.Option) || kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.Tamer);
    },
  );
  const payableIds = new Set(payable.map(({ instanceId }) => instanceId));
  return potentialTargets.some((candidate) => payableIds.has(candidate.instanceId));
}

/**
 * "By deleting 1 of your other suspended Digimon, play 1 level 3 [Beast] from your trash"
 * (BT17-049): the cost DELETES a Digimon, so its top card reaches the trash before the play
 * chooses a target — the deleted Digimon may itself be the card replayed. Like the trash-cost
 * exception above, the optional-play preflight must therefore count the prospective trash
 * arrivals, otherwise an empty trash silently skips the whole clause. Kept narrow: only a
 * `deleteOwn` cost feeding a play whose source zones include the trash.
 */
function deleteOwnCostCanCreatePlayTarget(
  ctx: EffectContext,
  action: Extract<Action, { kind: "PlayWithoutCost" }>,
  cost: Cost,
): boolean {
  if (!action.from?.includes("trash") || cost.kind !== "deleteOwn" || cost.target === undefined) return false;
  const deletable = candidatePermanents(ctx, cost.target);
  if (deletable.length === 0 || !canPayCost(ctx, cost)) return false;
  // The play target is matched against the post-payment trash, so ignore the literal zone
  // marker and test each prospective trash arrival against the target's card predicates.
  const prospectiveFilter = { ...action.target.filter, zone: undefined };
  return deletable.some((permanent) => {
    const top = permanent.topCard;
    if (top === undefined) return false;
    if (ctx.fx.isPlayProhibited?.(ctx.source.ownerSeat, top.cardId, "play") === true) return false;
    return definitionMatches(prospectiveFilter, ctx.game.definitionOf(top));
  });
}

/**
 * A loose-card payment can define the following Delete target (same name/relative level).
 * Prove that at least one payable card/target pair exists before offering or consuming the cost;
 * the real binding is written by payCost after the player chooses the payment.
 */
function looseCostCanProduceDeleteTarget(
  ctx: EffectContext,
  action: Extract<Action, { kind: "Delete" }>,
  cost: Cost,
): boolean {
  const ref = cost.bindResultAs;
  const costTarget = cost.target;
  if (ref === undefined || costTarget === undefined) return false;
  const sameName = action.target.filter.sameNameAsSelection === ref;
  const relative = action.target.filter.relativeTo;
  if (!sameName && relative?.selectionRef !== ref) return false;
  const zone = costTarget.filter.zone;
  const zones = (Array.isArray(zone) ? zone : zone === undefined ? [] : [zone]).filter(
    (candidate): candidate is ZoneRef => candidate === "hand" || candidate === "trash",
  );
  if (zones.length === 0) return false;
  const costCandidates = candidateLooseInstances(ctx, costTarget, zones);
  if (costCandidates.length === 0) return false;
  const { sameNameAsSelection: _sameName, relativeTo: _relative, ...staticFilter } = action.target.filter;
  const targets = candidatePermanents(ctx, { ...action.target, filter: staticFilter } as Target);
  return costCandidates.some((candidate) => {
    const paid = ctx.game.definitionOf({ cardId: candidate.cardId });
    return targets.some((target) => {
      if (target.topCard === undefined) return false;
      const targetDefinition = ctx.game.definitionOf(target.topCard);
      if (sameName) {
        const paidName = (paid.nameEn ?? "").toLowerCase();
        return paidName !== "" && paidName === (targetDefinition.nameEn ?? "").toLowerCase();
      }
      if (relative === undefined) return false;
      const lhs =
        relative.attr === "dp"
          ? target.currentDP
          : relative.attr === "digivolutionCount"
            ? target.stack.length
            : relative.attr === "level"
              ? targetDefinition.level
              : targetDefinition.playCost;
      const rhs =
        relative.attr === "dp"
          ? paid.dp
          : relative.attr === "digivolutionCount"
            ? 0
            : relative.attr === "level"
              ? paid.level
              : paid.playCost;
      if (lhs === undefined || rhs === undefined) return false;
      if (relative.op === "lte") return lhs <= rhs;
      if (relative.op === "gte") return lhs >= rhs;
      return lhs === rhs;
    });
  });
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

/**
 * Run a single Action against the live context.
 * Returns `true` when the action was an optional that was declined AND
 * `abortOnDecline` is set — the caller should stop processing further actions.
 */
export async function runAction(ctx: EffectContext, action: Action): Promise<boolean> {
  const outerSingleHandCostBenefit = ctx.activeSingleHandCostBenefit;
  ctx.activeSingleHandCostBenefit = getSingleHandActionCostBenefit({ action });
  const outerDecisionSummary = ctx.activeDecisionSummary;
  const outerDecisionSelectionGoal = ctx.activeDecisionSelectionGoal;
  ctx.activeDecisionSummary = getDecisionActionSummary({ action });
  ctx.activeDecisionSelectionGoal = getDecisionSelectionGoal({ action });
  // Display-only provenance: every decision this action raises carries what the
  // action is about to do to the permanents it offers, so the client badges a
  // picked target instead of reading its fate out of printed English. Restored
  // afterwards because a nested action (a branch, a repeat) resolves its own
  // targets and must not inherit the outer action's fate.
  const outerEffectTextPart = ctx.activeEffectTextPart;
  if (action.kind !== "RawUnparsed" && action.effectTextPart !== undefined)
    ctx.activeEffectTextPart = action.effectTextPart;
  const outerFate = ctx.activeTargetFate;
  const outerSelectionContext = ctx.activeSelectionContext;
  const outerDelayArmedConsumed = ctx.delayArmedConsumed;
  const outerPendingRotationHostPermanentId = ctx.pendingRotationHostPermanentId;
  const outerAsk = ctx.ask;
  const outerCostDecisionAction = ctx.activeCostDecisionAction;
  const preselectedCostIds = ctx.predecidedCostSelections?.get(action);
  ctx.activeCostDecisionAction = action;
  if (preselectedCostIds !== undefined) {
    let consumed = false;
    ctx.ask = {
      ...outerAsk,
      selectCards: async (answerCtx, request) => {
        if (consumed || !answerCtx.payingCostDepth || answerCtx.activeCostDecisionAction !== action) {
          return outerAsk.selectCards(answerCtx, request);
        }
        consumed = true;
        const stillLegal = preselectedCostIds.filter((id) => request.candidates.includes(id));
        return stillLegal.length === preselectedCostIds.length ? stillLegal : [];
      },
      chooseTargets: async (answerCtx, request) => {
        if (consumed || !answerCtx.payingCostDepth || answerCtx.activeCostDecisionAction !== action) {
          return outerAsk.chooseTargets(answerCtx, request);
        }
        consumed = true;
        const stillLegal = preselectedCostIds.filter((id) => request.candidates.includes(id));
        return stillLegal.length === preselectedCostIds.length ? stillLegal : [];
      },
    };
  }
  ctx.activeTargetFate = targetFateOf(action);
  ctx.activeSelectionContext = action.kind === "Attack" ? "attackSource" : undefined;
  const outerPickingAcceptedOptional = ctx.pickingAcceptedOptional;
  const outerSelectingOptionalTarget = ctx.selectingOptionalTarget;
  ctx.pickingAcceptedOptional = false;
  ctx.selectingOptionalTarget = false;
  try {
    return await runActionInner(ctx, action);
  } finally {
    ctx.activeSingleHandCostBenefit = outerSingleHandCostBenefit;
    ctx.activeDecisionSummary = outerDecisionSummary;
    ctx.activeDecisionSelectionGoal = outerDecisionSelectionGoal;
    ctx.pickingAcceptedOptional = outerPickingAcceptedOptional;
    ctx.selectingOptionalTarget = outerSelectingOptionalTarget;
    ctx.activeTargetFate = outerFate;
    ctx.activeSelectionContext = outerSelectionContext;
    ctx.activeEffectTextPart = outerEffectTextPart;
    // `requiresDelayArmed` is scoped to this action resolution. Some focused
    // contexts are intentionally reused across timing windows; leaking the
    // consumed flag would let the same payload run again without a new grant.
    ctx.delayArmedConsumed = outerDelayArmedConsumed;
    // A rotation receipt belongs to the action that paid it. Preserve an outer
    // receipt across nested actions and clear a receipt created by this action.
    ctx.pendingRotationHostPermanentId = outerPendingRotationHostPermanentId;
    ctx.ask = outerAsk;
    ctx.activeCostDecisionAction = outerCostDecisionAction;
  }
}

const PICK_DECLINABLE_AFTER_YES: ReadonlySet<Action["kind"]> = new Set([
  "PlayWithoutCost",
  "PlayFromZone",
  "Delete",
  "Return",
  "Trash",
  "Suspend",
  "Unsuspend",
  "ModifyDP",
  "GainKeyword",
  "Restrict",
  "DeDigivolve",
  "TrashDigivolution",
  "PlaceInBattleAreaSelf",
  "PlaceUnder",
  "Digivolve",
  "Link",
  "SelectBind",
]);

/**
 * A larger or named set ("1 [Kinkakumon] and 1 [Ginkakumon]", Q1465) is picked one card at a
 * time, and an accepted set must not stop halfway.
 */
function targetsOneCard(action: Action): boolean {
  if (action.kind === "Delete" && action.additionalSimultaneousTargets?.length) return false;
  const target = "target" in action ? (action.target as Target | undefined) : undefined;
  return target?.count === undefined || target.count === 1;
}

/** A costless, independent one-card choice can ask its own "you may". */
function optionalTargetAsksAction(ctx: EffectContext, action: Action): boolean {
  if (action.kind === "Digivolve") {
    return (
      action.preserveOncePerTurnOnDecline === true &&
      ctx.oncePerTurnActivationChosen !== true &&
      action.optional === true &&
      action.cost === undefined &&
      action.additionalCost === undefined &&
      !action.additionalCosts?.length &&
      !action.costOptions?.length &&
      action.abortOnDecline !== true &&
      action.scaling === undefined &&
      ctx.presetOptionalAnswer === undefined &&
      !ctx.predecidedOptionalActions?.has(action) &&
      action.target.count === 1 &&
      action.target.countModifier === undefined &&
      (action.target.isSelf === true || action.target.filter.isSelfRef === true) &&
      action.target.targetBreeding !== true
    );
  }
  if (
    action.kind !== "Suspend" &&
    action.kind !== "Unsuspend" &&
    action.kind !== "Return" &&
    action.kind !== "Delete" &&
    action.kind !== "PlayWithoutCost"
  )
    return false;
  if (
    action.kind === "Delete" &&
    (action.at !== undefined ||
      action.additionalSimultaneousTargets?.length ||
      action.dpCeilingScaling !== undefined ||
      action.totalDpCapScaling !== undefined ||
      action.playCostCeiling !== undefined ||
      action.target.totalDpCap !== undefined ||
      action.target.filter.playCostLteScaling !== undefined)
  )
    return false;
  const target = action.target;
  return (
    action.optional === true &&
    action.cost === undefined &&
    action.additionalCost === undefined &&
    !action.additionalCosts?.length &&
    !action.costOptions?.length &&
    action.abortOnDecline !== true &&
    action.scaling === undefined &&
    ctx.presetOptionalAnswer === undefined &&
    !ctx.predecidedOptionalActions?.has(action) &&
    target.count === 1 &&
    target.countModifier === undefined &&
    target.chooser !== "opponent" &&
    (action.kind === "PlayWithoutCost" || target.filter.zone === undefined) &&
    !target.isSelf &&
    !target.filter.isSelfRef &&
    !target.sameTarget &&
    target.filter.boundRef === undefined &&
    target.sourceRef === undefined &&
    target.fromSelectionRef === undefined &&
    (action.kind !== "Return" || action.from === undefined) &&
    (action.kind !== "PlayWithoutCost" ||
      (target.upTo === true &&
        !action.additionalSimultaneousTargets?.length &&
        !target.requiredNamesExact?.length &&
        !target.requiredNamesExactUpTo?.length &&
        !target.distinctLevels &&
        !target.distinctNames &&
        (target.minimum === undefined || target.minimum === 0)))
  );
}

function markActivationChosen(ctx: EffectContext): void {
  if (ctx.optionalActivationCancellation?.available === true) {
    return;
  }
  ctx.onActivationChosen?.();
  ctx.oncePerTurnActivationChosen = true;
  ctx.oncePerTurnActivationDeclined = false;
}

function markActivationDeclined(ctx: EffectContext): void {
  if (ctx.oncePerTurnActivationChosen !== true) ctx.oncePerTurnActivationDeclined = true;
}

/**
 * CR 11-1-2: only the turn player can attack. A cost-free optional "may attack" whose every
 * possible attacker belongs to the non-turn player is never offered (KB Q2891). Other
 * unattackable cases keep their existing confirmation, so a paid "By suspending ..." clause
 * can still be activated for its cost.
 */
function onlyNonTurnPlayerAttackers(ctx: EffectContext, action: Extract<Action, { kind: "Attack" }>): boolean {
  if (action.cost !== undefined) return false;
  const attackSubject = action.attacker ?? action.subject ?? action.target;
  if (attackSubject === undefined) return false;
  const turnSeat = ctx.game.state.turnSeat;
  const attackers =
    attackSubject.isSelf || attackSubject.filter?.isSelfRef
      ? [ctx.source.permanent()].filter((permanent) => permanent !== undefined)
      : candidatePermanents(ctx, attackSubject, { includeUnaffectable: true });
  return attackers.length > 0 && attackers.every((permanent) => permanent.controllerSeat !== turnSeat);
}

function unavailableAction(ctx: EffectContext, action: Action, abort = false): boolean {
  const priorActionActed = ctx.lastEffectActed === true;
  ctx.lastEffectActed = false;
  if (priorActionActed) {
    markActivationChosen(ctx);
  } else if (
    action.kind !== "RawUnparsed" &&
    (action.optional === true || action.preserveOncePerTurnOnDecline === true)
  ) {
    markActivationDeclined(ctx);
  }
  return abort;
}

/**
 * An optional processing whose chooser is the OPPONENT is not the controller's choice to
 * activate. KB Q4739 (EX8-063): "the effect will be considered to have activated when they
 * choose whether or not to discard it", so asking the opponent counts toward [Once Per Turn]
 * whichever way they answer.
 */
function isOpponentChosenProcessing(action: Action): boolean {
  const chooser =
    (action as { chooser?: string }).chooser ?? (action as { target?: { chooser?: string } }).target?.chooser;
  return chooser === "opponent";
}

/**
 * A printed "By [cost], ... may digivolve" pays its processing condition even when no
 * digivolution is possible (§15-7-5), so the pre-cost gate lets it through. Once the cost is
 * paid, re-check against the live board: with no legal destination the "Digivolve" yes/no
 * would do nothing, so it is not asked (feedback #40, BT22-090 at 5 security).
 * The cost is stripped because it is already paid: its pre-payment projections (a bound
 * breeding Digimon, a rotated stack top) no longer describe the board.
 */
function optionalDigivolveImpossibleAfterCost(ctx: EffectContext, action: Action): boolean {
  if (action.kind !== "Digivolve") return false;
  return !canAttemptDigivolve(ctx, { ...action, cost: undefined });
}

async function runActionInner(ctx: EffectContext, action: Action): Promise<boolean> {
  let acceptedBeforeItsPick = false;
  const paysCostFirst = paysProcessingCostBeforeOptional(action);
  // A placement tally is scoped to this action's current resolution.  In particular, a
  // declined/blocked optional placement must overwrite a prior activation's count rather
  // than allowing a later conditional to borrow it (EX6-073 Q3825).
  if (action.kind === "PlaceUnder") {
    if (action.trackCount !== undefined || action.trackDistinctNames !== undefined) {
      ctx.namedCounts ??= new Map();
      if (action.trackCount !== undefined) ctx.namedCounts.set(action.trackCount, 0);
      if (action.trackDistinctNames !== undefined) ctx.namedCounts.set(action.trackDistinctNames, 0);
    }
  }
  if (action.kind === "PlayWithoutCost" && action.target.filter?.sameColorAsReturned === true) {
    ctx.lastReturnedColors = undefined;
  }
  // Per-action gate. `while` is the continuously re-evaluated spelling used by persistent
  // actions: the recompute pass clears the old contribution, and this gate decides whether
  // the action contributes again. Individual handlers may additionally use `while` to mark
  // dynamic grants, but every action kind needs the same truth test (not only Aura/Restrict).
  const gate =
    action.kind === "RawUnparsed" || action.kind === "ConditionalBranch"
      ? undefined
      : (action.condition ?? ("while" in action ? action.while : undefined));
  if (gate !== undefined) {
    ctx.lastActionConditionMatched = evaluateCondition(ctx, gate);
    if (!ctx.lastActionConditionMatched) return false;
  } else {
    ctx.lastActionConditionMatched = true;
  }
  // A By condition found unpayable or declined at the effect-wide decision point
  // stays skipped even if an earlier payload changes the board or memory gauge.
  if (ctx.predecidedOptionalActions?.get(action) === false) {
    ctx.lastEffectActed = false;
    markActivationDeclined(ctx);
    return action.kind !== "RawUnparsed" && action.abortOnDecline === true;
  }
  if (ctx.predecidedOptionalCosts?.get(action) === false) {
    // A declined optional cost can still leave its payload active. Its normal
    // payment branch consumes the cached refusal and continues when the clause
    // does not say to abort (for example, an optional suspend followed by Draw).
    const optionalCostCanContinue =
      action.kind !== "RawUnparsed" &&
      action.kind !== "CostGatedBlock" &&
      action.kind !== "CostModifier" &&
      action.abortOnDecline !== true &&
      action.cost !== undefined &&
      typeof action.cost !== "number" &&
      action.cost.optional === true;
    if (!optionalCostCanContinue) {
      ctx.lastEffectActed = false;
      markActivationDeclined(ctx);
      return action.kind !== "RawUnparsed" && action.abortOnDecline === true;
    }
  }
  // A Delay payload may use any action kind, including GainKeyword. Consume an armed Delay
  // grant here for action kinds whose specialized handlers do not own that gate. The intrinsic
  // Main Delay wrapper passes delayArmedConsumed after consuming its grant, while Play,
  // Replacement, and SubTrigger handlers can safely observe the same flag without double use.
  const ownsDelayGate =
    action.kind === "PlayWithoutCost" || action.kind === "Replacement" || action.kind === "SubTrigger";
  if (
    action.kind !== "RawUnparsed" &&
    !ownsDelayGate &&
    action.requiresDelayArmed === true &&
    ctx.delayArmedConsumed !== true
  ) {
    const self = ctx.source.permanent();
    if (self === undefined) return false;
    const hasDelay = (ctx.fx.grantedKeywords?.(self.permanentId) ?? []).some((grant) => grant.keyword === "Delay");
    if (!hasDelay) return false;
    ctx.fx.revokeKeyword?.(self.permanentId, "Delay");
    ctx.delayArmedConsumed = true;
  }
  // "By paying ..., return 1 [X]" is not worth offering when nothing can be returned — but
  // only a BATTLE-AREA return is answered by a board scan. A return that sources a loose card
  // ("from your trash to the hand", BT16-031) has its candidates in another zone, where
  // resolvePermanentTargets always finds none and would abort every such clause outright.
  const returnsLooseCard =
    action.kind === "Return" &&
    ((action.from?.length ?? 0) > 0 ||
      (action.target.filter.zone !== undefined && action.target.filter.zone !== "battleArea"));
  const returnBoundProducedByCost =
    action.kind === "Return" &&
    action.cost?.kind === "place" &&
    action.cost.storeAs !== undefined &&
    action.target.filter.levelLte === action.cost.storeAs;
  if (
    action.kind === "Return" &&
    action.cost !== undefined &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    !returnsLooseCard &&
    !returnBoundProducedByCost &&
    action.target.filter.dpLessOrEqualToSuspendedDigimon !== true &&
    (await resolvePermanentTargets(ctx, action.target)).length === 0
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  const dynamicallyScaledDeleteTarget =
    action.kind === "Delete" &&
    (action.dpCeilingScaling !== undefined ||
      action.totalDpCapScaling !== undefined ||
      action.playCostCeiling !== undefined ||
      action.scaling !== undefined ||
      action.target.filter?.playCostLteScaling !== undefined);
  const actionCost = action.kind === "DigivolveViaPlacement" ? undefined : action.cost;
  const payableActionCost =
    actionCost !== undefined && typeof actionCost !== "number" ? borrowedProcessingCost(ctx, actionCost) : actionCost;
  const additionalCost = action.kind === "RawUnparsed" ? undefined : action.additionalCost;
  const additionalCosts = action.kind === "RawUnparsed" ? [] : (action.additionalCosts ?? []);
  const placementCosts = [
    ...(actionCost?.kind === "place" ? [actionCost] : []),
    ...(additionalCost?.kind === "place" ? [additionalCost] : []),
    ...additionalCosts.filter((cost): cost is Cost => cost.kind === "place"),
  ];
  const placeCostProducesDeleteTarget =
    action.kind === "Delete" &&
    placementCosts.some(
      (cost) =>
        (cost.storeAs !== undefined && action.target.filter.levelEq === cost.storeAs) ||
        (cost.storeAs !== undefined &&
          action.target.filter.levelComparison?.scaling?.unit === "namedCount" &&
          action.target.filter.levelComparison.scaling.countSource === cost.storeAs) ||
        (cost.bindHostAs !== undefined && action.target.filter.relativeTo?.selectionRef === cost.bindHostAs) ||
        (cost.bindResultAs !== undefined && action.target.filter.levelComparison?.relativeTo === cost.bindResultAs),
    );
  // A "by deleting 1 of your Digimon, delete 1 with a level no higher than it" target
  // cannot be matched until the deleteOwn cost captures `lastDeletedLevel`.  Preflighting
  // it before payment makes the target set look empty and silently skips the whole action.
  const deleteOwnCost =
    action.kind === "Delete" &&
    action.cost !== undefined &&
    typeof action.cost !== "number" &&
    action.cost.kind === "deleteOwn"
      ? action.cost
      : undefined;
  const deleteTargetLevelBoundByItsCost =
    action.kind === "Delete" &&
    deleteOwnCost !== undefined &&
    action.target.filter.levelComparison?.relativeTo === "lastDeleted";
  const deleteTargetDPBoundByItsCost =
    action.kind === "Delete" && deleteOwnCost !== undefined && action.target.filter.dp?.relativeTo === "lastDeleted";
  const deleteTargetBoundByItsCost = deleteTargetLevelBoundByItsCost || deleteTargetDPBoundByItsCost;
  const deleteOwnBoundedTargetAvailable = (() => {
    if (action.kind !== "Delete" || !deleteTargetBoundByItsCost || deleteOwnCost.target === undefined) return false;
    if (deleteTargetDPBoundByItsCost) {
      const highestCostDP = Math.max(
        ...candidatePermanents(ctx, deleteOwnCost.target).map((permanent) => permanent.currentDP),
        0,
      );
      const { dp: _dp, ...filterWithoutBound } = action.target.filter;
      return candidatePermanents(ctx, { ...action.target, filter: filterWithoutBound }).some(
        (permanent) => permanent.currentDP <= highestCostDP,
      );
    }
    const highestCostLevel = Math.max(
      ...candidatePermanents(ctx, deleteOwnCost.target)
        .map((permanent) => {
          const card = ctx.game.permanentById(permanent.permanentId)?.topCard;
          return card === undefined ? 0 : (ctx.game.definitionOf(card).level ?? 0);
        })
        .filter((level) => level > 0),
      0,
    );
    if (highestCostLevel === 0) return false;
    const { levelComparison: _levelComparison, ...filterWithoutBound } = action.target.filter;
    return candidatePermanents(ctx, { ...action.target, filter: filterWithoutBound }).some((permanent) => {
      const card = ctx.game.permanentById(permanent.permanentId)?.topCard;
      return card !== undefined && (ctx.game.definitionOf(card).level ?? 0) <= highestCostLevel;
    });
  })();
  const looseCostDefinesDeleteTarget =
    action.kind === "Delete" &&
    payableActionCost !== undefined &&
    typeof payableActionCost !== "number" &&
    payableActionCost.bindResultAs !== undefined &&
    (action.target.filter.sameNameAsSelection === payableActionCost.bindResultAs ||
      action.target.filter.relativeTo?.selectionRef === payableActionCost.bindResultAs);
  if (
    action.kind === "Delete" &&
    looseCostDefinesDeleteTarget &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    typeof payableActionCost !== "number" &&
    !looseCostCanProduceDeleteTarget(ctx, action, payableActionCost)
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // A costless optional Delete still needs a legal target before its confirmation prompt.
  // Cost-bearing Deletes are handled above because their target may be created by payment;
  // keep those dynamic exceptions out of this early check (EX10-037).
  if (
    action.kind === "Delete" &&
    action.optional === true &&
    action.cost === undefined &&
    !dynamicallyScaledDeleteTarget &&
    !placeCostProducesDeleteTarget &&
    !looseCostDefinesDeleteTarget &&
    // Through the raised cap, not the printed one: a DP-deletion-maximum modifier already on
    // the ledger (EX8-074's "+3000 per other suspended Digimon") widens who is a legal target,
    // and skipping the prompt against the printed `<= N` would drop the clause outright.
    [action.target, ...(action.additionalSimultaneousTargets ?? [])].every(
      (target) => candidatePermanents(ctx, raiseDeletionDpCap(ctx, target), { includeUnaffectable: true }).length === 0,
    )
  ) {
    clearDeleteOutcome(ctx, action);
    return false;
  }
  if (
    action.kind === "Delete" &&
    action.cost !== undefined &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    !dynamicallyScaledDeleteTarget &&
    !placeCostProducesDeleteTarget &&
    !looseCostDefinesDeleteTarget &&
    (!deleteTargetBoundByItsCost || !deleteOwnBoundedTargetAvailable) &&
    [targetAfterSelfPlacementCost(ctx, action) ?? action.target, ...(action.additionalSimultaneousTargets ?? [])].every(
      (target) => candidatePermanents(ctx, target).length === 0,
    )
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // Target-bearing source-trash and binding actions must not consume a Digi-Burst (or other
  // activation) cost when their target pool is empty. Return/Delete already have equivalent
  // preflights above; BT4-032 uses TrashDigivolution, BT4-033 uses SelectBind before the
  // subsequent bounce, and BT4-068 gates De-Digivolve with Digi-Burst, so leaving these
  // target-bearing verbs to pay first makes a no-target activation
  // silently trash the source stack (CR §15-8-4-4-1).
  if (
    (action.kind === "TrashDigivolution" || action.kind === "SelectBind" || action.kind === "DeDigivolve") &&
    action.cost !== undefined &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    candidatePermanents(ctx, action.target).length === 0
  ) {
    return action.abortOnDecline === true;
  }
  // A breeding move with a processing cost is possible only when the controller's current
  // breeding Digimon satisfies the printed target filter. Preflight before the optional prompt
  // and generic cost path so an ineligible 0-DP card cannot suspend or otherwise pay for a
  // move that the board handler will reject (BT14-088, Q2463).
  if (action.kind === "MovePermanent" && action.direction === "toBattle") {
    const bred = ctx.game.player(ctx.source.ownerSeat).breeding;
    const eligible =
      bred?.topCard !== undefined &&
      (action.target === undefined || permanentMatchesFilter(ctx, bred, action.target.filter, ctx.source));
    if (!eligible) return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  if (
    action.kind === "Unsuspend" &&
    (action.optional === true || action.cost !== undefined) &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    !(action.cost?.bindHostAs !== undefined && action.cost.bindHostAs === action.target.fromSelectionRef) &&
    candidatePermanents(ctx, action.target, { includeUnaffectable: true }).every(
      (permanent) => permanent.isSuspended !== true,
    )
  ) {
    ctx.lastEffectActed = false;
    // No suspended target means the "may unsuspend" prompt is never raised, so the player
    // never chose to use it. Treat the skip like a decline for the [Once Per Turn] budget
    // (BT26-015: the inherited deck-add reaction must stay armed until the host actually
    // suspends later in the same turn).
    if (action.optional === true || action.preserveOncePerTurnOnDecline === true) markActivationDeclined(ctx);
    return action.cost !== undefined ? action.abortOnDecline === true : false;
  }
  if (isDetachTopAction(action) && !canDetachPermanentTop(ctx, action)) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  if (action.kind === "ReactivateEffect" && !canReactivateOwnEffect(ctx, action)) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  if (
    action.kind === "PlaceUnder" &&
    action.cost !== undefined &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    !canAttemptPlaceUnder(ctx, action)
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // A modal whose every option is un-attemptable cannot be activated at all, so its
  // activation cost must not be charged (BT17-050 Q2803: with no level 5 or higher Digimon
  // there is nothing to place this card under, and the 4 memory is never paid).
  if (action.kind === "Modal" && action.options.length > 0 && !modalHasAvailableOption(ctx, action)) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // A breeding-area play with a printed activation cost is transactional: an occupied
  // single-slot destination makes the action impossible before any optional prompt or cost
  // payment. The play primitive retains the same guard for destination safety, while this
  // preflight prevents BT23-084-style compound costs from being consumed by a guaranteed no-op.
  if (
    action.kind === "PlayWithoutCost" &&
    (action.requiresEmpty === "breedingArea" || action.breeding === true) &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    ctx.game.player(ctx.source.ownerSeat).breeding !== undefined
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  if (
    action.kind === "CostModifier" &&
    action.existingPermanent === true &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    (action.target === undefined || candidatePermanents(ctx, action.target).length === 0)
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // Unless a ruling explicitly allows paying the processing condition by itself, a redirect's
  // activation cost is payable only when the attack can actually be redirected. Preflight
  // candidates before the optional prompt and generic cost path; otherwise a card such as
  // BT26-092 can return its Tamer even though no eligible TS Digimon exists to receive the attack.
  if (
    action.kind === "RedirectAttack" &&
    action.mode !== "endAttack" &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    ctx.fx.isAttackTargetLocked?.() === true
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  if (
    action.kind === "RedirectAttack" &&
    action.mode !== "endAttack" &&
    action.includePlayer !== true &&
    !allowsOptionalProcessingCostWithoutTarget(action)
  ) {
    const candidates =
      action.chooser === "opponent"
        ? candidatePermanents(ctx, {
            ...action.target,
            filter: { ...action.target.filter, controller: "opponent" as const },
          })
        : candidatePermanents(ctx, action.target, { includeUnaffectable: true });
    if (candidates.length === 0) return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  const structuredCost = action.kind !== "RawUnparsed" && typeof action.cost !== "number" ? action.cost : undefined;
  if (action.kind === "CostModifier" && action.amount === null && action.dynamicFrom === "deletedDigimonPlayCost") {
    unsupported(ctx, action, "dynamic deleted-Digimon play-cost modifier must be nested under wouldBePlayed");
    return false;
  }
  const costCreatesTrashCandidate =
    structuredCost?.kind === "trashBottomFaceDownUnderTamer" ||
    structuredCost?.kind === "trashBottomFaceDownUnderDigimon" ||
    // EX9-063: a payable hidden-source cost may itself supply the trash play.
    // Do not inspect its hidden identity to gate payment; the play resolver
    // rebuilds and filters the now-public trash pool after the cost resolves.
    (action.kind === "PlayWithoutCost" &&
      action.from?.includes("trash") === true &&
      structuredCost?.kind === "trash" &&
      structuredCost.target?.filter.zone === "digivolutionCards" &&
      ((structuredCost.target.filter.faceDown === true && canPayCost(ctx, structuredCost)) ||
        trashCostCanCreatePlayTarget(ctx, action, structuredCost))) ||
    (action.kind === "PlayWithoutCost" &&
      structuredCost !== undefined &&
      deleteOwnCostCanCreatePlayTarget(ctx, action, structuredCost));
  const nestedRequiredOptionUse =
    action.kind === "CostGatedBlock" &&
    action.actions.length === 1 &&
    action.actions[0]?.kind === "UseOptionWithoutCost"
      ? action.actions[0]
      : undefined;
  if (
    nestedRequiredOptionUse?.selectionRequired === true &&
    !(await canAttemptUseOptionWithoutCost(ctx, nestedRequiredOptionUse))
  ) {
    return unavailableAction(ctx, action, action.kind === "CostGatedBlock" && action.abortOnDecline === true);
  }
  if (
    action.kind === "UseOptionWithoutCost" &&
    action.cost !== undefined &&
    !allowsOptionalProcessingCostWithoutTarget(action) &&
    !(await canAttemptUseOptionWithoutCost(ctx, action))
  ) {
    return unavailableAction(ctx, action, action.abortOnDecline === true);
  }
  // Bind a SelectBind target before paying a cost that refers to that selected host.
  if (action.kind === "SelectBind" && action.target.bindAs !== undefined && action.cost?.kind === "trash") {
    const boundTo =
      action.cost.target?.filter !== undefined && "boundTo" in action.cost.target.filter
        ? action.cost.target.filter.boundTo
        : undefined;
    if (boundTo === action.target.bindAs && ctx.selections?.get(boundTo) === undefined) {
      // The "you may" comes before choosing whose card pays (EX8-070); record the answer so
      // the regular optional prompt below does not ask it a second time.
      if (action.optional === true) {
        const yes = ctx.predecidedOptionalActions?.get(action) ?? (await ctx.ask.optional(ctx, describeAction(action)));
        if (!yes) {
          ctx.lastEffectActed = false;
          markActivationDeclined(ctx);
          return action.abortOnDecline === true;
        }
        ctx.predecidedOptionalActions ??= new Map();
        ctx.predecidedOptionalActions.set(action, true);
      }
      const ids = await resolvePermanentTargets(ctx, action.target);
      if (ids.length === 0) return unavailableAction(ctx, action, action.abortOnDecline === true);
      ctx.selections?.set(boundTo, ids[0]!);
    }
  }
  // A BeforePayCost CostModifier may carry the printed payment required to earn its
  // reduction (BT26-098). CostModifier is normally excluded from the generic activation
  // cost path because passive modifiers have no cost; an explicit cost is different and
  // must be paid before installing the modifier.
  const interactiveDigivolveReduction =
    action.kind === "CostModifier" &&
    action.target === undefined &&
    action.costType === "digivolve" &&
    action.mode === "reduce" &&
    action.duration === "nextDigivolveThisTurn" &&
    action.cost?.kind === "trash" &&
    action.cost.target === undefined;
  let costModifierPaidCount: number | undefined;
  if (action.kind === "CostModifier" && action.cost !== undefined && !interactiveDigivolveReduction) {
    if (action.optional) {
      if (
        !(
          ctx.predecidedOptionalCosts?.get(action) ??
          (await ctx.ask.optional(ctx, `Pay cost: ${describeCost(action.cost)}?`))
        )
      ) {
        markActivationDeclined(ctx);
        return action.abortOnDecline === true;
      }
      markActivationChosen(ctx);
    }
    const payment = { paidCount: 0 };
    const paid = await payCost(ctx, payableActionCost as Cost, payment);
    if (!paid) return action.abortOnDecline === true;
    costModifierPaidCount = payment.paidCount;
  }
  /*
   * The action's cost is paid by choosing cards out of the controller's own hand, and it is
   * the only thing gating the clause. Such a cost asks the clause's question by itself:
   * choosing nothing is the refusal, and an unpaid cost aborts on exactly the path a refusal
   * takes. So the "you may…" prompt in front of it is dropped and the selection carries the
   * decision — "By trashing 1 card …, Draw 1" reads as one choice on the card, not two.
   *
   * `abortOnDecline` is required: without it a refusal would skip only this action and leave
   * the rest of the effect resolving for free off a cost that was never paid.
   */
  const costAsksThisAction =
    action.kind !== "RawUnparsed" &&
    action.optional === true &&
    action.abortOnDecline === true &&
    payableActionCost !== undefined &&
    costIsAskedAsSelection(payableActionCost as Cost);
  const targetAsksThisAction = optionalTargetAsksAction(ctx, action);

  // "You may" — ask the controller. Skip the prompt when the action carries a cost that is
  // provably unpayable (e.g. a "by trashing your security" cost with an empty security stack):
  // offering "you may…" for an effect the controller cannot perform is misleading. The cost
  // path below still runs, fails cleanly, and yields the same abort semantics — just no prompt.
  if (
    action.kind !== "RawUnparsed" &&
    action.kind !== "SubTrigger" &&
    action.kind !== "Replacement" &&
    action.kind !== "CostModifier" &&
    // A color waiver is a legality permission, not an effect activation. Printed
    // "you may use this card without meeting its color requirements" means the
    // player may choose to USE the card; asking again while recomputing a hand
    // card makes the permission inert in continuous contexts (EX1-071, BT6 Options).
    action.kind !== "WaiveColorRequirement" &&
    action.optional &&
    // An opponent-directed optional trash is THEIR up-to selection. Let the Trash
    // resolver ask that opponent and record a zero-card choice as a decline for
    // the printed "if they don't" tail (BT13-102), instead of opening a separate
    // source-controller prompt that loses the opponent-decline receipt.
    (action.kind !== "Trash" || action.chooser !== "opponent") &&
    // An opponent-directed optional play is THEIR up-to card selection. The
    // PlayWithoutCost resolver routes it through ctx.ask.opponent and a zero-card
    // selection records that the preceding action did not act.
    (action.kind !== "PlayWithoutCost" || action.target.chooser !== "opponent") &&
    // RedirectAttack with chooser:"opponent" owns its optional decline at the combat
    // primitive so the defending player, rather than the source controller, decides
    // whether to switch targets (BT4-075 / Q1224-Q1227).
    (action.kind !== "RedirectAttack" || action.chooser !== "opponent") &&
    actionCost?.optional !== true
  ) {
    if (
      action.kind === "PlaceUnder" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !canAttemptPlaceUnder(ctx, action)
    ) {
      return unavailableAction(ctx, action, action.abortOnDecline === true);
    }
    // A "may attack" with no cost does nothing when no named Digimon can attack (Q2490), so it
    // is not asked. A cost-bearing attack keeps its prompt: the cost may still be paid.
    if (
      action.kind === "Attack" &&
      payableActionCost === undefined &&
      action.additionalCost === undefined &&
      !action.additionalCosts?.length &&
      !canAttemptAttack(ctx, action)
    ) {
      return unavailableAction(ctx, action, action.abortOnDecline === true);
    }
    if (
      action.kind === "Link" &&
      ctx.isActivationPending?.() !== true &&
      payableActionCost === undefined &&
      action.additionalCost === undefined &&
      !action.additionalCosts?.length &&
      !canAttemptLink(ctx, action)
    ) {
      return unavailableAction(ctx, action, action.abortOnDecline === true);
    }
    if (action.kind === "Attack" && onlyNonTurnPlayerAttackers(ctx, action)) {
      return unavailableAction(ctx, action);
    }
    // An optional hatch is meaningful only when it can move the top Digi-Egg into
    // an empty breeding slot. Do this before opening the confirmation so the UI
    // never offers an action that the Hatch primitive would immediately no-op.
    if (action.kind === "Hatch") {
      const owner = ctx.game.player(ctx.source.ownerSeat);
      if (owner.breeding !== undefined || owner.eggDeck.length === 0) return unavailableAction(ctx, action);
    }
    if (
      action.kind === "SecurityManipulation" &&
      action.op === "toHand" &&
      ctx.game.player(ctx.source.ownerSeat).security.length === 0
    ) {
      return unavailableAction(ctx, action, action.abortOnDecline === true);
    }
    // Do not offer an optional play when no legal loose card exists. Besides avoiding a
    // meaningless UI prompt, this is required for nested entry windows: Nokia played from
    // security must finish resolving when the controller has no Agumon/Gabumon to play.
    if (
      action.kind === "PlayWithoutCost" &&
      action.fromOwnDigivolutionStack === true &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !costCreatesTrashCandidate &&
      [action.target, ...(action.additionalSimultaneousTargets ?? [])].every(
        (target) => ownStackPlayCandidates(ctx, target).length === 0,
      )
    ) {
      return unavailableAction(ctx, action);
    }
    if (
      action.kind === "PlayWithoutCost" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !costCreatesTrashCandidate &&
      !action.target?.isSelf &&
      action.target?.filter?.isSelfRef !== true &&
      action.fromOwnDigivolutionStack !== true
    ) {
      const zones = action.from && action.from.length > 0 ? action.from : DEFAULT_PLAY_ZONES;
      // Fold the dynamic play-cost ceiling in before searching for candidates, exactly as the
      // resolver does. Without this the gate judges the clause at the printed `playCostLte`
      // (usually 0), finds nothing, and drops the optional play before any decision (BT19-100).
      const costScaledTarget = materializePlayCostLteScaling(ctx, action.target);
      const levelComparison = costScaledTarget.filter.levelComparison;
      const levelScaledTarget = materializeLevelComparisonScaling(
        costScaledTarget,
        levelComparison?.scaling === undefined ? 0 : scaleFactor(ctx, levelComparison.scaling),
      );
      const dpCeilingTarget = applyPlayDpCeilingModifier(ctx, action, levelScaledTarget);
      const costCeilingTarget = applyDecodeHostScope(action, applyPlayCostCeiling(ctx, action, dpCeilingTarget));
      const preflightTarget =
        ctx.playLevelCeilingDelta === undefined || ctx.playLevelCeilingDelta === 0
          ? costCeilingTarget
          : {
              ...costCeilingTarget,
              filter: {
                ...costCeilingTarget.filter,
                levelComparison:
                  costCeilingTarget.filter.levelComparison?.op === "lte" &&
                  costCeilingTarget.filter.levelComparison.value !== undefined
                    ? {
                        ...costCeilingTarget.filter.levelComparison,
                        value: costCeilingTarget.filter.levelComparison.value + ctx.playLevelCeilingDelta,
                      }
                    : costCeilingTarget.filter.levelComparison,
              },
            };
      const sameColorAsReturned = preflightTarget.filter.sameColorAsReturned === true;
      const staticPreflightTarget = sameColorAsReturned
        ? { ...preflightTarget, filter: { ...preflightTarget.filter, sameColorAsReturned: undefined } }
        : preflightTarget;
      let candidates = playableCandidates(
        ctx,
        staticPreflightTarget,
        candidateLooseInstances(ctx, staticPreflightTarget, zones),
        action.chooseDualMode,
      ).filter((candidate) => !isEffectPlayProhibited(ctx, candidate));
      // A return-cost clause can define the play target's color dynamically. Preflight the
      // pair transactionally: at least one currently returnable card must share a color with
      // at least one currently playable card, otherwise paying the return first would strand
      // the optional payload (EX10-068, Q5181/Q5182).
      if (sameColorAsReturned && action.cost?.kind === "return" && action.cost.target !== undefined) {
        const returnTarget = action.cost.target;
        const returnZones = zoneList(returnTarget.filter.zone ?? "trash");
        const returnable = candidateLooseInstances(ctx, returnTarget, returnZones);
        const returnableColors = new Set(
          returnable.flatMap((candidate) => ctx.game.definitionOf({ cardId: candidate.cardId } as never).colors),
        );
        candidates = candidates.filter((candidate) =>
          ctx.game
            .definitionOf({ cardId: candidate.cardId } as never)
            .colors.some((color) => returnableColors.has(color)),
        );
      }
      // A paid play with an activation cost must be transactional: do not offer it when
      // every legal target is unaffordable, otherwise the generic cost path below can move
      // the source card before `playInstances` discovers that memory cannot be paid.
      // DigiXros material selection can make an otherwise-unaffordable card legal later,
      // so a card with DigiXros requirements defers that check to the play resolver.
      if (action.payCost === true && ctx.fx.canAffordEffectPlay !== undefined) {
        const costDelta =
          (action.reduceCostBy ?? action.costReduction ?? 0) +
          (action.reduceCostByScaling === undefined ? 0 : scaleFactor(ctx, action.reduceCostByScaling)) +
          (action.reduceCostByIf !== undefined && evaluateCondition(ctx, action.reduceCostByIf.condition)
            ? action.reduceCostByIf.amount
            : 0);
        const affordability = await Promise.all(
          candidates.map(async (candidate) => ({
            candidate,
            affordable: await ctx.fx.canAffordEffectPlay!(candidate.instanceId, {
              costDelta: costDelta + availableEffectPlayAssemblyReduction(ctx, candidate),
            }),
          })),
        );
        candidates = affordability
          .filter(
            ({ candidate, affordable }) => affordable || digiXrosRequirementFor(candidate.cardId)?.[0] !== undefined,
          )
          .map(({ candidate }) => candidate);
      }
      if (candidates.length === 0) return unavailableAction(ctx, action);
    }
    // A PlaceUnder confirmation is actionable only when both sides of the move exist:
    // at least one eligible loose card and at least one legal destination host. Without
    // this preflight, cards such as BT8-104 published a "Place 1 card(s) under" decision
    // even with no X-Antibody card in hand, leaving the UI to confirm a guaranteed no-op.
    if (
      action.kind === "PlaceUnder" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !canAttemptPlaceUnder(ctx, action)
    )
      return unavailableAction(ctx, action);
    // A targeted PlaceInBattleAreaSelf shape is actually "place 1 matching Option from
    // hand" (the Four Great Dragons On Deletion family), not literal self-placement.
    // Skip its optional confirmation when the source zone has no legal candidate.
    if (action.kind === "PlaceInBattleAreaSelf" && action.target !== undefined) {
      const zones = action.target.from ?? action.target.source ?? action.target.zone ?? "hand";
      const candidates = candidateLooseInstances(
        ctx,
        action.target,
        (Array.isArray(zones) ? zones : [zones]) as ZoneRef[],
      );
      if (candidates.length === 0) return unavailableAction(ctx, action);
    }
    // A Return confirmation is actionable only when at least one legal source exists.
    // This covers optional recovery from trash (EX3-068) as well as optional bounce:
    // never ask the player to confirm a move that has no selectable card or permanent.
    if (
      action.kind === "Return" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !action.target.isSelf &&
      action.target.filter.isSelfRef !== true &&
      !(action.from ?? []).includes("digivolutionCards")
    ) {
      const zone = action.target.filter.zone;
      const looseZones = action.from ?? (zone !== undefined && zone !== "battleArea" ? zoneList(zone) : undefined);
      // Only preflight loose-zone recovery here. A battle-area Return may have an
      // activation cost that changes target legality (BT16-048 suspends the Digimon
      // whose DP becomes the bounce ceiling), so its candidates must be resolved
      // after payment by the normal action path.
      if (looseZones !== undefined && candidateLooseInstances(ctx, action.target, looseZones).length === 0) {
        // Paying a trash cost can itself create the recovery target: BT21-056 trashes a
        // [Vemmon]-text card from hand and may then return a matching card from the trash —
        // legal even when the trash starts empty, because the trashed cost card qualifies.
        // Offer the confirmation only when some payable cost card would match the Return filter.
        const trashCost = action.cost?.kind === "trash" ? action.cost : undefined;
        const costCreatesRecoveryCandidate = (): boolean => {
          if (trashCost?.target === undefined || !looseZones.includes("trash")) return false;
          const costZones = zoneList(trashCost.target.filter.zone ?? "hand");
          const payable = new Set(candidateLooseInstances(ctx, trashCost.target, costZones).map((c) => c.instanceId));
          if (payable.size === 0) return false;
          const zonelessReturnTarget = { ...action.target, filter: { ...action.target.filter, zone: undefined } };
          return candidateLooseInstances(ctx, zonelessReturnTarget, costZones).some((c) => payable.has(c.instanceId));
        };
        if (!costCreatesRecoveryCandidate()) return unavailableAction(ctx, action);
      }
    }
    // A scaled ceiling is only known once the action resolves, so only a fixed filter preflights.
    if (
      action.kind === "Return" &&
      (action.from ?? []).includes("digivolutionCards") &&
      action.scaling === undefined &&
      action.playCostCeiling === undefined &&
      returnableDigivolutionCards(ctx, action.target).length === 0
    ) {
      return unavailableAction(ctx, action);
    }
    // A "may digivolve" prompt is meaningful only when at least one matching source and
    // destination form a legal digivolution. In particular, "without paying the cost" does
    // not waive printed requirements (P-092 Q4182); do this before asking so the UI never
    // confirms an evolution the resolver will immediately discard. A printed "By [cost]"
    // processing condition is the exception: §15-7-5 lets the player pay it anyway (BT22-090).
    if (
      action.kind === "Digivolve" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !canAttemptDigivolveBeforeCost(ctx, action)
    ) {
      ctx.lastDigivolveResult = false;
      return unavailableAction(ctx, action, action.abortOnDecline === true);
    }
    if (
      action.kind === "DnaDigivolve" &&
      !allowsOptionalProcessingCostWithoutTarget(action) &&
      !canAttemptDnaDigivolve(ctx, action)
    ) {
      ctx.lastDigivolveResult = false;
      return unavailableAction(ctx, action);
    }
    const costUnpayable = payableActionCost !== undefined && !canPayCost(ctx, payableActionCost as Cost);
    // "By [cost], you may [effect]" pays first and asks afterwards: the leading prompt would make
    // a decline skip the cost too. The pay-then-ask block further down raises the payload prompt
    // once the cost is spent.
    if (!costUnpayable && !costAsksThisAction && !targetAsksThisAction && !paysCostFirst) {
      const chooser =
        action.kind === "Delete" && action.target.chooser === "opponent" ? requireOpponentAsk(ctx) : ctx.ask;
      const predecided = ctx.predecidedOptionalActions?.get(action);
      const modalChoices =
        predecided === undefined && action.kind === "Modal" ? declinableModalChoices(ctx, action) : undefined;
      let yes: boolean;
      if (modalChoices === undefined) {
        yes = predecided ?? (await askOptionalWithPrintedCost({ ctx, chooser, action, cost: payableActionCost }));
      } else {
        // An optional modal with a real choice asks it once: the options plus a decline entry.
        const declineIndex = modalChoices.labels.length;
        const pick = await chooser.chooseOption(ctx, [...modalChoices.labels, DECLINE_MODAL_CHOICE_LABEL], {
          declineIndex,
          choiceSummaries:
            action.kind === "Modal"
              ? [
                  ...modalChoices.optionIndices.map((index) =>
                    getDecisionEffectSummary({ actions: action.options[index]! }),
                  ),
                  null,
                ]
              : undefined,
          ...(modalChoices.choiceClauses ? { choiceClauses: [...modalChoices.choiceClauses, ""] } : {}),
        });
        yes = pick !== declineIndex;
        if (yes) {
          ctx.preselectedModalOption = { action, optionIndex: modalChoices.optionIndices[pick]! };
        }
      }
      if (!yes) {
        // `ifThisEffectDidNotAct` belongs to the immediately preceding action. The activation
        // receipt is separate and remains chosen if an earlier action was already accepted.
        ctx.lastEffectActed = false;
        if (isOpponentChosenProcessing(action)) markActivationChosen(ctx);
        else markActivationDeclined(ctx);
        return action.abortOnDecline === true;
      }
      // A cost paid between this answer and the pick must not be stranded by backing out.
      acceptedBeforeItsPick =
        chooser === ctx.ask &&
        payableActionCost === undefined &&
        additionalCost === undefined &&
        additionalCosts.length === 0;
      if (action.kind !== "SelectBind" || action.preserveOncePerTurnOnDecline !== true) {
        markActivationChosen(ctx);
      }
    }
  }
  // Pay a per-action cost first; abort the action if it cannot be paid. An OPTIONAL
  // resolves with no payment when they do. A Replacement carries its cost as the
  // prevention/cost-reduction gate paid by its OWN machinery (preventCheck), NOT up
  // front at install time, so it is excluded here.
  // The paid count of an "up to N" cost (BT7-040 <Digi-Burst up to 4>) drives this action's
  // scaling (-3000 per card actually trashed); a fixed-count cost leaves it undefined.
  const costPayment = { paidCount: 0 };
  let deferredCostSuspensions: string[] = [];
  // PlayPerLevel owns its own cost validation and payment (level-sum budget logic that the
  // standard payCost path cannot express); skip the generic cost gate so it is not double-paid.
  if (
    action.kind !== "RawUnparsed" &&
    action.kind !== "Replacement" &&
    action.kind !== "CostModifier" &&
    action.kind !== "SubTrigger" &&
    action.kind !== "CostGatedBlock" &&
    action.kind !== "PlayPerLevel" &&
    (action.costOptions?.length ?? 0) > 0
  ) {
    const paid = await payOneCostOption(ctx, action.costOptions as Cost[], costPayment);
    if (!paid) return action.abortOnDecline === true;
  } else if (
    action.kind !== "RawUnparsed" &&
    action.kind !== "Replacement" &&
    action.kind !== "CostModifier" &&
    action.kind !== "SubTrigger" &&
    action.kind !== "CostGatedBlock" &&
    action.kind !== "PlayPerLevel" &&
    // `DigivolveViaPlacement.cost` is a memory amount paid by the digivolve itself, not an
    // activation Cost, so it must not enter the generic cost-payment path.
    action.kind !== "DigivolveViaPlacement" &&
    payableActionCost
  ) {
    if (payableActionCost.kind === "attack" && action.kind === "GainKeyword") {
      // Attack costs are executed by GainKeyword's board handler so the attack-only
      // grant can be installed atomically at declaration. The generic payCost path
      // cannot perform that pairing because it has not yet resolved the action target.
      if (!canPayCost(ctx, payableActionCost)) return action.abortOnDecline === true;
    } else if (payableActionCost.optional) {
      // A cost paid by choosing cards out of the controller's own hand asks its own
      // question: choosing nothing is the refusal, and an unpaid cost aborts the clause on
      // exactly the path a refusal took. A "pay cost?" prompt in front of that selection
      // makes the player answer the same thing twice, which is not how the printed card
      // reads ("By trashing 1 card …, Draw 1" is one decision, not two).
      const costAsksItself = costIsAskedAsSelection(payableActionCost);
      const declinesAtSelection = ctx.costDeclinedAtSelection?.has(action) === true;
      const willPay =
        costAsksItself ||
        declinesAtSelection ||
        (ctx.predecidedOptionalCosts?.get(action) ??
          (await ctx.ask.optional(
            paysCostFirst && payableActionCost.raw !== undefined
              ? {
                  ...ctx,
                  activeEffectTextPart: ctx.activeEffectText,
                  activeEffectTextEmphasis: action.costTextEmphasis ?? payableActionCost.raw,
                }
              : ctx,
            `Pay cost: ${describeCost(payableActionCost)}?`,
          )));
      if (willPay) {
        if (!costAsksItself && !declinesAtSelection) markActivationChosen(ctx);
        const outerCostIsTheQuestion = ctx.costIsTheQuestion;
        const outerPayingDeclinableCost = ctx.payingDeclinableCost;
        ctx.costIsTheQuestion = costAsksItself;
        ctx.payingDeclinableCost = declinesAtSelection;
        const paid = await payCost(ctx, payableActionCost, costPayment);
        ctx.costIsTheQuestion = outerCostIsTheQuestion;
        ctx.payingDeclinableCost = outerPayingDeclinableCost;
        if (paid) markActivationChosen(ctx);
        if (!paid) {
          if (costAsksItself || declinesAtSelection) {
            markActivationDeclined(ctx);
          }
          return action.abortOnDecline === true;
        }
      } else {
        markActivationDeclined(ctx);
        // A clause may make only its processing condition optional; refusal skips
        // the remaining effect even when the payload itself is not optional.
        if (action.abortOnDecline === true) return true;
      }
    } else {
      const deferSuspendTriggers = action.kind === "Attack" && payableActionCost.kind === "suspend";
      const outerCostIsTheQuestion = ctx.costIsTheQuestion;
      ctx.costIsTheQuestion = costAsksThisAction || ctx.predecidedCostSelections?.has(action) === true;
      const paid = await payCost(ctx, payableActionCost, costPayment, { deferSuspendTriggers });
      ctx.costIsTheQuestion = outerCostIsTheQuestion;
      if (paid) markActivationChosen(ctx);
      if (paid && deferSuspendTriggers) deferredCostSuspensions = [...(ctx.lastSuspendedPermanentIds ?? [])];
      if (!paid) {
        // Where the cost selection replaced the "you may…" prompt, answering it with nothing IS
        // that prompt's decline, so it preserves the once-per-turn opportunity the same way.
        if (costAsksThisAction) {
          ctx.lastEffectActed = false;
          markActivationDeclined(ctx);
        }
        // An unpayable ACTIVATION cost ("By [paying X], [effect]. Then …") means the entire
        // ability does nothing, so abort the REMAINING actions of this effect too — otherwise
        // a downstream "Then …" payload (or a self-place security continuation) would resolve
        // for free off a cost-bearing head action that silently failed. Explicit
        // `abortOnDecline` means the IR author intended this cost/action to gate the
        // remaining clause as well. Two legacy activation-cost shapes also gate their whole
        // clause even when the IR omitted `abortOnDecline`: <Digi-Burst N> (trash from THIS
        const isDigiBurstCost =
          payableActionCost.kind === "trash" &&
          payableActionCost.target?.filter.zone === "digivolutionCards" &&
          payableActionCost.target.filter.isSelfRef === true;
        const isSecurityTrashCost =
          payableActionCost.kind === "trash" && payableActionCost.target?.filter.zone === "security";
        // An unpaid optional processing condition never activated this clause. Preserve
        // its OPT opportunity, but retain an earlier action's actual activation receipt.
        return unavailableAction(ctx, action, action.abortOnDecline === true || isDigiBurstCost || isSecurityTrashCost);
      }
    }
  }
  // When both the processing condition and payload are optional, pay the former
  // first, then offer the payload choice (e.g. Q6255: trash, then decline return).
  // `payCostBeforeOptional` reaches the same place from the other direction: a MANDATORY
  // activation cost under an optional payload (Q2813, Q2853, Q2804).
  if (action.kind !== "RawUnparsed" && action.optional && actionCost?.optional === true && !paysCostFirst) {
    if (optionalDigivolveImpossibleAfterCost(ctx, action)) {
      ctx.lastEffectActed = false;
      return false;
    }
    const yes = await ctx.ask.optional(ctx, describeAction(action));
    if (!yes) {
      ctx.lastEffectActed = false;
      markActivationDeclined(ctx);
      return action.abortOnDecline === true;
    }
    markActivationChosen(ctx);
  }
  if (
    action.kind !== "RawUnparsed" &&
    action.kind !== "Replacement" &&
    action.kind !== "CostModifier" &&
    action.kind !== "SubTrigger" &&
    action.kind !== "PlayPerLevel" &&
    action.kind !== "DigivolveViaPlacement"
  ) {
    const extraCosts = [
      ...((action.additionalCosts ?? []) as Cost[]),
      ...(action.additionalCost !== undefined ? [action.additionalCost as Cost] : []),
    ];
    for (const extraCost of extraCosts) {
      const paid = await payCost(ctx, extraCost, costPayment);
      if (!paid) return action.abortOnDecline === true;
      markActivationChosen(ctx);
    }
  }
  // "By [cost], you may [effect]" (`payCostBeforeOptional`): the WHOLE activation cost — the main
  // cost and every additional cost of the same "By placing A and B and C" clause — is paid, and
  // only then is the payload offered. Asking before the extra costs would leave Q2853's placement
  // half-done (this Tamer placed, [Growlmon] and [WarGrowlmon] left in the trash).
  if (action.kind !== "RawUnparsed" && paysCostFirst) {
    if (optionalDigivolveImpossibleAfterCost(ctx, action)) {
      ctx.lastEffectActed = false;
      return false;
    }
    const yes =
      ctx.predecidedOptionalActions?.get(action) ??
      (await ctx.ask.optional(
        {
          ...ctx,
          activeEffectTextPart: ctx.activeEffectText,
          activeEffectTextEmphasis: action.optionalTextEmphasis ?? action.effectTextPart,
        },
        describeAction(action),
      ));
    if (!yes) {
      ctx.lastEffectActed = false;
      markActivationDeclined(ctx);
      return action.abortOnDecline === true;
    }
    // Every cost is already paid, so backing out at the pick equals declining here.
    acceptedBeforeItsPick = true;
    markActivationChosen(ctx);
  }
  // An "up to N" <Digi-Burst> cost scales its action by the number of cards actually paid
  //. The runtime record omits the `scaling` hint for
  // this case, so the paid count is the sole scale factor — overriding the residual-stack read
  // scaleFactor would otherwise return for a `digivolutionCards` unit.
  const digiBurstScale =
    action.kind !== "RawUnparsed" &&
    action.kind !== "DigivolveViaPlacement" &&
    action.cost?.kind === "trash" &&
    action.cost.target?.upTo === true
      ? (costModifierPaidCount ?? costPayment.paidCount)
      : undefined;
  // The upTo-Digi-Burst paid count and a `scaling` ("for each") hint are two
  // independent multipliers; the current catalog never carries both (BT7-040 is the
  // only upTo-Digi-Burst and has no scaling). Silently letting the paid count win
  // would drop a real scaling factor and produce a wrong multiplier — surface it
  // loudly instead of guessing how to combine them.
  // For an up-to Digi-Burst cost, `digiBurstScale` is the authoritative
  // multiplier. A coexisting scaling hint is the printed "for each card
  // trashed" wording, not a second board count (EX10-033).
  // Scaling ("for each/every"): compute the multiplier from live state and apply it
  // to the amount (Draw/GainMemory/ModifyDP/ModifySecurityDP) or the target count
  // (Delete/Trash/Return/... ). A factor of 0 means the action does nothing.
  // A `usePaidCount` scaling reads the count of cards actually paid by THIS action's cost
  // ("for every Tamer this effect suspended", BT17-041) rather than re-counting the board.
  const paidCountScale =
    action.kind !== "RawUnparsed" && (action.scaling?.usePaidCount === true || costModifierPaidCount !== undefined)
      ? Math.floor(
          (costModifierPaidCount ?? costPayment.paidCount) /
            (action.scaling?.per && action.scaling.per > 0 ? action.scaling.per : 1),
        )
      : undefined;
  const scale =
    digiBurstScale !== undefined
      ? digiBurstScale
      : paidCountScale !== undefined
        ? paidCountScale
        : action.kind !== "RawUnparsed" && action.scaling
          ? scaleFactor(ctx, action.scaling)
          : undefined;
  // A scale of 0 makes a "for each X" action do nothing — EXCEPT a SET cost-modifier,
  // where a count of 0 is a meaningful absolute cost (e.g. "cost = your security count"
  // with an empty security stack sets the cost to 0). That case resolves its own value.
  const isSetCostModifier = action.kind === "CostModifier" && action.mode === "set";
  // A ceiling bonus changes an action's eligibility, not its base count. With zero
  // matching units the action still resolves at its printed ceiling (ST21-11).
  const isLevelCeilingScaling = action.scaling?.levelCeilingAdd !== undefined;
  // A budget scaling ("for every 2 [Argomon] in its digivolution cards, +1 to the maximum",
  // BT17-051) raises a BASE budget the action carries on its own. Zero units means no bonus,
  // never "the action does nothing" — the base budget still deletes.
  const isBudgetScaling = action.kind !== "RawUnparsed" && action.scaling?.budgetAdd !== undefined;
  const isBonusScaling = action.kind !== "RawUnparsed" && action.scaling?.bonus !== undefined;
  // targetColors is resolved after the action's permanent target is selected; it intentionally
  // has no board-wide scaleFactor. Do not let the generic zero guard abort it before dispatch.
  const isPerTargetScaling =
    action.scaling?.unit === "targetColors" || action.scaling?.unit === "targetFaceDownDigivolutionCards";
  if (
    scale !== undefined &&
    scale === 0 &&
    !isPerTargetScaling &&
    !isSetCostModifier &&
    !isLevelCeilingScaling &&
    !isBudgetScaling &&
    !isBonusScaling
  ) {
    return false;
  }

  // Record mandatory processing only after every optional processing-cost gate and
  // target preflight has passed. Structural wrappers do not make a nested optional
  // refusal count as a chosen activation on their own.
  if (
    action.kind !== "RawUnparsed" &&
    action.kind !== "ConditionalBranch" &&
    action.kind !== "Modal" &&
    action.kind !== "SubTrigger" &&
    action.kind !== "CostGatedBlock" &&
    (action.optional !== true || isOpponentChosenProcessing(action))
  ) {
    markActivationChosen(ctx);
  }

  ctx.pickingAcceptedOptional =
    acceptedBeforeItsPick && PICK_DECLINABLE_AFTER_YES.has(action.kind) && targetsOneCard(action);

  if (targetAsksThisAction) {
    // An empty pool raises no question. It must preserve the optional use just
    // like an explicit empty answer; a chosen target clears this receipt.
    markActivationDeclined(ctx);
    ctx.selectingOptionalTarget = true;
    const originalAsk = ctx.ask;
    const originalAction = action;
    let answered = false;
    const recordSelection = (answerCtx: EffectContext, selected: string[]) => {
      if (!answered && answerCtx === ctx && ctx.activeCostDecisionAction === originalAction && !ctx.payingCostDepth) {
        answered = true;
        if (selected.length > 0) markActivationChosen(ctx);
        else {
          ctx.lastEffectActed = false;
          markActivationDeclined(ctx);
        }
      }
      return selected;
    };
    ctx.ask = {
      ...originalAsk,
      chooseTargets: async (answerCtx, request) =>
        recordSelection(answerCtx, await originalAsk.chooseTargets(answerCtx, request)),
      selectCards: async (answerCtx, request) =>
        recordSelection(answerCtx, await originalAsk.selectCards(answerCtx, request)),
    };
  }

  // Everything the prologue worked out that a case body still needs.
  const scope: ActionScope = { scale, deferredCostSuspensions };

  switch (action.kind) {
    case "Draw":
    case "GainMemory":
    case "PayMemoryUpTo":
    case "SetMemory":
    case "SetTurnEndMemory":
    case "TrashTopDeck":
    case "ReducePlayCost":
    case "CostModifier":
      return await runResourceAction(ctx, action, scope);
    case "Delete":
    case "DeletePerColor":
    case "DeleteUntilCount":
    case "DeleteBudget":
    case "DeleteLevelBudget":
    case "DeleteByDPBudget":
    case "AddToDPDeleteBudget":
    case "Trash":
    case "ReturnToEggDeck":
    case "Return":
    case "ReturnTopDigivolutionCards":
    case "TrashTopStackedCards":
    case "DeletionMaxDpModifier":
    case "DelayedDelete":
    case "DelayedDeletePlayed":
      return await runRemovalAction(
        ctx,
        targetAsksThisAction && action.kind === "Return"
          ? { ...action, target: { ...action.target, upTo: true } }
          : action,
        scope,
      );
    case "HandManipulation":
    case "Suspend":
    case "Unsuspend":
    case "RepeatPerCount":
    case "MovePermanent":
    case "Hatch":
    case "ModifyDP":
    case "AddDPFromTrashedCard":
    case "AddDPFromSuspendedCost":
    case "SetBaseDP":
    case "GainKeyword":
    case "AddToHandSelf":
    case "PlaceInBattleAreaSelf":
      return await runBoardAction(
        ctx,
        targetAsksThisAction && (action.kind === "Suspend" || action.kind === "Unsuspend")
          ? { ...action, target: { ...action.target, upTo: true } }
          : action,
        scope,
      );
    case "PlayMultiple":
    case "PlayWithoutCost":
    case "PlayFromZone":
    case "PlayToken":
    case "PlayPerLevel":
      return await runPlayAction(ctx, action, scope);
    case "Restrict":
    case "DeclareCategoryImmunity":
    case "RestrictUnsuspendedDigivolve":
    case "RestrictDigivolveInto":
    case "MinDpFloor":
    case "StackTrashLock":
    case "RestrictMemoryGain":
    case "RestrictCostReduction":
    case "RestrictPlay":
    case "GlobalRestrict":
    case "GrantImmunity":
    case "ArmSuspendRestriction":
    case "DisableTimingEffect":
      return await runRestrictionAction(ctx, action, scope);
    case "Aura":
    case "GrantAuraToOpponents":
    case "WaiveColorRequirement":
      return await runStaticAction(ctx, action);
    case "GrantStatic":
    case "DynamicDigivolutionNames":
      return await runGrantStaticAction(ctx, action);
    case "Attack":
    case "Battle":
    case "RedirectAttack":
    case "SelectBind":
    case "EndAttack":
    case "GrantCanAttackUnsuspended":
    case "GrantVortexCanAttackPlayers":
      return await runCombatAction(ctx, action, scope);
    case "DeDigivolve":
    case "Digivolve":
    case "DigivolveViaPlacement":
    case "DnaDigivolve":
    case "AppFuse":
    case "PlaceUnder":
    case "TrashDigivolution":
    case "Link":
    case "GrantLinkCostReduction":
    case "CannotIgnoreDigivolutionRequirements":
    case "MindLink":
    case "DigiXrosMaterialZoneExpansion":
    case "AllowDigiXrosMaterialsFromTrash":
      return await runDigivolutionAction(ctx, action, scope);
    case "TamerOntoDigivolve":
      return false;
    case "Modal":
    case "ConditionalBranch":
    case "DelayedEffect":
    case "SubTrigger":
    case "Replacement":
    case "Prevent":
    case "GainTriggeredEffect":
    case "GainEffect":
    case "CostGatedBlock":
    case "RestrictEffect":
      return await runControlFlowAction(ctx, action);
    case "ActivateMain":
    case "ActivateOptionMain":
    case "WinGame":
    case "ReactivateEffect":
    case "ActivateForeignEffect":
    case "ActivateEffect":
    case "UseOptionWithoutCost":
    case "RawUnparsed":
      return await runMetaAction(ctx, action);
    case "OpponentMayTrashSecurity":
    case "SecurityManipulation":
    case "RecoverByTrashingMostSecurity":
    case "Recover":
    case "trashSecurityTop":
    case "ModifySecurityDP":
    case "SecurityAttackInvert":
    case "DisableSecurityEffect":
      return await runSecurityAction(ctx, action, scope);
    case "Search":
    case "SearchSecurity":
    case "Look":
    case "Reveal":
    case "RevealAdd":
    case "HandRevealAdd":
    case "RevealChooseDeleteBudget":
      return await runRevealAction(ctx, action);
    default: {
      // The TypeScript union is exhaustive, but effects.json is data. If a catalog
      // action kind is missing from the Action union, JSON loading can still route it
      // here at runtime. Keep that gap loud instead of silently no-oping.
      unsupported(ctx, action as Action, `unknown action kind "${String((action as { kind?: unknown }).kind)}"`);
      return false;
    }
  }
}

function isTrashCostPaidWithoutSelection(ctx: EffectContext, cost: Cost): boolean {
  const target = cost.target;
  if (
    cost.kind !== "trash" ||
    target === undefined ||
    typeof target.count !== "number" ||
    target.upTo === true ||
    target.forceSelection === true ||
    target.filter.differentColors === true ||
    target.totalPlayCostBudget !== undefined
  ) {
    return false;
  }
  const zones = zoneList((target.from ?? target.filter.zone) as ZoneRef | ZoneRef[] | undefined);
  if (zones.length === 0) {
    return false;
  }
  return candidateLooseInstances(ctx, target, zones).length === target.count;
}

function asksIndependentlyOfYesPreset(ctx: EffectContext, action: Action): boolean {
  return (
    action.kind === "CostGatedBlock" && ctx.presetOptionalAnswer === true && ctx.oncePerTurnActivationChosen === true
  );
}

type AskOptionalWithPrintedCostParams = {
  ctx: EffectContext;
  chooser: DecisionApi;
  action: Action;
  cost: Cost | number | undefined;
};

async function askOptionalWithPrintedCost({
  ctx,
  chooser,
  action,
  cost,
}: AskOptionalWithPrintedCostParams): Promise<boolean> {
  const outerEffectTextPart = ctx.activeEffectTextPart;
  const outerEffectTextEmphasis = ctx.activeEffectTextEmphasis;
  const printedCost =
    action.kind !== "RawUnparsed" &&
    action.effectTextPart === undefined &&
    typeof cost === "object" &&
    cost.raw !== undefined &&
    ctx.activeEffectText !== undefined &&
    isTrashCostPaidWithoutSelection(ctx, cost)
      ? printedPassage(ctx.activeEffectText, cost.raw)
      : undefined;
  if (printedCost !== undefined) {
    ctx.activeEffectTextPart = ctx.activeEffectText;
    ctx.activeEffectTextEmphasis = printedCost;
  }
  const outerPresetOptionalAnswer = ctx.presetOptionalAnswer;
  if (asksIndependentlyOfYesPreset(ctx, action)) ctx.presetOptionalAnswer = undefined;
  try {
    return await chooser.optional(ctx, describeAction(action));
  } finally {
    ctx.presetOptionalAnswer = outerPresetOptionalAnswer;
    ctx.activeEffectTextPart = outerEffectTextPart;
    ctx.activeEffectTextEmphasis = outerEffectTextEmphasis;
  }
}

installActionRunner(runAction);
