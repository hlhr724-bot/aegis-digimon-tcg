import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardKind } from "@aegis/shared/schema/enums";

type Params = { mainDeck: readonly string[] };

export function getDeckFeaturedCardId({ mainDeck }: Params): string | undefined {
  const digimon = [...new Set(mainDeck)]
    .map(getCardDefinition)
    .filter((card) => card?.kinds.includes(CardKind.Digimon));
  digimon.sort(
    (a, b) =>
      (b?.level ?? 0) - (a?.level ?? 0) ||
      (b?.dp ?? 0) - (a?.dp ?? 0) ||
      (a?.cardId ?? "").localeCompare(b?.cardId ?? ""),
  );
  return digimon[0]?.cardId ?? mainDeck[0];
}
