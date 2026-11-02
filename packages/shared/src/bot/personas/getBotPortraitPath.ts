import type { BotPersona } from "#shared/bot/personas/BotPersona";

type Params = { persona: BotPersona };

const digimonPrefix = "digimon:";

function getPortraitSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getBotPortraitPath({ persona }: Params): string {
  if (persona.id.startsWith(digimonPrefix)) {
    return `/assets/bot-portraits/digimon/${getPortraitSlug(persona.displayName)}.webp`;
  }
  return `/assets/bot-portraits/${persona.id}.webp`;
}
