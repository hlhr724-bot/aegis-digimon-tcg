import type { Migration, Queryable } from "#api/db/migrator";

export const slimDeckMatchLedger = {
  id: "049-slim-deck-match-ledger",
  up: async (db: Queryable) => {
    await db.query(
      "UPDATE account_deck_matches SET record = record - 'ownDeckKey' WHERE record->>'ownDeckKey' IS NOT NULL",
    );
  },
} satisfies Migration;
