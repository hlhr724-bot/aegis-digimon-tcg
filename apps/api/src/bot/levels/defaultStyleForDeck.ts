import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { DefaultBotDeck } from "#api/bot/defaultBotProgram";

type Params = {
  deck: DefaultBotDeck;
  archetype?: string;
};

const ARCHETYPE_STYLES: Readonly<Record<string, BotStyle>> = {
  "security rush": BotStyle.AGGRESSIVE.value,
  "rookie rush": BotStyle.AGGRESSIVE.value,
  "red hybrid": BotStyle.AGGRESSIVE.value,
  ancientgreymon: BotStyle.AGGRESSIVE.value,
  imperialdramon: BotStyle.AGGRESSIVE.value,
  beelzemon: BotStyle.AGGRESSIVE.value,
  "security control": BotStyle.DEFENSIVE.value,
  "yellow hybrid": BotStyle.DEFENSIVE.value,
  mastemon: BotStyle.DEFENSIVE.value,
  machinedramon: BotStyle.DEFENSIVE.value,
  blackwargreymon: BotStyle.DEFENSIVE.value,
};

export function defaultStyleForDeck({ deck, archetype }: Params): BotStyle {
  if (archetype !== undefined) {
    const mapped = Object.entries(ARCHETYPE_STYLES).find(([name]) => name === archetype.trim().toLowerCase());
    if (mapped !== undefined) {
      return mapped[1];
    }
  }
  const counts = new Map<BotStyle, number>();
  for (const cardId of deck.mainDeck) {
    const name = getCardDefinition(cardId)?.nameEn.toLowerCase();
    if (name === undefined) {
      continue;
    }
    const mapped = Object.entries(ARCHETYPE_STYLES).find(([archetypeName]) => name === archetypeName);
    if (mapped !== undefined) {
      counts.set(mapped[1], (counts.get(mapped[1]) ?? 0) + 1);
    }
  }
  const ranked = [...counts].sort((left, right) => right[1] - left[1]);
  if (ranked[0] !== undefined && ranked[0][1] > (ranked[1]?.[1] ?? 0)) {
    return ranked[0][0];
  }
  return BotStyle.BALANCED.value;
}
