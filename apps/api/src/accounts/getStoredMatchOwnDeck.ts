import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { isDeckFormat } from "@aegis/shared/deckFormat";
import type { StoredMatchRecord } from "#api/accounts/AccountStore";

type Params = { record: StoredMatchRecord };

export function getStoredMatchOwnDeck({ record }: Params): UsedDeck | undefined {
  if (record.ownDeck) {
    return structuredClone({ ...record.ownDeck, deckId: null });
  }
  if (!record.ownDeckKey) {
    return undefined;
  }
  let composition: unknown;
  try {
    composition = JSON.parse(record.ownDeckKey);
  } catch {
    return undefined;
  }
  if (!Array.isArray(composition) || composition.length !== 3) {
    return undefined;
  }
  const [mainDeck, eggDeck, format] = composition;
  if (
    !Array.isArray(mainDeck) ||
    !mainDeck.every((card) => typeof card === "string") ||
    !Array.isArray(eggDeck) ||
    !eggDeck.every((card) => typeof card === "string") ||
    !isDeckFormat(format)
  ) {
    return undefined;
  }
  return { deckId: null, deckName: record.ownDeckName ?? "Deck", mainDeck, eggDeck, format };
}
