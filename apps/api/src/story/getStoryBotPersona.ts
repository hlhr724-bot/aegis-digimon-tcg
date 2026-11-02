import { BOT_PERSONAS } from "@aegis/shared/bot/personas/BOT_PERSONAS";
import type { BotPersona } from "@aegis/shared/bot/personas/BotPersona";
import { botPersonaById } from "@aegis/shared/bot/personas/botPersonaById";
import { allCards, getCardDefinition } from "@aegis/shared/cards/registry";
import type { CardDefinition } from "@aegis/shared/cards/types";
import { CardKind } from "@aegis/shared/schema/enums";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import type { ScenarioFixture } from "#api/engine/scenario/types";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";

type Params = { battleId: string; fixture: ScenarioFixture };

const opponentSeat = 1;

function getWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}.]+/u)
    .filter(Boolean);
}

function isCharacterNamed(persona: BotPersona, opponent: string): boolean {
  const words = new Set(getWords(opponent));
  return persona.displayName.split(/\s*&\s*/).every((part) => getWords(part).every((word) => words.has(word)));
}

function getFieldCardId(fixture: ScenarioFixture): string | undefined {
  const permanent = fixture.board[opponentSeat]?.battleArea?.[0];
  return typeof permanent === "string" ? permanent : permanent?.card;
}

const animeNameAliases: Readonly<Record<string, string>> = { yggdrasil: "king drasil" };

function getSpacedName(name: string): string {
  return ` ${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

const catalogDigimon = allCards().filter(
  (card) => card.kinds.includes(CardKind.Digimon) && !card.isToken && getSpacedName(card.nameEn).trim().length > 0,
);

function getComparableOpponent(opponent: string): string {
  return Object.entries(animeNameAliases).reduce(
    (text, [animeName, cardName]) => text.replaceAll(` ${animeName} `, ` ${cardName} `),
    getSpacedName(opponent),
  );
}

function getNamedDigimon(deck: readonly CardDefinition[], opponent: string): CardDefinition | undefined {
  const named = getComparableOpponent(opponent);
  const getNameLength = (card: CardDefinition) => {
    const name = getSpacedName(card.nameEn);
    return named.includes(name) ? name.length : 0;
  };
  const deckIds = new Set(deck.map((card) => card.cardId));
  return catalogDigimon
    .filter((card) => getNameLength(card) > 0)
    .sort(
      (left, right) =>
        getNameLength(right) - getNameLength(left) ||
        Number(deckIds.has(right.cardId)) - Number(deckIds.has(left.cardId)) ||
        left.cardId.localeCompare(right.cardId),
    )[0];
}

function getPortraitDigimon(fixture: ScenarioFixture, opponent: string): CardDefinition | undefined {
  const deck = [...new Set(getStorySeatDeck({ fixture, seat: opponentSeat }).mainDeck)]
    .map(getCardDefinition)
    .filter((card): card is CardDefinition => card?.kinds.includes(CardKind.Digimon) === true);
  const named = getNamedDigimon(deck, opponent);
  if (named) {
    return named;
  }
  const fieldCardId = getFieldCardId(fixture);
  return deck.sort(
    (left, right) =>
      Number(right.cardId === fieldCardId) - Number(left.cardId === fieldCardId) ||
      (right.level ?? 0) - (left.level ?? 0) ||
      left.cardId.localeCompare(right.cardId),
  )[0];
}

export function getStoryBotPersona({ battleId, fixture }: Params): BotPersona | undefined {
  const battle = storyBattles.find((entry) => entry.id === battleId);
  if (!battle) {
    return undefined;
  }
  const character = BOT_PERSONAS.find(
    (persona) => persona.id !== "aegis" && isCharacterNamed(persona, battle.opponent),
  );
  if (character) {
    return character;
  }
  const digimon = getPortraitDigimon(fixture, battle.opponent);
  return digimon ? botPersonaById(`digimon:${digimon.cardId}`) : undefined;
}
