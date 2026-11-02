/* The viewer's hand, twice.

   `handEntries` is the live hand, which is what every legality answer is read off — the
   server's own projections travel on each card. `shownHandEntries` is the hand on screen,
   which a paced snapshot or turn-start draw hold can keep behind the live one. A card the hold still
   shows but the server has already taken has no projections left, so it is filled in as
   unplayable rather than dropped: the viewer sees the card leave when the ribbon says it
   does, and cannot act on it meanwhile. A card an optimistic play has taken out of the
   hand is left out of both. */

import {
  CardColor,
  CardKind,
  getCardDefinition,
  type CardDefinition,
  type CardInstance,
  type PlayerState,
} from "@aegis/shared";
import { HAND_SORT_DIRECTION_ENTRIES, HandSortDirection } from "@/game/HandSortDirection";
import { HandSortMode } from "../../handSortMode";
import type { HandEntry } from "../../piece";

export function handEntriesOf({
  viewer,
  shownHand,
  handHeld,
  optimisticPlayedInstanceId,
  handOrder = [],
}: {
  viewer: PlayerState;
  handOrder?: readonly string[];
  /** The hand on screen, held by a draw ribbon or the paced presentation revision. */
  shownHand: readonly CardInstance[] | undefined;
  handHeld: boolean;
  optimisticPlayedInstanceId: string | undefined;
}): { handEntries: HandEntry[]; shownHandEntries: HandEntry[] } {
  const handEntries: HandEntry[] = (viewer.hand ?? []).map((ci) => ({
    instanceId: ci.instanceId,
    cardId: ci.cardId,
    artId: ci.artId,
    activatableEffectsJson: ci.activatableEffectsJson,
    negamonPlayEffectKey: ci.negamonPlayEffectKey,
    playableFromHand: ci.playableFromHand,
    projectedPlayCost: ci.projectedPlayCost,
    playCostReductionBlocked: ci.playCostReductionBlocked,
    digivolveTargetPermanentIds: [...ci.digivolveTargetPermanentIds],
    linkTargetPermanentIds: [...ci.linkTargetPermanentIds],
    digivolveRoutes: [...(ci.digivolveRoutes ?? [])].map((route) => ({
      permanentId: route.permanentId,
      alternateRequirementIndex: route.alternateRequirementIndex,
      projectedCost: route.projectedCost,
    })),
    dnaDigivolveRoutes: [...(ci.dnaDigivolveRoutes ?? [])].map((route) => ({
      materialPermanentIds: JSON.parse(route.materialPermanentIdsJson) as string[],
      projectedCost: route.projectedCost,
    })),
    appFusionRoutes: [...(ci.appFusionRoutes ?? [])].map((route) => ({
      hostPermanentId: route.hostPermanentId,
      linkedInstanceId: route.linkedInstanceId,
      projectedCost: route.projectedCost,
    })),
  }));
  const shownHandEntries: HandEntry[] = (
    !handHeld
      ? [...handEntries]
      : [...(shownHand ?? [])].map(
          (ci) =>
            handEntries.find((entry) => entry.instanceId === ci.instanceId) ?? {
              instanceId: ci.instanceId,
              cardId: ci.cardId,
              artId: ci.artId,
              activatableEffectsJson: "",
              playableFromHand: false,
              projectedPlayCost: -1,
              digivolveTargetPermanentIds: [],
              linkTargetPermanentIds: [],
              dnaDigivolveRoutes: [],
              appFusionRoutes: [],
            },
        )
  ).filter((entry) => entry.instanceId !== optimisticPlayedInstanceId);
  // A button click captures only the cards visible at that moment. Later draws
  // retain their arrival order at the end until the player sorts again.
  const positions = new Map(handOrder.map((id, index) => [id, index]));
  shownHandEntries.sort(
    (a, b) => (positions.get(a.instanceId) ?? Infinity) - (positions.get(b.instanceId) ?? Infinity),
  );
  return { handEntries, shownHandEntries };
}

