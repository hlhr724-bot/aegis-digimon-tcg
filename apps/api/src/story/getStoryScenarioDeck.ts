import { storyCatalogDecks } from "@aegis/shared/story/storyCatalogDecks";
import type { StoryCatalogDeck } from "@aegis/shared/story/StoryCatalogDeck";

type Params = { ref: keyof typeof storyCatalogDecks };

const scenarioCounts: Partial<Record<keyof typeof storyCatalogDecks, Readonly<Record<string, number>>>> = {
  WMD81: { "EX1-066": 1, "BT17-091": 4, "BT14-087": 2 },
  WMD82: { "EX1-066": 1, "BT14-087": 3 },
  WMD55: { "EX1-066": 1, "BT18-088": 2, "AD1-020": 4 },
  WMD71: { "EX8-012": 1, "BT21-068": 4 },
};

export function getStoryScenarioDeck({ ref }: Params): Pick<StoryCatalogDeck, "main" | "eggs"> {
  const source = storyCatalogDecks[ref];
  const counts = scenarioCounts[ref];
  return {
    main: source.main.map(([card, count]) => [card, counts?.[card] ?? count] as const),
    eggs: source.eggs,
  };
}
