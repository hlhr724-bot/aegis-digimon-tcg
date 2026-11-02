import { CardFinish, type CardFinishEntry } from "@/design/webglCard/CardFinish";

type Params = {
  rarity?: string;
  artId?: string;
};

export function getCardFinish(card: Params | undefined): CardFinishEntry {
  if (!card) {
    return CardFinish.NONE;
  }
  if (card.artId) {
    return CardFinish.PRISMATIC;
  }
  switch (card.rarity) {
    case "R":
      return CardFinish.HOLO;
    case "SR":
      return CardFinish.STARLIGHT;
    case "UR":
      return CardFinish.GOLD;
    case "SEC":
      return CardFinish.PRISMATIC;
    default:
      return CardFinish.NONE;
  }
}
