import { selectAllianceAlly } from "#api/bot/selectAllianceAlly";
import { getCompiledCard, type CardDefinition, type Filter } from "@aegis/shared";
import type { Candidate } from "./candidates.js";
import type { BotProfile } from "./profiles.js";
import type { BotUnit, BotView } from "./view.js";

/**
 * The bot's single evaluation function.
 *
 * Every candidate action is scored in the same unit — roughly "memory points" — and the
 * policy plays the highest-scoring one. Passing the turn scores 0, so an action is taken
 * only when it is measurably better than doing nothing; that is what stops the bot from
 * overextending just because something is affordable.
 *
 * Depth is one ply plus two cheap lookaheads that a pure one-ply score cannot express:
 *   - LETHAL: an attack that resolves against an empty security stack wins the game, so
 *     it is scored above everything else;
 *   - TURN FORFEIT: an action that pushes memory across zero ends the turn, so its cost
 *     includes the attacks it throws away.
 *
 * No search tree: scoring one candidate is a handful of arithmetic operations over board
 * arrays that hold a few units each.
 */

/** A Digimon's worth on the board, in the same points as everything else. */
export function bodyValue(unit: { level: number; dp: number }): number {
  return unit.level + (unit.dp / 1_000) * 0.6;
}

function definitionBodyValue(definition: CardDefinition): number {
  return bodyValue({ level: definition.level ?? 0, dp: definition.dp });
}

function hasKeyword(unit: BotUnit, keyword: string): boolean {
  return unit.keywords.includes(keyword);
}

interface AttackProjectionParams {
  view: BotView;
  attacker: BotUnit;
}

function projectAllianceAttacker({ view, attacker }: AttackProjectionParams): BotUnit {
  if (!hasKeyword(attacker, "Alliance")) {
    return attacker;
  }
  const ally = selectAllianceAlly({ view, attackerId: attacker.permanentId });
  return ally === undefined ? attacker : { ...attacker, dp: attacker.dp + ally.dp };
}

type InterceptorParams = { view: BotView; attacker: BotUnit; targetPermanentId?: string };

function getOpposingInterceptors({ view, attacker, targetPermanentId = "player" }: InterceptorParams): BotUnit[] {
  const redirectTargets = new Set(attacker.attackRedirectTargets?.[targetPermanentId]?.targetIds ?? []);
  return view.opponentBoard.filter(
    (unit) => redirectTargets.has(unit.permanentId) || (!unit.suspended && hasKeyword(unit, "Blocker")),
  );
}

/**
 * How likely the security card an attacker flips is to delete it. The opponent's deck is
 * unknown, so this is a prior: it decays as the attacker gets bigger, and is zero with no
 * security left to check.
 *
 * The decay must be strict, not merely steep. The consumer multiplies this by `bodyValue`,
 * which rises without bound, so a factor that FLOORS at some size makes the product start
 * rising again — and the bot goes back to preferring its smallest Digimon as the attacker,
 * which is the opposite of how the attack step works. Exponential decay keeps the product
 * monotonically falling at every size.
 */
function securityRiskFactor(view: BotView, attacker: BotUnit): number {
  if (view.opponentSecurityCount <= 0) return 0;
  return 0.55 * Math.exp(-0.18 * (attacker.dp / 1_000));
}

/**
 * Penalty for leaving the attacker suspended in front of Digimon that can kill it.
 *
 * `exclude` drops a Digimon this very attack is about to delete: counting the target as a
 * future threat charges the attack twice for the same body.
 */
function retaliationExposure(view: BotView, attacker: BotUnit, profile: BotProfile, exclude?: BotUnit): number {
  let threats = 0;
  for (const unit of view.opponentBoard) {
    if (unit.permanentId === exclude?.permanentId) continue;
    if (unit.dp >= attacker.dp) threats += 1;
  }
  return profile.weights.retaliation * Math.min(threats, 3) * bodyValue(attacker) * 0.3;
}

/**
 * How often a defender chump-blocks: throws away a blocker that loses the battle purely to
 * deny one security check. Less often than they take a block they win, but far from never
 * — and never modelling it hands the attack full credit for security it may not strip.
 */
