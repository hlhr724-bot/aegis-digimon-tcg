import { CardKind, EffectTiming } from "@aegis/shared";
import type { GameEngine } from "#api/engine/GameEngine";
import { lookupDefinition } from "#api/engine/cards/cardData";
import type { CollectedEffect } from "#api/engine/effects/collect";
import { cardSourceOf } from "#api/engine/gameEngine/effectContext";

export function collectPendingBurstDigivolveTrash(engine: GameEngine): CollectedEffect[] {
  const pending: CollectedEffect[] = [];
  for (const player of engine.state.players) {
    if (player === undefined) {
      continue;
    }
    for (const permanent of player.battleArea) {
      if (!permanent.burstDigivolvePendingTrash) {
        continue;
      }
      permanent.burstDigivolvePendingTrash = false;
      const permanentId = permanent.permanentId;
      pending.push({
        source: cardSourceOf(engine, permanent.topCard),
        orderingSeat: engine.state.turnSeat,
        timing: EffectTiming.OnEndTurn,
        effect: {
          effectKey: `burst-digivolve-trash/${permanentId}`,
          description: "At the end of the turn, trash the top card of this Burst Digivolved Digimon.",
          isActivatedConsequence: true,
          optional: false,
          isInherited: false,
          isSecurity: false,
          isLinked: false,
          maxPerTurn: -1,
          canTrigger: () => true,
          canActivate: () => true,
          resolve: async () => {
            const current = engine.access.permanentById(permanentId);
            if (current === undefined || current.inBreeding || current.stack.length === 0) {
              return;
            }
            const definition = lookupDefinition(current.topCard.cardId);
            if (definition?.kinds.includes(CardKind.Digimon) !== true) {
              return;
            }
            await engine.primitives.trashStackTops(permanentId, 1);
          },
        },
      });
    }
  }
  return pending;
}
