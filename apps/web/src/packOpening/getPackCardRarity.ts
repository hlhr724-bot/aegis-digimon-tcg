import type { CardDefinition } from "@aegis/shared";
import { getPackPullRates } from "@/packOpening/getPackPullRates";
import { PackRarity } from "@/packOpening/PackRarity";

type Params = {
  card: CardDefinition;
  setId: string;
};

export function getPackCardRarity({ card, setId }: Params): string | undefined {
  if (card.rarity === PackRarity.ULTRA_RARE.value && getPackPullRates({ setId }).ultimateRare === 0) {
    return PackRarity.SECRET_RARE.value;
  }
  return card.rarity;
}
