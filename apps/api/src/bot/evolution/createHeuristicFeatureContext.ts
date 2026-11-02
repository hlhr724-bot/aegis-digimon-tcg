import type { TrainingWindow } from "#api/bot/training/policy";
import { FEATURES, type Feature } from "#api/bot/evolution/heuristic";
import type { ObservedCard, ObservedPermanent } from "#api/bot/training/observation";

const zeroFeatures = Object.freeze(
  Object.fromEntries(FEATURES.map((feature) => [feature, 0])) as Record<Feature, number>,
);

export function createHeuristicFeatureContext(window: TrainingWindow) {
  const own = window.observation.players.find((player) => player.seat === window.observation.seat)!;
  const enemy = window.observation.players.find((player) => player.seat !== window.observation.seat)!;
  const units = [...own.board, ...(own.breeding === undefined ? [] : [own.breeding]), ...enemy.board];
  const sources = new Map<string | undefined, ObservedPermanent>();
  const targets = new Map<string | undefined, ObservedPermanent>();
  for (const unit of units) {
    if (!sources.has(unit.permanentId)) sources.set(unit.permanentId, unit);
    if (!sources.has(unit.top.instanceId)) sources.set(unit.top.instanceId, unit);
    if (!targets.has(unit.permanentId)) targets.set(unit.permanentId, unit);
  }
  const cards = new Map<string | undefined, ObservedCard>();
  const permanentCards = new Map<string | undefined, string | undefined>();
  for (const player of window.observation.players) {
    const permanents = [...player.board, ...(player.breeding === undefined ? [] : [player.breeding])];
    for (const unit of permanents)
      if (!permanentCards.has(unit.permanentId)) permanentCards.set(unit.permanentId, unit.top.cardId);
    for (const card of [
      ...player.hand,
      ...player.trash,
      ...player.delay,
      ...player.faceUpSecurity,
      ...permanents.flatMap((unit) => [unit.top, ...unit.stack, ...unit.linked]),
    ])
      if (!cards.has(card.instanceId)) cards.set(card.instanceId, card);
  }
  for (const card of window.observation.revealed) if (!cards.has(card.instanceId)) cards.set(card.instanceId, card);
  return {
    own,
    enemy,
    sources,
    targets,
    cards,
    permanentCards,
    ownHand: new Set<string | undefined>(own.hand.map((card) => card.instanceId)),
    trash: new Set<string | undefined>(
      window.observation.players.flatMap((player) => player.trash.map((card) => card.instanceId)),
    ),
    enemySources: new Set<string | undefined>([
      ...enemy.board.flatMap((unit) => [unit.permanentId, unit.top.instanceId]),
      ...enemy.trash.map((card) => card.instanceId),
    ]),
    zeroFeatures,
  };
}
