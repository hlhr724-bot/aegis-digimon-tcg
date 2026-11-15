import type { AccountStore } from "#api/accounts/AccountStore";
import { ARCHETYPE_CLASSIFIER_VERSION } from "#api/ranked/archetypes/ARCHETYPE_CLASSIFIER_VERSION";
import type { ArchetypePresentation } from "#api/ranked/archetypes/ArchetypePresentation";
import type { ArchetypeReference } from "#api/ranked/archetypes/ArchetypeReference";
import type { ArchetypeReferenceIndex } from "#api/ranked/archetypes/ArchetypeReferenceIndex";
import type { ResolvedArchetype } from "#api/ranked/archetypes/ResolvedArchetype";
import { TOURNAMENT_GAME_FACT_PREFIX } from "#api/ranked/archetypes/TOURNAMENT_GAME_FACT_PREFIX";
import { UNIDENTIFIED_ARCHETYPE } from "#api/ranked/archetypes/UNIDENTIFIED_ARCHETYPE";
import { resolveDeckArchetype } from "#api/ranked/archetypes/resolveDeckArchetype";
import { buildArchetypeReferenceIndex } from "#api/ranked/archetypes/buildArchetypeReferenceIndex";
import { DeckProvider } from "@aegis/shared/deckProviders/DeckProvider";

type PendingFact = { match_id: string; account_id: string; opponent_account_id: string; origin: string };
type RankedDeckRow = { match_id: string; account_id: string; main_deck: unknown };
type TournamentDeckRow = {
  id: string;
  player0_account_id: string | null;
  player1_account_id: string | null;
  player0_deck_snapshot: unknown;
  player1_deck_snapshot: unknown;
};
type DeckKeyParams = { matchId: string; accountId: string };

const BATCH_SIZE = 100;
const REFERENCE_LIFETIME_MS = 3_600_000;
const MINIMUM_REFERENCE_CARDS = 40;

function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function getCards(value: unknown): string[] {
  const cards = parseJson(value);
  return Array.isArray(cards) ? cards.filter((card): card is string => typeof card === "string") : [];
}

function getSnapshotCards(value: unknown): string[] {
  const snapshot = parseJson(value);
  if (!snapshot || typeof snapshot !== "object" || !("mainDeck" in snapshot)) {
    return [];
  }
  return getCards(snapshot.mainDeck);
}

function buildPlaceholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(",");
}

function getDeckKey({ matchId, accountId }: DeckKeyParams): string {
  return `${matchId}:${accountId}`;
}

function getListedCards(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("card_id" in entry) || !("count" in entry)) {
      return [];
    }
    const { card_id: card, count } = entry;
    if (typeof card !== "string" || !Number.isInteger(count) || Number(count) < 1 || Number(count) > 50) {
      return [];
    }
    return Array<string>(Number(count)).fill(card);
  });
}

function buildReference(value: unknown): ArchetypeReference | null {
  const body = parseJson(value);
  if (!body || typeof body !== "object" || !("archetype_name" in body) || !("decklist" in body)) {
    return null;
  }
  const { archetype_name: archetype, decklist } = body;
  const details = body as Record<string, unknown>;
  const colors = [details.primary_color, details.secondary_color].filter(
    (color): color is string => typeof color === "string",
  );
  const coverCardId = typeof details.display_card_id === "string" ? details.display_card_id : null;
  if (typeof archetype !== "string" || archetype === "" || !decklist || typeof decklist !== "object") {
    return null;
  }
  const mainDeck = ["digimon", "tamers", "options"].flatMap((group) =>
    getListedCards((decklist as Record<string, unknown>)[group]),
  );
  if (mainDeck.length < MINIMUM_REFERENCE_CARDS) {
    return null;
  }
  return { archetype, mainDeck, presentation: { coverCardId, colors } };
}

export class RankedArchetypeStore {
  private index: ArchetypeReferenceIndex = buildArchetypeReferenceIndex([]);
  private indexLoadedAt = 0;
  private readonly savedArchetypes = new Set<string>();

  constructor(private readonly accounts: AccountStore) {}

