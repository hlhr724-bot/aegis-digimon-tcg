import type { Migration } from "#api/db/migrator";

export const competitiveArchetypes: Migration = {
  id: "059-competitive-archetypes",
  up: async (db) => {
    await db.query(
      "CREATE INDEX IF NOT EXISTS competitive_match_facts_classifier ON competitive_match_facts(classifier_version)",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS competitive_archetypes (archetype text PRIMARY KEY, cover_card_id text, primary_color text, secondary_color text)",
    );
  },
};