const CHUMP_BLOCK_LIKELIHOOD = 0.5;

interface Interception {
  /** Probability the attack is intercepted rather than resolving. */
  chance: number;
  /** Score of the intercepted branch: we lose the attacker, or we kill the blocker. */
  outcome: number;
}

/**
 * What an opposing ＜Blocker＞ does to this attack.
 *
 * Interception does not require the blocker to WIN. Any unsuspended blocker can step in
 * front, and the attack then never reaches security — the outcome differs (a blocker that
 * holds eats our attacker, a smaller one dies to it) but in both cases the security check
 * we were paid for does not happen. `blockerRisk` reads as the probability the defender
 * takes the block, which is what separates a profile that respects blockers from one that
 * runs at them.
 */
function interception(
  view: BotView,
  attacker: BotUnit,
  profile: BotProfile,
  targetPermanentId?: string,
  originalAttacker = attacker,
): Interception {
  const blocker = getOpposingInterceptors({ view, attacker, targetPermanentId }).reduce<BotUnit | undefined>(
    (best, unit) => (best === undefined || unit.dp > best.dp ? unit : best),
    undefined,
  );
  if (blocker === undefined) return { chance: 0, outcome: 0 };
  const holds = blocker.dp >= attacker.dp;
  const likelihood = profile.weights.blockerRisk * (holds ? 1 : CHUMP_BLOCK_LIKELIHOOD);
  return {
    chance: Math.min(1, Math.max(0, likelihood)),
    outcome: holds ? -profile.weights.loss * bodyValue(originalAttacker) : profile.weights.removal * bodyValue(blocker),
  };
}

/**
 * The memory this action costs us, in score points: cheap while it spends memory we
 * already hold, expensive once it hands memory to the opponent, and expensive again
 * because crossing zero ends the turn and forfeits every attack we had left.
 */
export function memoryPenalty(view: BotView, cost: number, profile: BotProfile): number {
  const { weights } = profile;
  const within = Math.min(cost, view.freeMemory);
  const overspend = Math.max(0, cost - view.freeMemory);
  let penalty = weights.memorySpend * within + weights.memoryHandover * overspend;
  if (overspend > 0) {
    // Only attackers that can still hit the player are really forfeited; a body with no
    // legal declaration left was never going to swing this turn.
    const forfeitable = view.readyAttackers.filter((unit) => unit.canAttackPlayer).length;
    // Capped because the marginal attack is worth less than the first: a wide board is not
    // proportionally more reason to refuse to develop, and without a cap the bot would
    // stop developing entirely once it had a few bodies out.
    penalty += weights.crossZero + weights.crossZeroPerReadyAttacker * Math.min(forfeitable, MAX_FORFEITED_ATTACKS);
  }
  return penalty;
}

/** How many forfeited attacks the cross-zero penalty is willing to count. */
const MAX_FORFEITED_ATTACKS = 4;

function scoreAttackPlayer(view: BotView, originalAttacker: BotUnit, profile: BotProfile): number {
  const attacker = projectAllianceAttacker({ view, attacker: originalAttacker });
  const { weights } = profile;

  // Lookahead: with the opponent's security empty, an attack that RESOLVES ends the game.
  // Any unsuspended blocker — winning or not — denies that, because a blocked attack never
  // checks security. Each blocker can only intercept once before it suspends, so winning
  // through them needs one attacker per blocker plus one that gets through.
  if (view.opponentSecurityCount <= 0 && (attacker.securityAttack ?? 1) > 0) {
    return scoreLethalAttempt(view, attacker, profile, originalAttacker);
  }

  // Extra checks cannot finish the game in the same attack after security runs out.
  // Use the public engine projection rather than reconstructing inherited grants.
  const checks = Math.min(attacker.securityAttack ?? 1, view.opponentSecurityCount);
  const risk = securityRiskFactor(view, attacker);
  const unblocked =
    checks * weights.securityAttack -
    weights.securityRisk * (1 - Math.pow(1 - risk, checks)) * bodyValue(originalAttacker);
  const { chance, outcome } = interception(view, attacker, profile, undefined, originalAttacker);

  return (1 - chance) * unblocked + chance * outcome - retaliationExposure(view, originalAttacker, profile);
}

