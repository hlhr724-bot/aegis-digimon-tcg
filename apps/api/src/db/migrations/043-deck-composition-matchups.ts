import type { Migration } from "#api/db/migrator";

export const deckCompositionMatchups: Migration = {
  id: "043-deck-composition-matchups",
  up: async (db) => {
    await db.query(
      "CREATE INDEX account_deck_matches_composition ON account_deck_matches ((record->>'ownDeckSignature'))",
    );
  },
};
