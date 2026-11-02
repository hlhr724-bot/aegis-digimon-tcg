import { isDigimon, type CardDefinition } from "@aegis/shared";

export function deckSectionLevel(definition: CardDefinition): number | undefined {
  return isDigimon(definition) && definition.level != null ? definition.level : undefined;
}