/** Score an attack against an opponent who has no security left to check. */
function scoreLethalAttempt(view: BotView, attacker: BotUnit, profile: BotProfile, originalAttacker: BotUnit): number {
  const { weights } = profile;
  const blockers = getOpposingInterceptors({ view, attacker });

  // Nothing to step in front: this attack wins. `bodyValue` only orders the equally-winning
  // candidates so the choice is the biggest body rather than whatever the jitter picked.
  if (blockers.length === 0) return weights.lethal + bodyValue(originalAttacker);

  // Clearing a blocker costs us the attacker unless we out-DP the biggest of them.
  const biggest = blockers.reduce((left, right) => (right.dp > left.dp ? right : left));
  const exchange =
    attacker.dp > biggest.dp ? weights.removal * bodyValue(biggest) : -weights.loss * bodyValue(originalAttacker);

  // Enough bodies to exhaust every blocker and still swing: this attack is part of the
  // winning sequence, and `exchange` ranks WHICH body to spend on the clearing attacks.
  const redirectCapacity = attacker.attackRedirectTargets?.player?.capacity ?? 0;
  const blockerCapacity = view.opponentBoard.filter((unit) => !unit.suspended && hasKeyword(unit, "Blocker")).length;
  const readyPlayerAttackers = view.readyAttackers.filter((unit) => unit.canAttackPlayer).length;
  if (readyPlayerAttackers > blockerCapacity + redirectCapacity) {
    return weights.lethal * 0.5 + exchange;
  }

  // Not enough attackers to punch through this turn. The attack is then worth only the
  // exchange itself — positive when it kills a blocker for free, negative when it feeds one.
  return exchange;
}

function scoreAttackDigimon(view: BotView, originalAttacker: BotUnit, target: BotUnit, profile: BotProfile): number {
  const attacker = projectAllianceAttacker({ view, attacker: originalAttacker });
  const { weights } = profile;
  let score: number;
  if (attacker.dp > target.dp) {
    score = weights.removal * bodyValue(target);
  } else if (attacker.dp === target.dp) {
    score = weights.removal * bodyValue(target) - weights.loss * bodyValue(originalAttacker);
  } else {
    // Attacking into a bigger Digimon deletes only our own attacker.
    score = -weights.loss * bodyValue(originalAttacker);
  }
  // A blocker can intercept an attack aimed at a Digimon too, and the trade we planned
  // is not the trade we get.
  const { chance, outcome } = interception(view, attacker, profile, target.permanentId, originalAttacker);
  return (
    (1 - chance) * score +
    chance * outcome -
    // The target is about to die, so it is not also a body that can punish us next turn.
    retaliationExposure(view, originalAttacker, profile, attacker.dp >= target.dp ? target : undefined)
  );
}

function scoreDigivolve(view: BotView, candidate: Candidate, profile: BotProfile): number {
  const { weights } = profile;
  const definition = candidate.definition;
  const base = candidate.base;
  if (definition === undefined || base === undefined) return Number.NEGATIVE_INFINITY;

  const dpGain = (definition.dp - base.dp) / 1_000;
  const levelGain = (definition.level ?? 0) - base.level;
  let score = weights.dpGain * dpGain + weights.levelGain * levelGain + weights.digivolveDraw;

  // Never trade a good body for a strictly worse one just to spend a card.
  if (dpGain <= 0 && levelGain <= 0) score -= weights.downgrade;
  // Growing in the raising area is free development: nothing can attack it there.
  if (base.inBreeding) score += weights.breedingGrowth;

  return score - memoryPenalty(view, candidate.cost, profile);
}

function scorePlayDigimon(view: BotView, candidate: Candidate, profile: BotProfile): number {
  const definition = candidate.definition;
  if (definition === undefined) return Number.NEGATIVE_INFINITY;
  return profile.weights.playBody * definitionBodyValue(definition) - memoryPenalty(view, candidate.cost, profile);
}

function scorePlayTamer(view: BotView, candidate: Candidate, profile: BotProfile): number {
  return profile.weights.tamer - memoryPenalty(view, candidate.cost, profile);
}

