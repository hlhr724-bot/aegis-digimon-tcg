import { Zone } from "@aegis/shared/schema/enums";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";

export type TriggerSource =
  | { zone: Zone.Hand; position: number }
  | { zone: Zone.BattleArea; hostCardId: string; inherited: boolean; copy: number; copies: number }
  | { zone: Zone.Breeding | Zone.Trash | Zone.Delay | Zone.Security };

type Params = {
  instanceId: string;
  players: readonly PlayerState[];
  handInstanceIds: readonly string[];
};

export function findTriggerSource({ instanceId, players, handInstanceIds }: Params): TriggerSource | undefined {
  const handIndex = handInstanceIds.indexOf(instanceId);
  if (handIndex !== -1) {
    return { zone: Zone.Hand, position: handIndex + 1 };
  }
  for (const player of players) {
    const source = findPlayerTriggerSource(instanceId, player);
    if (source) {
      return source;
    }
  }
  return undefined;
}

function findPlayerTriggerSource(instanceId: string, player: PlayerState): TriggerSource | undefined {
  const host = player.battleArea.find((permanent) => isInPermanent(instanceId, permanent));
  if (host?.topCard) {
    const hostCardId = host.topCard.cardId;
    const twins = player.battleArea.filter((permanent) => permanent?.topCard?.cardId === hostCardId);
    return {
      zone: Zone.BattleArea,
      hostCardId,
      inherited: host.topCard.instanceId !== instanceId,
      copy: twins.indexOf(host) + 1,
      copies: twins.length,
    };
  }
  if (isInPermanent(instanceId, player.breeding)) {
    return { zone: Zone.Breeding };
  }
  if (hasInstance(instanceId, player.trash)) {
    return { zone: Zone.Trash };
  }
  if (hasInstance(instanceId, player.delayZone)) {
    return { zone: Zone.Delay };
  }
  if (hasInstance(instanceId, player.security) || hasInstance(instanceId, player.securityView)) {
    return { zone: Zone.Security };
  }
  return undefined;
}

function isInPermanent(instanceId: string, permanent: Permanent | undefined): boolean {
  if (!permanent) {
    return false;
  }
  return permanent.topCard?.instanceId === instanceId || hasInstance(instanceId, permanent.stack);
}

function hasInstance(instanceId: string, cards: Iterable<{ instanceId: string }> | undefined): boolean {
  for (const card of cards ?? []) {
    if (card?.instanceId === instanceId) {
      return true;
    }
  }
  return false;
}
