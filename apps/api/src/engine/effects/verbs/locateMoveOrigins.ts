import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import type { GameState } from "@aegis/shared/schema/GameState";
import { Zone } from "@aegis/shared/schema/enums";
import { locateLooseInstance } from "#api/engine/effects/verbs/looseInstances";
import type { MoveOrigin } from "#api/engine/effects/verbs/MoveOrigin";

type Params = { state: GameState; instanceIds: readonly string[] };

export function locateMoveOrigins({ state, instanceIds }: Params): Map<string, MoveOrigin> {
  const origins = new Map<string, MoveOrigin>();
  for (const instanceId of instanceIds) {
    const location = locateLooseInstance(state, instanceId);
    if (location && location.zone !== "stack" && location.zone !== "linked") {
      const fromSeat = location.ownerSeat;
      if (location.zone === "checked") {
        origins.set(instanceId, { from: Zone.Security, fromSeat, fromSecurityCheck: true });
      } else if (location.zone === "resolvingOption") {
        origins.set(instanceId, { from: CardMovePosition.RESOLVING_OPTION.value, fromSeat });
      } else {
        const zones = { hand: Zone.Hand, deck: Zone.Deck, trash: Zone.Trash, security: Zone.Security };
        origins.set(instanceId, { from: zones[location.zone], fromSeat });
      }
      continue;
    }
    for (const player of state.players) {
      const permanents = Array.from(player.battleArea);
      if (player.breeding) {
        permanents.push(player.breeding);
      }
      for (const permanent of permanents) {
        const fromSeat = permanent.controllerSeat;
        if (permanent.topCard?.instanceId === instanceId) {
          origins.set(instanceId, { from: permanent.inBreeding ? Zone.Breeding : Zone.BattleArea, fromSeat });
          break;
        }
        const inStack = permanent.stack.some((card) => card.instanceId === instanceId);
        const inLinked = permanent.linked.some((card) => card.instanceId === instanceId);
        if (inStack || inLinked) {
          origins.set(instanceId, {
            from: inStack ? CardMovePosition.DIGIVOLUTION_CARDS.value : CardMovePosition.LINKED_CARDS.value,
            fromSeat,
            fromHost: { permanentId: permanent.permanentId, hostCardId: permanent.topCard.cardId },
          });
          break;
        }
      }
      if (origins.has(instanceId)) {
        break;
      }
    }
  }
  return origins;
}