function scorePlayOption(view: BotView, candidate: Candidate, profile: BotProfile): number {
  const { weights } = profile;
  const removal = candidate.definition && simpleRemovalValue(view, candidate.definition, profile);
  if (removal !== undefined) return removal - memoryPenalty(view, candidate.cost, profile);
  // Most Options answer something. With nothing on the other side of the table there is
  // usually nothing to answer, so an Option played then is close to a wasted card.
  const usefulness = view.opponentBoard.length > 0 ? 1 : weights.optionIdleDiscount;
  return weights.option * usefulness - memoryPenalty(view, candidate.cost, profile);
}

/** Conservative estimate for a complete, immediate removal clause with public targets. */
function simpleRemovalValue(view: BotView, definition: CardDefinition, profile: BotProfile): number | undefined {
  const main = getCompiledCard(definition.cardId)?.effects.filter((effect) => effect.trigger === "Main");
  if (main?.length !== 1) return undefined;
  const effect = main[0]!;
  if (effect.condition || effect.cost || effect.actions.length !== 1) return undefined;
  const action = effect.actions[0]!;
  if (action.kind !== "Delete" && action.kind !== "Return") return undefined;
  const allowedActionKeys = ["kind", "target", "to", "optional", "raw", "effectTextPart"];
  if (Object.keys(action).some((key) => !allowedActionKeys.includes(key))) return undefined;
  const target = action.target;
  if (Object.keys(target).some((key) => !["filter", "count", "upTo", "minimum", "allowZero"].includes(key)))
    return undefined;
  if (target.filter.controller !== "opponent") return undefined;
  const filter = target.filter;
  if (!simpleRemovalFilter(filter)) return undefined;
  const count = target.upTo ? Math.max(1, target.minimum ?? 0) : (target.count ?? 1);
  if (count !== "all" && (typeof count !== "number" || count < 1)) return undefined;
  const values = view.opponentBoard
    .filter((unit) => {
      if (filter.kind && !filter.kind.some((kind) => unit.definition?.kinds.some((printed) => printed === kind)))
        return false;
      if (filter.levels && !filter.levels.includes(unit.level)) return false;
      if (typeof filter.levelLte === "number" && unit.level > filter.levelLte) return false;
      if (filter.playCostLte !== undefined && (unit.definition?.playCost ?? Infinity) > filter.playCostLte)
        return false;
      if (filter.suspended && !unit.suspended) return false;
      if (filter.unsuspended && unit.suspended) return false;
      if (filter.dp) {
        const value = filter.dp.value!;
        if (filter.dp.op === "lte" && unit.dp > value) return false;
        if (filter.dp.op === "gte" && unit.dp < value) return false;
        if (filter.dp.op === "eq" && unit.dp !== value) return false;
      }
      return true;
    })
    .map(bodyValue)
    .sort((left, right) => right - left);
  // Replacement/protection effects can prevent removal; this is value, not a guarantee.
  return (
    values.slice(0, count === "all" ? values.length : count).reduce((sum, value) => sum + value, 0) *
    profile.weights.removal *
    0.8
  );
}

function simpleRemovalFilter(filter: Filter): boolean {
  if (
    Object.keys(filter).some(
      (key) =>
        !["controller", "kind", "levels", "levelLte", "playCostLte", "dp", "suspended", "unsuspended"].includes(key),
    )
  )
    return false;
  if (filter.levelLte !== undefined && typeof filter.levelLte !== "number") return false;
  return (
    !filter.dp ||
    (typeof filter.dp.value === "number" && Object.keys(filter.dp).every((key) => key === "op" || key === "value"))
  );
}

