import { CardKind } from "@aegis/shared";
import { matchingEvoCost } from "#api/engine/cards/cardData";
import { MEMORY_MIN, PASS_TURN_MEMORY } from "#api/engine/MemoryGauge";
import type { PlannedTurnState } from "#api/bot/evolution/createPlannedTurnState";
import type { TrainingAction } from "#api/bot/training/actions";
import {
  OBSERVED_STATUS_FIELDS,
  type ObservedCard,
  type ObservedPermanent,
  type TrainingObservation,
} from "#api/bot/training/observation";

type ObservedPlayer = TrainingObservation["players"][number];

const clearStatuses = Object.freeze(
  Object.fromEntries(OBSERVED_STATUS_FIELDS.map((field) => [field, false])),
) as ObservedPermanent["statuses"];

export function applyPlannedAction(state: PlannedTurnState, index: number): PlannedTurnState {
  const action = state.actions[index];
  if (action === undefined) throw new Error("Planned action is outside legal choices");
  if (state.ended) throw new Error("Cannot plan past the end of the turn");
  const intent = action.intent;
  if (intent.type === "endPhase") return { ...state, ended: true, memoryGiven: PASS_TURN_MEMORY };
  const observation = state.observation;
  const ownIndex = observation.players.findIndex((player) => player.seat === observation.seat);
  const enemyIndex = 1 - ownIndex;
  const own = copyPlayer(observation.players[ownIndex]!);
  const enemy = copyPlayer(observation.players[enemyIndex]!);
  const memory = Math.max(MEMORY_MIN, observation.memory - (action.projectedCost ?? 0));
  const removedSources = new Set<string>();
  const removedTargets = new Set<string>();
  const reshapedPermanents: ObservedPermanent[] = [];
  let plannedPermanents = state.plannedPermanents;
  let won = false;
  let actions = state.actions.filter((_, position) => position !== index);
  const takeFromHand = (instanceId: string | undefined): ObservedCard | undefined => {
    const position = own.hand.findIndex((card) => card.instanceId === instanceId);
    if (position < 0) return undefined;
    const [card] = own.hand.splice(position, 1);
    own.handCount = Math.max(0, own.handCount - 1);
    removedSources.add(card!.instanceId);
    return card;
  };
  const removePermanent = (player: ObservedPlayer, permanentId: string): void => {
    const unit = player.board.find((entry) => entry.permanentId === permanentId);
    if (unit === undefined) return;
    player.board = player.board.filter((entry) => entry !== unit);
    player.trash = [...player.trash, unit.top, ...unit.stack];
    for (const id of [unit.permanentId, unit.top.instanceId]) {
      removedSources.add(id);
      removedTargets.add(id);
    }
  };
  const takeMaterials = (materialIds: readonly string[]): void => {
    for (const id of materialIds) {
      if (takeFromHand(id) !== undefined) continue;
      const trashed = own.trash.findIndex((card) => card.instanceId === id);
      if (trashed >= 0) {
        own.trash = own.trash.filter((_, position) => position !== trashed);
        removedSources.add(id);
        continue;
      }
      const unit = own.board.find((entry) => entry.permanentId === id || entry.top.instanceId === id);
      if (unit !== undefined) removePermanent(own, unit.permanentId);
    }
  };
  if (intent.type === "digivolve") {
    const card = takeFromHand(intent.instanceId);
    const target = ownUnit(own, intent.permanentId);
    if (card !== undefined && target !== undefined) {
      own.handCount += 1;
      const evolved: ObservedPermanent = {
        ...target,
        top: card,
        stack: [target.top, ...target.stack],
        dp: target.dp - (target.top.dp ?? 0) + (card.dp ?? 0),
      };
      replaceUnit(own, evolved);
      reshapedPermanents.push(evolved);
      removedTargets.add(target.permanentId);
    }
  } else if (intent.type === "playCard") {
    const card = takeFromHand(intent.instanceId);
    takeMaterials([...(action.materialIds ?? []), ...(intent.assembly?.materialInstanceIds ?? [])]);
    if (card !== undefined && card.kinds?.includes(CardKind.Option) === true) own.trash = [...own.trash, card];
    else if (card !== undefined) {
      plannedPermanents += 1;
      const entered = enteredPermanent(card, `planned-permanent-${plannedPermanents}`);
      own.board = [...own.board, entered];
      if (card.kinds?.includes(CardKind.Digimon) === true) reshapedPermanents.push(entered);
    }
  } else if (intent.type === "attack") {
    const attacker = own.board.find((unit) => unit.permanentId === intent.attackerPermanentId);
    if (attacker !== undefined) {
      replaceUnit(own, { ...attacker, suspended: true, canAttackPlayer: false, attackablePermanentIds: [] });
      actions = actions.filter(
        (entry) => entry.intent.type !== "attack" || entry.intent.attackerPermanentId !== attacker.permanentId,
      );
      if (intent.target.kind === "player") {
        if (enemy.securityCount === 0) won = true;
        else enemy.securityCount = Math.max(0, enemy.securityCount - Math.max(1, attacker.securityAttack));
      } else {
        const defenderId = intent.target.permanentId;
        const defender = enemy.board.find((unit) => unit.permanentId === defenderId);
        if (defender !== undefined) {
          if (attacker.dp >= defender.dp) removePermanent(enemy, defender.permanentId);
          if (attacker.dp <= defender.dp) removePermanent(own, attacker.permanentId);
        }
      }
    }
  } else {
    takeFromHand(action.sourceId);
    takeMaterials(action.materialIds ?? []);
  }
  if (removedSources.size > 0 || removedTargets.size > 0)
    actions = actions.filter(
      (entry) =>
        !removedSources.has(entry.sourceId ?? "") &&
        !removedTargets.has(entry.targetId ?? "") &&
        !(entry.intent.type === "attack" && removedSources.has(entry.intent.attackerPermanentId)),
    );
  actions = [...actions, ...reshapedPermanents.flatMap((unit) => digivolutionsOnto(own.hand, unit))].filter(
    (entry) => (entry.projectedCost ?? 0) <= memory - MEMORY_MIN,
  );
  const players = [...observation.players];
  players[ownIndex] = own;
  players[enemyIndex] = enemy;
  const crossed = memory < 0;
  return {
    observation: { ...observation, memory, players },
    actions,
    ended: won || crossed,
    ...(won ? { memoryGiven: 0 } : crossed ? { memoryGiven: -memory } : {}),
    won,
    plannedPermanents,
  };
}

