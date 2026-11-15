import type { ObservedPermanent, TrainingObservation } from "#api/bot/training/observation";
import { DEFAULT_BOT_PROFILE, type BotProfile } from "#api/bot/profiles";

const PROTECTION_KEYWORDS = new Set(["Armor Purge", "Evade", "Partition", "Barrier", "Decoy", "Jamming"]);
const AGGRESSION_KEYWORDS = new Set(["Piercing", "Alliance", "Raid", "Overclock", "Rush"]);

function isTamerPermanent(permanent: ObservedPermanent): boolean {
  return Boolean(permanent.top?.kinds?.includes("Tamer"));
}

function isDigimonPermanent(permanent: ObservedPermanent): boolean {
  if (permanent.top?.kinds?.length) {
    return permanent.top.kinds.includes("Digimon");
  }
  return (permanent.top?.level ?? 0) > 0 || permanent.dp > 0;
}

function getSecurityValue(
  securityCount: number,
  weights: BotProfile["weights"],
  baseline: BotProfile["weights"],
): number {
  const scale = weights.securityDefend / baseline.securityDefend;
  if (securityCount <= 0) return -0.71143;
  let value = 0;
  for (let i = 1; i <= securityCount; i++) {
    if (i === 1) value += 0.880553;
    else if (i === 2) value += 0.664859;
    else if (i <= 5) value += 0.603216;
    else value += 0.509929;
  }
  return value * scale;
}

function getMaxDp(permanents: readonly ObservedPermanent[]): number {
  let maxDp = 0;
  for (const permanent of permanents) {
    if (isDigimonPermanent(permanent) && permanent.dp > maxDp) {
      maxDp = permanent.dp;
    }
  }
  return maxDp;
}

function countUnsuspendedBlockers(board: readonly ObservedPermanent[]): number {
  let count = 0;
  for (const permanent of board) {
    if (!permanent.suspended && permanent.keywords.includes("Blocker") && !permanent.statuses?.cannotBlock) {
      count += 1;
    }
  }
  return count;
}

function evaluatePlayer(
  player: TrainingObservation["players"][number],
  enemy: TrainingObservation["players"][number],
  weights: BotProfile["weights"],
  isPlayerTurn: boolean,
): number {
  const baseline = DEFAULT_BOT_PROFILE.weights;
  const levelScale = weights.levelGain / baseline.levelGain;
  const bodyScale = weights.playBody / baseline.playBody;
  const attackScale = weights.securityAttack / baseline.securityAttack;
  const defendScale = weights.securityDefend / baseline.securityDefend;
  const drawScale = weights.digivolveDraw / baseline.digivolveDraw;

  let value = getSecurityValue(player.securityCount, weights, baseline);

  const effectiveHand = Math.min(8, player.handCount) + Math.max(0, player.handCount - 8) * 0.4;
  value += effectiveHand * 0.094292 * drawScale;

  const trashValue = Math.min(12, player.trash?.length ?? 0) * 0.01;
  value += trashValue;

  if (player.deckCount <= 3) {
    value -= (4 - player.deckCount) * 0.28;
  }

  const delayCount = Math.min(3, player.delay?.length ?? 0);
  value += delayCount * 0.14;

  const enemyMaxUnsuspendedDp = getMaxDp(enemy.board.filter((unit) => !unit.suspended));
  const ownBlockers = countUnsuspendedBlockers(player.board);
  let tamerCount = 0;
  let readyBoardAttackers = 0;

  for (const permanent of player.board) {
    if (isTamerPermanent(permanent)) {
      tamerCount += 1;
      const tamerWeight = tamerCount <= 2 ? 0.427793 : 0.092359;
      value += tamerWeight + Math.min(0.08, (permanent.top?.playCost ?? 0) * 0.015);
      continue;
    }
    if (!isDigimonPermanent(permanent)) {
      value += 0.1;
      continue;
    }

    const level = permanent.top?.level ?? 0;
    const dp = Math.max(0, permanent.dp);
    const stackDepth = Math.min(4, Math.max(0, (permanent.stack?.length ?? 1) - 1));

    value += 0.094505 * levelScale * level;
    value += (0.107243 * bodyScale * dp) / 10000;
    value += stackDepth * 0.053486;

    if (!permanent.suspended) {
      value += 0.058179;
    } else if (enemyMaxUnsuspendedDp >= dp) {
      value -= 0.077723 * (weights.loss / baseline.loss);
    }

    if (!permanent.suspended && permanent.keywords.includes("Blocker") && !permanent.statuses?.cannotBlock) {
      value += (player.securityCount <= 2 ? 0.21152 : 0.188965) * defendScale;
    }

    let hasProtection =
      Boolean(permanent.statuses?.protectedFromEffectDeletion) ||
      Boolean(permanent.statuses?.immuneToOpponentDigimonEffects);
    let hasAggression = false;
    for (const keyword of permanent.keywords) {
      if (PROTECTION_KEYWORDS.has(keyword)) hasProtection = true;
      if (AGGRESSION_KEYWORDS.has(keyword)) hasAggression = true;
    }
    if (hasProtection) value += 0.080587;
    if (hasAggression) value += 0.047852;

    const checks = Math.max(0, permanent.securityAttack ?? 1);
    if (checks > 0) {
      if (isPlayerTurn && permanent.canAttackPlayer) {
        readyBoardAttackers += 1;
        value += 0.132112 * attackScale + 0.11937 * Math.max(0, checks - 1) * attackScale;
      } else if (!permanent.suspended && !permanent.statuses?.cannotAttack) {
        value += 0.06 * attackScale + 0.05 * Math.max(0, checks - 1) * attackScale;
      }
    }
  }

  if (player.breeding !== undefined) {
    const breeding = player.breeding;
    const level = breeding.top?.level ?? 0;
    const dp = Math.max(0, breeding.dp);
    const stackDepth = Math.min(3, Math.max(0, (breeding.stack?.length ?? 1) - 1));
    value += 0.121032 * levelScale * level + (0.05 * bodyScale * dp) / 10000 + stackDepth * 0.03;
  }

  const enemyAttackers = enemy.board.filter(
    (unit) => isDigimonPermanent(unit) && !unit.statuses?.cannotAttack && Math.max(0, unit.securityAttack ?? 1) > 0,
  ).length;
  if (player.securityCount === 0 && enemyAttackers > ownBlockers) {
    value -= 0.554353 * defendScale;
  }

  if (isPlayerTurn && enemy.securityCount === 0 && readyBoardAttackers > countUnsuspendedBlockers(enemy.board)) {
    value += 1.864889 * attackScale;
  }

  return value;
}

export function evaluateSearchPosition(observation: TrainingObservation, profile = DEFAULT_BOT_PROFILE): number {
  const own = observation.players.find((player) => player.seat === observation.seat);
  const opponent = observation.players.find((player) => player.seat !== observation.seat);
  if (own === undefined || opponent === undefined) {
    throw new Error("Search evaluation requires both seats");
  }
  const isOwnTurn = observation.turnSeat === observation.seat;
  const memoryFactor = isOwnTurn ? 0.12547 * profile.weights.memoryHandover : -0.12547;
  const clampedMemory = Math.max(-10, Math.min(10, observation.memory));
  const advantage =
    evaluatePlayer(own, opponent, profile.weights, isOwnTurn) -
    evaluatePlayer(opponent, own, DEFAULT_BOT_PROFILE.weights, !isOwnTurn) +
    clampedMemory * memoryFactor;
  return 1 / (1 + Math.exp(-Math.max(-12, Math.min(12, advantage))));
}