  async classifyPendingFacts(): Promise<number> {
    await this.accounts.ensureReady();
    const pending = (
      await this.accounts.pool.query<PendingFact>(
        "SELECT match_id,account_id,opponent_account_id,origin FROM competitive_match_facts WHERE classifier_version<$1 LIMIT $2",
        [ARCHETYPE_CLASSIFIER_VERSION, BATCH_SIZE],
      )
    ).rows;
    if (pending.length === 0) {
      return 0;
    }
    const index = await this.getReferenceIndex();
    if (index.archetypes.length === 0) {
      return 0;
    }
    const decks = await this.getDecks(pending);
    const resolved = new Map<string, ResolvedArchetype>();
    function getArchetype(key: string): string {
      let entry = resolved.get(key);
      if (entry === undefined) {
        const mainDeck = decks.get(key);
        entry = mainDeck
          ? resolveDeckArchetype({ mainDeck, providerIndex: index })
          : { archetype: UNIDENTIFIED_ARCHETYPE, presentation: null };
        resolved.set(key, entry);
      }
      return entry.archetype;
    }
    for (const fact of pending) {
      await this.accounts.pool.query(
        "UPDATE competitive_match_facts SET archetype=$1,opponent_archetype=$2,classifier_version=$3 WHERE match_id=$4 AND account_id=$5",
        [
          getArchetype(getDeckKey({ matchId: fact.match_id, accountId: fact.account_id })),
          getArchetype(getDeckKey({ matchId: fact.match_id, accountId: fact.opponent_account_id })),
          ARCHETYPE_CLASSIFIER_VERSION,
          fact.match_id,
          fact.account_id,
        ],
      );
    }
    for (const { archetype, presentation } of resolved.values()) {
      if (presentation) {
        await this.savePresentation(archetype, presentation);
      }
    }
    return pending.length;
  }

  private async savePresentation(archetype: string, { coverCardId, colors }: ArchetypePresentation): Promise<void> {
    if (this.savedArchetypes.has(archetype)) {
      return;
    }
    await this.accounts.pool.query(
      "INSERT INTO competitive_archetypes (archetype,cover_card_id,primary_color,secondary_color) VALUES ($1,$2,$3,$4) ON CONFLICT (archetype) DO NOTHING",
      [archetype, coverCardId, colors[0] ?? null, colors[1] ?? null],
    );
    this.savedArchetypes.add(archetype);
  }

  private async getReferenceIndex(): Promise<ArchetypeReferenceIndex> {
    if (Date.now() - this.indexLoadedAt < REFERENCE_LIFETIME_MS) {
      return this.index;
    }
    const { rows } = await this.accounts.pool.query<{ body: unknown }>(
      "SELECT body FROM deck_provider_snapshots WHERE provider=$1 AND key LIKE 'decklist/%'",
      [DeckProvider.DIGILAB.value],
    );
    this.index = buildArchetypeReferenceIndex(
      rows
        .map((row) => buildReference(row.body))
        .filter((reference): reference is ArchetypeReference => reference !== null),
    );
    this.indexLoadedAt = Date.now();
    return this.index;
  }

  private async getDecks(pending: readonly PendingFact[]): Promise<Map<string, string[]>> {
    const decks = new Map<string, string[]>();
    const rankedIds = new Set<string>();
    const gameIds = new Set<string>();
    for (const fact of pending) {
      if (fact.match_id.startsWith(TOURNAMENT_GAME_FACT_PREFIX)) {
        gameIds.add(fact.match_id.slice(TOURNAMENT_GAME_FACT_PREFIX.length));
      } else {
        rankedIds.add(fact.match_id);
      }
    }
    if (rankedIds.size > 0) {
      const { rows } = await this.accounts.pool.query<RankedDeckRow>(
        `SELECT match_id,account_id,main_deck FROM match_deck_snapshots WHERE match_id IN (${buildPlaceholders(rankedIds.size)})`,
        [...rankedIds],
      );
      for (const row of rows) {
        decks.set(getDeckKey({ matchId: row.match_id, accountId: row.account_id }), getCards(row.main_deck));
      }
    }
    if (gameIds.size > 0) {
      const { rows } = await this.accounts.pool.query<TournamentDeckRow>(
        `SELECT g.id,m.player0_account_id,m.player1_account_id,g.player0_deck_snapshot,g.player1_deck_snapshot
         FROM tournament_games g JOIN match_series s ON s.id=g.series_id
         JOIN tournament_matches m ON m.id=s.tournament_match_id WHERE g.id IN (${buildPlaceholders(gameIds.size)})`,
        [...gameIds],
      );
      for (const row of rows) {
        const matchId = `${TOURNAMENT_GAME_FACT_PREFIX}${row.id}`;
        const seats: [string | null, unknown][] = [
          [row.player0_account_id, row.player0_deck_snapshot],
          [row.player1_account_id, row.player1_deck_snapshot],
        ];
        for (const [accountId, snapshot] of seats) {
          const mainDeck = getSnapshotCards(snapshot);
          if (accountId && mainDeck.length > 0) {
            decks.set(getDeckKey({ matchId, accountId }), mainDeck);
          }
        }
      }
    }
    return decks;
  }
}