function copyPlayer(player: ObservedPlayer): ObservedPlayer {
  return { ...player, hand: [...player.hand], board: [...player.board], trash: [...player.trash] };
}

function ownUnit(player: ObservedPlayer, permanentId: string): ObservedPermanent | undefined {
  return player.breeding?.permanentId === permanentId
    ? player.breeding
    : player.board.find((unit) => unit.permanentId === permanentId);
}

function replaceUnit(player: ObservedPlayer, unit: ObservedPermanent): void {
  if (player.breeding?.permanentId === unit.permanentId) player.breeding = unit;
  else player.board = player.board.map((entry) => (entry.permanentId === unit.permanentId ? unit : entry));
}

function enteredPermanent(card: ObservedCard, permanentId: string): ObservedPermanent {
  return {
    permanentId,
    top: card,
    stack: [],
    linked: [],
    dp: card.dp ?? 0,
    suspended: false,
    keywords: [],
    statuses: clearStatuses,
    securityAttack: 1,
    inBreeding: false,
    enteredThisTurn: true,
    canAttackPlayer: false,
    attackablePermanentIds: [],
    activatableEffectsJson: "[]",
  };
}

function digivolutionsOnto(hand: readonly ObservedCard[], unit: ObservedPermanent): TrainingAction[] {
  const base = unit.top.cardId;
  if (base === undefined || unit.statuses.cannotDigivolve) return [];
  return hand.flatMap((card) => {
    if (card.cardId === undefined || card.kinds?.includes(CardKind.Digimon) !== true) return [];
    const requirement = matchingEvoCost(card.cardId, base);
    if (requirement === undefined) return [];
    return [
      {
        intent: { type: "digivolve", instanceId: card.instanceId, permanentId: unit.permanentId },
        label: "Planned digivolution",
        sourceId: card.instanceId,
        targetId: unit.permanentId,
        projectedCost: requirement.memoryCost,
      },
    ];
  });
}