/** Score one candidate action. Higher is better; passing the turn is exactly 0. */
export function scoreCandidate(view: BotView, candidate: Candidate, profile: BotProfile): number {
  switch (candidate.kind) {
    case "attackPlayer":
      return candidate.attacker === undefined
        ? Number.NEGATIVE_INFINITY
        : scoreAttackPlayer(view, candidate.attacker, profile);
    case "attackDigimon":
      return candidate.attacker === undefined || candidate.target === undefined
        ? Number.NEGATIVE_INFINITY
        : scoreAttackDigimon(view, candidate.attacker, candidate.target, profile);
    case "digivolve":
      return scoreDigivolve(view, candidate, profile);
    case "dnaDigivolve": {
      const definition = candidate.definition;
      if (definition === undefined || (candidate.materials?.length ?? 0) < 2) {
        return Number.NEGATIVE_INFINITY;
      }
      const readyMaterials = candidate.materials!.filter((unit) => unit.canAttackPlayer).length;
      return (
        scorePlayDigimon(view, candidate, profile) +
        profile.weights.digivolveDraw +
        Math.max(0, 1 - readyMaterials) * profile.weights.securityAttack
      );
    }
    case "linkCard": {
      if (candidate.definition === undefined || candidate.base === undefined) {
        return Number.NEGATIVE_INFINITY;
      }
      const bonus = Math.max(0, candidate.definition.linkDp ?? 0) / 1000;
      const effect = candidate.definition.linkEffect?.trim() ? profile.weights.activate : 0;
      return profile.weights.dpGain * bonus + effect - memoryPenalty(view, candidate.cost, profile);
    }
    case "playDigimon":
      return scorePlayDigimon(view, candidate, profile);
    case "playTamer":
      return scorePlayTamer(view, candidate, profile);
    case "playOption":
      return scorePlayOption(view, candidate, profile);
    case "activateEffect":
      return profile.weights.activate;
    case "endPhase":
      return 0;
    default: {
      const unhandled: never = candidate.kind;
      throw new Error(`Unhandled bot candidate kind: ${String(unhandled)}`);
    }
  }
}

export interface BlockAppraisal {
  blockerPermanentId: string;
  score: number;
}

/**
 * Whether to spend a ＜Blocker＞ on the attack now in the window, and which one.
 *
 * A block trades our blocker's fate for one prevented security check (or for saving the
 * Digimon under attack), so the value scales with how close we are to losing: the last
 * security card is worth far more than the fifth.
 */
export function appraiseBlock(
  view: BotView,
  attacker: BotUnit | undefined,
  eligibleBlockerIds: readonly string[],
  attackTargetsPlayer: boolean,
  profile: BotProfile,
): BlockAppraisal | undefined {
  const { weights } = profile;
  if (attacker === undefined || eligibleBlockerIds.length === 0) return undefined;

  // With no security left, an attack on us that resolves ends the game. Blocking is then
  // not a trade to be priced against a blocker's value — it is survival, and it must beat
  // every threshold on every profile. An aggressive bot that "held its blocker" here would
  // simply lose the game it was still in.
  const facingDefeat = attackTargetsPlayer && view.securityCount <= 0;
  const critical = view.securityCount <= 1;
  const prevented = facingDefeat
    ? weights.lethal
    : attackTargetsPlayer
      ? weights.securityDefend * (critical ? weights.criticalSecurityMultiplier : 1)
      : weights.securityDefend * 0.5;

  let best: BlockAppraisal | undefined;
  for (const blockerId of eligibleBlockerIds) {
    const blocker = view.board.find((unit) => unit.permanentId === blockerId);
    if (blocker === undefined) continue;
    let outcome: number;
    if (blocker.dp > attacker.dp) outcome = weights.removal * bodyValue(attacker);
    else if (blocker.dp === attacker.dp) {
      outcome = weights.removal * bodyValue(attacker) - weights.loss * bodyValue(blocker);
    } else outcome = -weights.loss * bodyValue(blocker);

    const score = prevented + outcome;
    if (best === undefined || score > best.score) best = { blockerPermanentId: blockerId, score };
  }
  if (best === undefined) return undefined;
  if (!facingDefeat && best.score <= weights.blockThreshold) return undefined;
  return best;
}

/**
 * Whether to pay ＜Barrier＞ (trash the top security card) to save a Digimon: only when the
 * Digimon is worth more than the security card and losing that card is not fatal.
 */
export function shouldPayBarrier(view: BotView, permanentId: string, profile: BotProfile): boolean {
  if (view.securityCount <= 1) return false;
  const unit = view.board.find((candidate) => candidate.permanentId === permanentId);
  if (unit === undefined) return false;
  return bodyValue(unit) >= profile.weights.barrierThreshold;
}
