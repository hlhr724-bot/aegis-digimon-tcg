import { getDeletedDecks } from "@/account/decks/getDeletedDecks";

type Params = { accountId: string; deckId: string; deleted: boolean; acknowledged?: boolean };

export function setDeckDeleted({ accountId, deckId, deleted, acknowledged = false }: Params): void {
  const ids = getDeletedDecks({ accountId });
  if (deleted) {
    if (acknowledged && !ids.has(deckId)) {
      return;
    }
    ids.set(deckId, { acknowledged });
  } else {
    ids.delete(deckId);
  }
  try {
    localStorage.setItem(`aegis:deleted-decks:${accountId}`, JSON.stringify([...ids]));
  } catch {
    return;
  }
}
