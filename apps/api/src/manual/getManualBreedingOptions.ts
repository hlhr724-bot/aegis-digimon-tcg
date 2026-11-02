import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardKind } from "@aegis/shared/schema/enums";
import type { PlayerState } from "@aegis/shared/schema/PlayerState";

type Params = { player: PlayerState };

export function getManualBreedingOptions({ player }: Params): { canHatch: boolean; canMoveFromBreeding: boolean } {
  const egg = player.eggDeck[0];
  const breeding = player.breeding;
  const definition = breeding ? getCardDefinition(breeding.topCard.cardId) : undefined;
  return {
    canHatch: !breeding && Boolean(egg && getCardDefinition(egg.cardId)?.kinds.includes(CardKind.DigiEgg)),
    canMoveFromBreeding: Boolean(
      breeding?.topCard.faceUp &&
      definition &&
      (definition.kinds.includes(CardKind.Digimon) || (definition.dp ?? 0) > 0),
    ),
  };
}
