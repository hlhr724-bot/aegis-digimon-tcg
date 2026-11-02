import type { CardSource } from "#api/engine/effects/CardSource";
import type { GameAccess } from "#api/engine/effects/context/gameAccess";
import type { LenderCardSourcePayload } from "#api/engine/effects/interpreter/actions/LenderCardSourcePayload";
import { lenderCardSourcePayloads } from "#api/engine/effects/interpreter/actions/lenderCardSourcePayloads";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";

type Params = { game: GameAccess; payload: LenderCardSourcePayload };

export function createLenderCardSource({ game, payload }: Params): CardSource {
  const { instanceId, cardId, ownerSeat, permanentId } = payload;
  const definition = game.definitionOf({ cardId });
  const source: CardSource = {
    instanceId,
    cardId,
    ownerSeat,
    definition,
    permanent: () => game.permanentById(permanentId),
    isOnBattleArea: () => game.permanentById(permanentId) !== undefined,
    isOwnersTurn: () => game.state.turnSeat === ownerSeat,
    hasColor: (color) => definition.colors.includes(color),
  };
  lenderCardSourcePayloads.set(source, { ...payload });
  game.runtimeObjects?.track({ value: source, key: EngineRuntimeObjectKind.LENDER_CARD_SOURCE.value });
  return source;
}
