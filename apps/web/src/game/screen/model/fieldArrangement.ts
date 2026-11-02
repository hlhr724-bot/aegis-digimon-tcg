/* How the organized field splits one battle area into two rows.

   The server keeps every permanent in one array in play order, and no rule reads that
   order back, so the client is free to present it differently. Digimon stay in the main
   row in play order, so digivolving a Digimon never moves it. Tamers and Options move
   to a smaller row, where copies that look and act the same collapse into one card
   with a count.

   Pure: the rows decide what "singled out" means from their own chrome. */

import { CardKind, getCardDefinition, type Permanent } from "@aegis/shared";
import { restrictionBadges } from "../../fieldBadges";
import { parseActivatable } from "../../boardModel";

/** Copies shown as one card. The first member is the one drawn and the one a tap acts on. */
export interface FieldGroup {
  key: string;
  members: readonly Permanent[];
}

export interface FieldArrangement {
  digimon: readonly Permanent[];
  support: readonly FieldGroup[];
}

export interface FieldArrangementOptions {
  groupIdenticalTamers?: boolean;
  /** Whether the card is drawn turned, including the hold before an unsuspend sweep. */
  isSuspended: (permanent: Permanent) => boolean;
  /**
   * A card a prompt, a cue or a pick is about right now. It leaves its group so it can
   * be seen and tapped on its own.
   */
  isSingledOut: (permanent: Permanent) => boolean;
}

const SUPPORT_KIND_ORDER = [CardKind.Tamer, CardKind.Option] as const;

function supportKindRank(permanent: Permanent): number | undefined {
  const kinds = getCardDefinition(permanent.topCard?.cardId ?? "")?.kinds ?? [];
  if (kinds.includes(CardKind.Digimon) || kinds.includes(CardKind.DigiEgg)) return undefined;
  const rank = SUPPORT_KIND_ORDER.findIndex((kind) => kinds.includes(kind));
  return rank < 0 ? undefined : rank;
}

/** Everything a copy wears on the board. Copies group only when all of it matches. */
function appearanceKey(permanent: Permanent, suspended: boolean): string | undefined {
  if (permanent.stack.length > 0 || permanent.linked.length > 0) return undefined;
  return JSON.stringify([
    permanent.topCard.cardId,
    permanent.topCard.artId,
    permanent.topCard.faceUp,
    permanent.manualMarker,
    [...(permanent.manualStatuses ?? [])].sort(),
    [...permanent.originalColorsOverride].sort(),
    permanent.securityAttackModifier,
    permanent.summoningSick,
    suspended,
    permanent.currentDP,
    permanent.originalNameOverride,
    [...permanent.keywords],
    [...permanent.grantedKeywords],
    parseActivatable(permanent.activatableEffectsJson)
      .map((effect) => effect.effectKey)
      .sort(),
    restrictionBadges(permanent).map((badge) => badge.kind),
  ]);
}

function compareBy<T>(...keys: ((item: T) => number | string)[]) {
  return (left: T, right: T) => {
    for (const key of keys) {
      const a = key(left);
      const b = key(right);
      if (a < b) return -1;
      if (a > b) return 1;
    }
    return 0;
  };
}

export function arrangeField(
  permanents: readonly Permanent[],
  { isSuspended, isSingledOut, groupIdenticalTamers = true }: FieldArrangementOptions,
): FieldArrangement {
  const playOrder = new Map(permanents.map((permanent, index) => [permanent.permanentId, index]));
  const indexOf = (permanent: Permanent) => playOrder.get(permanent.permanentId) ?? 0;
  const definitionOf = (permanent: Permanent) => getCardDefinition(permanent.topCard?.cardId ?? "");

  const digimon: Permanent[] = [];
  const support: Permanent[] = [];
  for (const permanent of permanents) {
    (supportKindRank(permanent) === undefined ? digimon : support).push(permanent);
  }

  support.sort(
    compareBy(
      (permanent) => supportKindRank(permanent) ?? 0,
      (permanent) => definitionOf(permanent)?.playCost ?? 0,
      (permanent) => permanent.topCard?.cardId ?? "",
      // Play order, not readiness: suspending a copy to use its effect must not move it.
      indexOf,
    ),
  );

  const groups: { key: string; members: Permanent[] }[] = [];
  const openGroups = new Map<string, { key: string; members: Permanent[] }>();
  for (const permanent of support) {
    const isUngroupedTamer = !groupIdenticalTamers && supportKindRank(permanent) === 0;
    const appearance =
      isSingledOut(permanent) || isUngroupedTamer ? undefined : appearanceKey(permanent, isSuspended(permanent));
    const open = appearance === undefined ? undefined : openGroups.get(appearance);
    if (open) {
      open.members.push(permanent);
      continue;
    }
    const group = { key: permanent.permanentId, members: [permanent] };
    groups.push(group);
    if (appearance !== undefined) openGroups.set(appearance, group);
  }

  return { digimon, support: groups };
}

/** Where each permanent was drawn last time: its card's key and whether it was turned. */
export type PreviousPlacement = ReadonlyMap<string, { key: string; suspended: boolean }>;

/**
 * Keys that follow the cards on screen. A group keeps its key while most of its copies
 * stay together, so it is not remounted when one copy leaves; the copy that left gets a
 * new key, which is what lets it be drawn as a card of its own sliding out of the group.
 */
export function carryGroupKeys(
  groups: readonly FieldGroup[],
  previous: PreviousPlacement,
  isSuspended: (permanent: Permanent) => boolean,
): FieldGroup[] {
  const claims = new Map<string, { group: number; overlap: number; sameState: boolean }>();
  groups.forEach((group, index) => {
    const overlaps = new Map<string, number>();
    for (const member of group.members) {
      const before = previous.get(member.permanentId);
      if (before) overlaps.set(before.key, (overlaps.get(before.key) ?? 0) + 1);
    }
    const suspended = isSuspended(group.members[0]!);
    for (const [key, overlap] of overlaps) {
      const sameState = group.members.some(
        (member) =>
          previous.get(member.permanentId)?.key === key && previous.get(member.permanentId)?.suspended === suspended,
      );
      const best = claims.get(key);
      if (!best || overlap > best.overlap || (overlap === best.overlap && sameState && !best.sameState)) {
        claims.set(key, { group: index, overlap, sameState });
      }
    }
  });

  const keys: (string | undefined)[] = groups.map(() => undefined);
  const strongestFirst = [...claims].sort(([, a], [, b]) => b.overlap - a.overlap);
  for (const [key, claim] of strongestFirst) {
    if (keys[claim.group] === undefined) keys[claim.group] = key;
  }
  const taken = new Set(keys.filter((key): key is string => key !== undefined));
  return groups.map((group, index) => {
    let key = keys[index];
    if (key === undefined) {
      const base = group.members[0]!.permanentId;
      key = base;
      for (let suffix = 1; taken.has(key); suffix++) key = `${base}~${suffix}`;
      taken.add(key);
    }
    return { key, members: group.members };
  });
}