type SortKey = readonly number[];

const COLOR_ORDER = Object.values(CardColor);

function typeGroupOf(definition: CardDefinition | undefined): number {
  if (definition?.kinds.includes(CardKind.Digimon) || definition?.kinds.includes(CardKind.DigiEgg)) return 0;
  return definition?.kinds.includes(CardKind.Tamer) ? 1 : 2;
}

function levelOf(definition: CardDefinition | undefined): number {
  return typeGroupOf(definition) === 0 ? (definition?.level ?? 0) : 0;
}

function colorRankOf(definition: CardDefinition | undefined): number {
  const color = definition?.colors[0];
  return color === undefined ? COLOR_ORDER.length : COLOR_ORDER.indexOf(color);
}

const SORT_KEYS: Record<HandSortMode, (definition: CardDefinition | undefined, sign: number) => SortKey> = {
  [HandSortMode.Type]: (definition, sign) => [
    typeGroupOf(definition),
    sign * levelOf(definition),
    sign * (definition?.playCost ?? -1),
  ],
  [HandSortMode.Cost]: (definition, sign) => [
    sign * (definition?.playCost ?? -1),
    typeGroupOf(definition),
    sign * levelOf(definition),
  ],
  [HandSortMode.Color]: (definition, sign) => [
    colorRankOf(definition),
    definition?.colors.length ?? 0,
    typeGroupOf(definition),
    sign * levelOf(definition),
    sign * (definition?.playCost ?? -1),
  ],
};

/**
 * Type: Digimon and Digi-Eggs by level, then Tamers, then Options; cost inside each.
 * Cost: play cost first, then the type order. Color: first printed color, single-color
 * cards before multicolor ones, then the type order. Card number breaks every tie.
 */
export function sortedHandInstanceIds(
  entries: readonly Pick<HandEntry, "instanceId" | "cardId">[],
  mode: HandSortMode = HandSortMode.Type,
  direction: HandSortDirection = HandSortDirection.ASCENDING.value,
): string[] {
  const keyOf = SORT_KEYS[mode];
  const sign = HAND_SORT_DIRECTION_ENTRIES.find((entry) => entry.value === direction)?.sign ?? 1;
  const keys = new Map(entries.map((entry) => [entry.instanceId, keyOf(getCardDefinition(entry.cardId), sign)]));
  const compareKeys = (a: SortKey, b: SortKey) => {
    for (let index = 0; index < a.length; index++) {
      const difference = a[index]! - b[index]!;
      if (difference !== 0) return difference;
    }
    return 0;
  };
  return [...entries]
    .sort((a, b) => compareKeys(keys.get(a.instanceId)!, keys.get(b.instanceId)!) || a.cardId.localeCompare(b.cardId))
    .map((entry) => entry.instanceId);
}

export function retainHandOrder(
  order: readonly string[],
  hand: readonly Pick<CardInstance, "instanceId">[],
): readonly string[] {
  const present = new Set(hand.map((card) => card.instanceId));
  const retained = order.filter((id) => present.has(id));
  return retained.length === order.length ? order : retained;
}

/** Local presentation order; no card or legality projection is changed. */
export function reorderedHandInstanceIds(
  entries: readonly Pick<HandEntry, "instanceId">[],
  instanceId: string,
  beforeInstanceId?: string,
): string[] {
  const ids = entries.map((entry) => entry.instanceId);
  if (
    !ids.includes(instanceId) ||
    beforeInstanceId === instanceId ||
    (beforeInstanceId !== undefined && !ids.includes(beforeInstanceId))
  )
    return ids;
  const remaining = ids.filter((id) => id !== instanceId);
  remaining.splice(
    beforeInstanceId === undefined ? remaining.length : remaining.indexOf(beforeInstanceId),
    0,
    instanceId,
  );
  return remaining;
}
