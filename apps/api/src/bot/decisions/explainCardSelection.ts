import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { CardDefinition } from "@aegis/shared/cards/types";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { DecisionBasis } from "#api/bot/decisions/DecisionBasis";
import { getCardTieBreakValue } from "#api/bot/decisions/getCardTieBreakValue";
import { getDecisionCandidateSignature } from "#api/bot/decisions/getDecisionCandidateSignature";
import { orderIdenticalCandidatesById } from "#api/bot/decisions/orderIdenticalCandidatesById";
import { getUnitDecisionValue } from "#api/bot/decisions/getUnitDecisionValue";
import { getUnitTieBreakValue } from "#api/bot/decisions/getUnitTieBreakValue";
import { getVisibleDecisionCardValue } from "#api/bot/decisions/getVisibleDecisionCardValue";
import { scoreDecisionSummary } from "#api/bot/decisions/scoreDecisionSummary";
import type { BotProfile } from "#api/bot/profiles";
import type { BotHandCard, BotUnit, BotView } from "#api/bot/view";

type Params = {
  view: BotView | undefined;
  request: DecisionRequest;
  profile: BotProfile;
  preferBeneficialSelections: boolean;
};

export type CardSelection = { instanceIds: string[]; basis: DecisionBasis };

type CandidateRank = { primary: number; secondary: number };

type SelectionContext = {
  request: DecisionRequest;
  profile: BotProfile;
  view: BotView | undefined;
  preferBeneficialSelections: boolean;
  opponentUnits: Map<string, BotUnit>;
  ownUnits: Map<string, BotUnit>;
  ownHand: Map<string, BotHandCard>;
  visibleCardIds: Map<string, string>;
  isCost: boolean;
  isBenefit: boolean;
  unsuspending: boolean;
};

