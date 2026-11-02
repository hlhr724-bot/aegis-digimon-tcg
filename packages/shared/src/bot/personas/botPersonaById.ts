import { BOT_PERSONAS } from "#shared/bot/personas/BOT_PERSONAS";
import type { BotPersona } from "#shared/bot/personas/BotPersona";
import { getCardDefinition } from "#shared/cards/registry";
import { CardKind } from "#shared/schema/enums";

export function botPersonaById(id: unknown): BotPersona | undefined {
  if (typeof id !== "string") return undefined;
  const persona = BOT_PERSONAS.find((entry) => entry.id === id);
  if (persona) return persona;
  if (!id.startsWith("digimon:")) return undefined;
  const cardId = id.slice(8);
  if (!/^[A-Z]+\d*-\d{2,3}$/.test(cardId)) return undefined;
  const card = getCardDefinition(cardId);
  if (!card?.kinds.includes(CardKind.Digimon)) return undefined;
  return { id, displayName: card.nameEn.replaceAll("&amp;", "&"), portraitCardId: cardId };
}
