type Params = { accountId: string };

type Deletion = { acknowledged: boolean };

export function getDeletedDecks({ accountId }: Params): Map<string, Deletion> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`aegis:deleted-decks:${accountId}`) ?? "[]");
    const result = new Map<string, Deletion>();
    if (!Array.isArray(stored)) {
      return result;
    }
    for (const entry of stored) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1]?.acknowledged === "boolean") {
        result.set(entry[0], { acknowledged: entry[1].acknowledged });
      }
    }
    return result;
  } catch {
    return new Map();
  }
}