const HAND_CARD_BONUS = 0.5;
const NAMED_CARD_BONUS = 10;
const FREE_PLAY_PATTERN = /\bplay\b[\s\S]*\bwithout paying (?:the|its) cost\b/i;
const DISCARD_THEN_RECOVER_PATTERN =
  /\btrash 1 card in your hand[.] If you do, return\b[^.]*\bfrom your trash to (?:your|its owner's) hand\b/i;
const TRASH_RECOVERY_PATTERN = /\breturn\b[\s\S]*\btrash\b[\s\S]*\b(?:the |your )?hand\b/i;

function indexUnits(units: readonly BotUnit[]): Map<string, BotUnit> {
  const index = new Map<string, BotUnit>();
  for (const unit of units) {
    index.set(unit.permanentId, unit);
    if (unit.topCardInstanceId !== undefined) {
      index.set(unit.topCardInstanceId, unit);
    }
  }
  return index;
}

function buildContext({ view, request, profile, preferBeneficialSelections }: Params): SelectionContext {
  const options = request.options;
  const goal = options?.selectionGoal;
  const isCost =
    options?.purpose === "cost" ||
    goal === DecisionSelectionGoal.DISCARD.value ||
    goal === DecisionSelectionGoal.MATERIAL.value;
  const isBenefit =
    !isCost &&
    (goal === DecisionSelectionGoal.GAIN.value ||
      goal === DecisionSelectionGoal.PLAY.value ||
      goal === DecisionSelectionGoal.EVOLVE.value);
  return {
    request,
    profile,
    view,
    preferBeneficialSelections,
    opponentUnits: indexUnits(view?.opponentBoard ?? []),
    ownUnits: indexUnits(view?.breeding === undefined ? (view?.board ?? []) : [...view.board, view.breeding]),
    ownHand: new Map((view?.hand ?? []).map((card) => [card.instanceId, card])),
    visibleCardIds: new Map((options?.visibleCards ?? []).map((card) => [card.instanceId, card.cardId])),
    isCost,
    isBenefit,
    unsuspending: view !== undefined && options?.targetFate === "unsuspend" && options?.purpose !== "cost",
  };
}

function getCandidateCardId(context: SelectionContext, instanceId: string): string | undefined {
  return (
    context.visibleCardIds.get(instanceId) ??
    context.ownHand.get(instanceId)?.cardId ??
    context.ownUnits.get(instanceId)?.cardId ??
    context.opponentUnits.get(instanceId)?.cardId
  );
}

function countSharedTraits(unit: BotUnit, peers: readonly (CardDefinition | undefined)[]): number {
  const traits = new Set(unit.definition?.types ?? []);
  return peers.filter((peer) => (peer?.types ?? []).some((trait) => traits.has(trait))).length;
}

function getSynergyPeers(
  context: SelectionContext,
  unit: BotUnit,
  isOpponent: boolean,
): (CardDefinition | undefined)[] {
  const side = isOpponent ? (context.view?.opponentBoard ?? []) : (context.view?.board ?? []);
  const trash = isOpponent ? (context.view?.opponentTrashCardIds ?? []) : [];
  return [
    ...side.filter((peer) => peer !== unit).map((peer) => peer.definition),
    ...trash.map((cardId) => getCardDefinition(cardId)),
  ];
}

function getCardTieBreak(context: SelectionContext, instanceId: string): number {
  const opponent = context.opponentUnits.get(instanceId);
  const unit = context.ownUnits.get(instanceId) ?? opponent;
  if (unit !== undefined) {
    const peers = getSynergyPeers(context, unit, opponent !== undefined);
    const controllerSeat = opponent === undefined ? context.view?.seat : context.view?.opponentSeat;
    const controllerTurn = controllerSeat !== undefined && context.view?.turnSeat === controllerSeat;
    return getUnitTieBreakValue({ unit, controllerTurn }) + countSharedTraits(unit, peers) * 0.001;
  }
  const cardId = getCandidateCardId(context, instanceId);
  const definition =
    context.ownHand.get(instanceId)?.definition ?? (cardId === undefined ? undefined : getCardDefinition(cardId));
  return getCardTieBreakValue({ definition });
}

function getCandidateCardValue(context: SelectionContext, instanceId: string): number {
  const unit = context.ownUnits.get(instanceId) ?? context.opponentUnits.get(instanceId);
  if (unit !== undefined) {
    return getUnitDecisionValue({ unit });
  }
  return getVisibleDecisionCardValue({ instanceId, request: context.request, view: context.view });
}

function rankGoalCandidate(context: SelectionContext, instanceId: string): CandidateRank {
  const value = getCandidateCardValue(context, instanceId);
  const handUse = context.ownHand.has(instanceId) ? HAND_CARD_BONUS : 0;
  const tieBreak = getCardTieBreak(context, instanceId);
  if (context.isCost) {
    return { primary: -(value + handUse), secondary: -tieBreak };
  }
  const controller = context.request.options?.effectControllerSeat ?? context.request.seat;
  const sign = controller === context.request.seat ? 1 : -1;
  return { primary: sign * (value - handUse), secondary: sign * tieBreak };
}

function isPreferredFreePlay(context: SelectionContext, instanceId: string): boolean {
  const options = context.request.options;
  const effectText = options?.effectTextPart ?? options?.effectText ?? "";
  return (
    context.preferBeneficialSelections &&
    context.request.kind === "selectCards" &&
    options?.purpose === "acceptedOptional" &&
    !context.ownUnits.has(instanceId) &&
    !context.opponentUnits.has(instanceId) &&
    (FREE_PLAY_PATTERN.test(effectText) || TRASH_RECOVERY_PATTERN.test(effectText))
  );
}

function rankBoardCandidate(context: SelectionContext, instanceId: string): CandidateRank {
  const tieBreak = getCardTieBreak(context, instanceId);
  if (isPreferredFreePlay(context, instanceId)) {
    const cardId = context.visibleCardIds.get(instanceId) ?? context.ownHand.get(instanceId)?.cardId;
    const card = cardId === undefined ? undefined : getCardDefinition(cardId);
    if (card !== undefined) {
      return {
        primary: (card.level ?? 0) + Math.max(0, card.playCost) / 10 + (card.dp ?? 0) / 10000,
        secondary: tieBreak,
      };
    }
  }
  const enemy = context.opponentUnits.get(instanceId);
  const mine = context.ownUnits.get(instanceId);
  if (context.unsuspending) {
    if (mine !== undefined) {
      return { primary: mine.suspended ? 1_000 + getUnitDecisionValue({ unit: mine }) : 0, secondary: tieBreak };
    }
    if (enemy !== undefined) {
      return { primary: enemy.suspended ? -1_000 - getUnitDecisionValue({ unit: enemy }) : 0, secondary: -tieBreak };
    }
  }
  if (enemy !== undefined && enemy.suspended && context.request.options?.targetFate === "suspend") {
    return { primary: 500 + getUnitDecisionValue({ unit: enemy }), secondary: tieBreak };
  }
  if (enemy !== undefined) {
    return { primary: 1_000 + getUnitDecisionValue({ unit: enemy }), secondary: tieBreak };
  }
  if (mine !== undefined) {
    return { primary: -getUnitDecisionValue({ unit: mine }), secondary: -tieBreak };
  }
  const handUse = context.ownHand.get(instanceId)?.definition === undefined ? 0 : HAND_CARD_BONUS;
  return {
    primary: -getVisibleDecisionCardValue({ instanceId, request: context.request, view: context.view }) - handUse,
    secondary: getEffectTextNameBonus(context, instanceId) - tieBreak,
  };
}

function getEffectTextNameBonus(context: SelectionContext, instanceId: string): number {
  const options = context.request.options;
  const effectText = options?.effectText ?? options?.effectTextPart ?? "";
  const cardId = getCandidateCardId(context, instanceId);
  const name = cardId === undefined ? undefined : getCardDefinition(cardId)?.nameEn;
  return name !== undefined && effectText.includes(`[${name}]`) ? NAMED_CARD_BONUS : 0;
}

function rankCandidate(context: SelectionContext, instanceId: string): CandidateRank {
  if (context.view === undefined) {
    const value = getVisibleDecisionCardValue({ instanceId, request: context.request });
    const tieBreak = getCardTieBreak(context, instanceId);
    if (context.isCost) {
      return { primary: -value, secondary: -tieBreak };
    }
    if (context.isBenefit) {
      const controller = context.request.options?.effectControllerSeat ?? context.request.seat;
      const sign = controller === context.request.seat ? 1 : -1;
      return { primary: sign * value, secondary: sign * tieBreak };
    }
    return { primary: 0, secondary: -tieBreak };
  }
  if (context.isCost || context.isBenefit) {
    return rankGoalCandidate(context, instanceId);
  }
  return rankBoardCandidate(context, instanceId);
}

function compareRanks(left: CandidateRank, right: CandidateRank): number {
  return right.primary - left.primary || right.secondary - left.secondary;
}

function sumRanks(ranks: readonly CandidateRank[]): CandidateRank {
  return ranks.reduce(
    (total, rank) => ({ primary: total.primary + rank.primary, secondary: total.secondary + rank.secondary }),
    { primary: 0, secondary: 0 },
  );
}

function explainProtection(context: SelectionContext, candidates: readonly string[]): CardSelection {
  const options = context.request.options;
  const protectedUnit =
    context.request.sourcePermanentId === undefined
      ? undefined
      : context.ownUnits.get(context.request.sourcePermanentId);
  const price = (instanceId: string): number => {
    const unit = context.ownUnits.get(instanceId);
    if (unit === undefined || unit === protectedUnit) {
      return 0;
    }
    return getUnitDecisionValue({ unit });
  };
  const needed = Math.max(1, options?.min ?? 0, options?.max ?? 1);
  const ordered = [...candidates].sort(
    (left, right) => price(left) - price(right) || getCardTieBreak(context, left) - getCardTieBreak(context, right),
  );
  const chosen = ordered.slice(0, needed);
  const protectedValue =
    protectedUnit === undefined ? Number.POSITIVE_INFINITY : getUnitDecisionValue({ unit: protectedUnit });
  const totalPrice = chosen.reduce((sum, instanceId) => sum + price(instanceId), 0);
  const required = (options?.min ?? 0) > 0;
  const worthIt = chosen.length === needed && totalPrice < protectedValue;
  return { instanceIds: worthIt || required ? chosen : [], basis: DecisionBasis.PROTECTION.value };
}

function keepDistinctCards(context: SelectionContext, ordered: readonly string[]): string[] {
  if (!context.request.options?.distinctCardIds) {
    return [...ordered];
  }
  const selectedCardIds = new Set<string>();
  return ordered.filter((instanceId) => {
    const cardId = getCandidateCardId(context, instanceId);
    if (cardId === undefined || selectedCardIds.has(cardId)) {
      return false;
    }
    selectedCardIds.add(cardId);
    return true;
  });
}

function selectOpponentTargets(context: SelectionContext, ranked: readonly string[], max: number): string[] {
  const suspending = context.request.options?.targetFate === "suspend";
  return ranked
    .filter((instanceId) => {
      const unit = context.opponentUnits.get(instanceId);
      return unit !== undefined && !(suspending && unit.suspended);
    })
    .slice(0, max);
}

function explainUnforcedSelection(context: SelectionContext, ranked: readonly string[]): CardSelection {
  const options = context.request.options;
  const max = options?.max ?? 1;
  if (context.isBenefit) {
    const controller = options?.effectControllerSeat ?? context.request.seat;
    if (context.view !== undefined && controller !== context.request.seat) {
      return { instanceIds: [], basis: DecisionBasis.SCORED.value };
    }
    if ((getSummaryScore(context) ?? 0) < 0) {
      return { instanceIds: [], basis: DecisionBasis.SCORED.value };
    }
    if (context.view !== undefined || controller === context.request.seat) {
      return { instanceIds: ranked.slice(0, Math.min(1, max)), basis: DecisionBasis.SCORED.value };
    }
  }
  if (context.unsuspending) {
    const useful = ranked.filter((instanceId) => context.ownUnits.get(instanceId)?.suspended);
    return { instanceIds: useful.slice(0, Math.min(1, max)), basis: DecisionBasis.SCORED.value };
  }
  if (options?.purpose === "acceptedOptional") {
    return { instanceIds: ranked.slice(0, 1), basis: DecisionBasis.SCORED.value };
  }
  if (options?.purpose === "cost") {
    const affordable = ranked.filter((instanceId) => !context.opponentUnits.has(instanceId));
    const pool = affordable.length > 0 ? affordable : ranked;
    if (pool.length < max) {
      return { instanceIds: [], basis: DecisionBasis.RULE.value };
    }
    return { instanceIds: pool.slice(0, max), basis: DecisionBasis.SCORED.value };
  }
  if (ranked[0] !== undefined && context.opponentUnits.has(ranked[0])) {
    return { instanceIds: selectOpponentTargets(context, ranked, max), basis: DecisionBasis.SCORED.value };
  }
  return explainOwnOptionalSelection(context, ranked);
}

function getSummaryScore(context: SelectionContext): number | undefined {
  const summary = context.request.options?.effectSummary;
  if (summary === undefined) {
    return undefined;
  }
  const controller = context.request.options?.effectControllerSeat ?? context.request.seat;
  const sign = controller === context.request.seat ? 1 : -1;
  return (
    sign * scoreDecisionSummary({ summary, profile: context.profile, view: context.view, controllerSeat: controller })
  );
}

function getDiscardRecoveryScore(context: SelectionContext): number | undefined {
  const options = context.request.options;
  const effectText = options?.effectTextPart ?? options?.effectText ?? "";
  if (!context.isCost || !DISCARD_THEN_RECOVER_PATTERN.test(effectText)) {
    return undefined;
  }
  return context.profile.weights.digivolveDraw;
}

function explainOwnOptionalSelection(context: SelectionContext, ranked: readonly string[]): CardSelection {
  const summaryBenefit = getSummaryScore(context);
  const benefit = summaryBenefit === 0 ? (getDiscardRecoveryScore(context) ?? 0) : summaryBenefit;
  const first = ranked[0];
  if (benefit === undefined || first === undefined) {
    return { instanceIds: [], basis: DecisionBasis.UNSCORED_SELECTION.value };
  }
  const price = context.isCost ? getCandidateCardValue(context, first) : 0;
  if (benefit === 0 && price === 0) {
    return { instanceIds: [], basis: DecisionBasis.UNSCORED_SELECTION.value };
  }
  return { instanceIds: benefit > price ? [first] : [], basis: DecisionBasis.SCORED.value };
}

export function explainCardSelection(params: Params): CardSelection {
  const { request } = params;
  const options = request.options;
  const candidates = options?.candidateInstanceIds ?? [];
  if (candidates.length === 0) {
    return { instanceIds: [], basis: DecisionBasis.FORCED.value };
  }
  const context = buildContext(params);
  if (options?.selectionGoal === DecisionSelectionGoal.PROTECT.value) {
    return explainProtection(context, candidates);
  }
  const ranks = new Map(candidates.map((instanceId) => [instanceId, rankCandidate(context, instanceId)]));
  const rankOf = (instanceId: string): CandidateRank => ranks.get(instanceId) ?? { primary: 0, secondary: 0 };
  const allowedCombinations = request.kind === "chooseTargets" ? options?.allowedTargetCombinations : undefined;
  if (allowedCombinations !== undefined) {
    const best = [...allowedCombinations].sort((left, right) =>
      compareRanks(sumRanks(left.map(rankOf)), sumRanks(right.map(rankOf))),
    )[0];
    return {
      instanceIds: best ?? [],
      basis: allowedCombinations.length <= 1 ? DecisionBasis.FORCED.value : DecisionBasis.SCORED.value,
    };
  }
  const ranked = keepDistinctCards(
    context,
    orderIdenticalCandidatesById({
      ordered: [...candidates].sort((left, right) => compareRanks(rankOf(left), rankOf(right))),
      getSignature: (instanceId) => getDecisionCandidateSignature({ view: params.view, request, instanceId }),
    }),
  );
  const min = options?.min ?? 0;
  if (min > 0) {
    return {
      instanceIds: ranked.slice(0, min),
      basis: min >= ranked.length ? DecisionBasis.FORCED.value : DecisionBasis.SCORED.value,
    };
  }
  return explainUnforcedSelection(context, ranked);
}
