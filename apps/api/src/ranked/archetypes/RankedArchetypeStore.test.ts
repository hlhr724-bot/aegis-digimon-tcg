import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RankedArchetypeStore } from "#api/ranked/archetypes/RankedArchetypeStore";

type DeckParams = { prefix: string };
type MatchParams = { accounts: AccountStore; matchId: string; players: [string, string]; decks: [string[], string[]] };

const stores: AccountStore[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

function buildDeck({ prefix }: DeckParams): string[] {
  return Array.from({ length: 50 }, (_, index) => `${prefix}-${Math.floor(index / 4)}`);
}

async function prepare() {
  const accounts = new AccountStore(createMemoryPool());
  stores.push(accounts);
  const first = (await accounts.accountForIdentity("discord", "archetype-first", "First")).id;
  const second = (await accounts.accountForIdentity("discord", "archetype-second", "Second")).id;
  return { accounts, players: [first, second] as [string, string] };
}

async function addReference(accounts: AccountStore, archetype: string, prefix: string) {
  const cards = [...new Set(buildDeck({ prefix }))].map((card) => ({
    card_id: card,
    count: buildDeck({ prefix }).filter((entry) => entry === card).length,
  }));
  await accounts.pool.query(
    "INSERT INTO deck_provider_snapshots (provider,key,body,collected_at) VALUES ('digilab',$1,$2,1)",
    [
      `decklist/${archetype.length}`,
      JSON.stringify({
        result_id: archetype.length,
        archetype_name: archetype,
        display_card_id: `${prefix}-0`,
        primary_color: "Green",
        secondary_color: "Blue",
        decklist: { digimon: cards, tamers: [], options: [], eggs: [] },
      }),
    ],
  );
}

async function addRankedMatch({ accounts, matchId, players, decks }: MatchParams) {
  await accounts.pool.query(
    "INSERT INTO match_records (id,room_id,mode,player0_account_id,player1_account_id,winner_account_id,reason,finished_at) VALUES ($1,$1,'ranked',$2,$3,$2,'surrender',10)",
    [matchId, players[0], players[1]],
  );
  for (const [seat, accountId] of players.entries()) {
    const result = seat === 0 ? "win" : "loss";
    if (decks[seat]!.length > 0) {
      await accounts.pool.query(
        "INSERT INTO match_deck_snapshots (match_id,account_id,snapshot_id,deck_name,main_deck,egg_deck,result) VALUES ($1,$2,$3,'Deck',$4,'[]',$5)",
        [matchId, accountId, `snapshot-${seat}`, JSON.stringify(decks[seat]), result],
      );
    }
    await accounts.pool.query(
      "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,region,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,'ranked','standard',NULL,'unknown','unknown',0,$4,10)",
      [matchId, accountId, players[1 - seat], result],
    );
  }
}

async function getFacts(accounts: AccountStore) {
  const { rows } = await accounts.pool.query<{
    archetype: string;
    opponent_archetype: string;
    classifier_version: number;
  }>("SELECT archetype,opponent_archetype,classifier_version FROM competitive_match_facts ORDER BY result DESC");
  return rows;
}

const matchId = "00000000-0000-4000-8000-000000000001";

describe("ranked archetype classification", () => {
  it("names both decks of every pending match fact", async () => {
    const { accounts, players } = await prepare();
    await addReference(accounts, "Examon", "EXA");
    await addReference(accounts, "Jupitermon", "JUP");
    await addRankedMatch({
      accounts,
      matchId,
      players,
      decks: [buildDeck({ prefix: "EXA" }), buildDeck({ prefix: "JUP" })],
    });
    const store = new RankedArchetypeStore(accounts);
    expect(await store.classifyPendingFacts()).toBe(2);
    expect(await getFacts(accounts)).toEqual([
      { archetype: "Examon", opponent_archetype: "Jupitermon", classifier_version: 1 },
      { archetype: "Jupitermon", opponent_archetype: "Examon", classifier_version: 1 },
    ]);
    expect(await store.classifyPendingFacts()).toBe(0);
  });

  it("keeps facts pending until reference lists exist", async () => {
    const { accounts, players } = await prepare();
    await addRankedMatch({
      accounts,
      matchId,
      players,
      decks: [buildDeck({ prefix: "EXA" }), buildDeck({ prefix: "JUP" })],
    });
    expect(await new RankedArchetypeStore(accounts).classifyPendingFacts()).toBe(0);
    expect(await getFacts(accounts)).toEqual([
      { archetype: "unknown", opponent_archetype: "unknown", classifier_version: 0 },
      { archetype: "unknown", opponent_archetype: "unknown", classifier_version: 0 },
    ]);
  });

  it("settles a fact as unidentified when its deck was not kept or holds no known Digimon", async () => {
    const { accounts, players } = await prepare();
    await addReference(accounts, "Examon", "EXA");
    await addRankedMatch({ accounts, matchId, players, decks: [buildDeck({ prefix: "ROGUE" }), []] });
    expect(await new RankedArchetypeStore(accounts).classifyPendingFacts()).toBe(2);
    expect(await getFacts(accounts)).toEqual([
      { archetype: "unknown", opponent_archetype: "unknown", classifier_version: 1 },
      { archetype: "unknown", opponent_archetype: "unknown", classifier_version: 1 },
    ]);
  });

  it("names an off-list deck after its most played final form and keeps each archetype's cover", async () => {
    const { accounts, players } = await prepare();
    await addReference(accounts, "Examon", "EXA");
    const rogue = [...Array<string>(4).fill("AD1-014"), "BT1-084", ...Array<string>(4).fill("BT1-010")];
    await addRankedMatch({ accounts, matchId, players, decks: [rogue, buildDeck({ prefix: "EXA" })] });
    expect(await new RankedArchetypeStore(accounts).classifyPendingFacts()).toBe(2);
    expect(await getFacts(accounts)).toEqual([
      { archetype: "MetalGarurumon", opponent_archetype: "Examon", classifier_version: 1 },
      { archetype: "Examon", opponent_archetype: "MetalGarurumon", classifier_version: 1 },
    ]);
    const { rows } = await accounts.pool.query(
      "SELECT archetype,cover_card_id,primary_color,secondary_color FROM competitive_archetypes ORDER BY archetype",
    );
    expect(rows).toEqual([
      { archetype: "Examon", cover_card_id: "EXA-0", primary_color: "Green", secondary_color: "Blue" },
      { archetype: "MetalGarurumon", cover_card_id: "AD1-014", primary_color: "Blue", secondary_color: "Purple" },
    ]);
  });

  it("names tournament game decks from the snapshots frozen for each seat", async () => {
    const { accounts, players } = await prepare();
    await addReference(accounts, "Examon", "EXA");
    await addReference(accounts, "Jupitermon", "JUP");
    const tournamentId = "00000000-0000-4000-8000-000000000010";
    const tournamentMatchId = "00000000-0000-4000-8000-000000000011";
    const seriesId = "00000000-0000-4000-8000-000000000012";
    const gameId = "00000000-0000-4000-8000-000000000013";
    await accounts.pool.query(
      "INSERT INTO tournaments (id,name,block,status,starts_at,max_players,created_by,created_at) VALUES ($1,'Cup','BT10','in_progress',1,8,$2,1)",
      [tournamentId, players[0]],
    );
    await accounts.pool.query(
      "INSERT INTO tournament_matches (id,tournament_id,round,position,player0_account_id,player1_account_id,status) VALUES ($1,$2,1,0,$3,$4,'pending')",
      [tournamentMatchId, tournamentId, players[0], players[1]],
    );
    await accounts.pool.query(
      "INSERT INTO match_series (id,tournament_match_id,wins_required,status,started_at) VALUES ($1,$2,2,'playing',1)",
      [seriesId, tournamentMatchId],
    );
    await accounts.pool.query(
      "INSERT INTO tournament_games (id,series_id,game_index,status,allocated_at,player0_deck_snapshot,player1_deck_snapshot) VALUES ($1,$2,1,'finished',1,$3,$4)",
      [
        gameId,
        seriesId,
        JSON.stringify({
          deckId: null,
          name: "First",
          mainDeck: buildDeck({ prefix: "JUP" }),
          eggDeck: [],
          revision: 1,
        }),
        JSON.stringify({
          deckId: null,
          name: "Second",
          mainDeck: buildDeck({ prefix: "EXA" }),
          eggDeck: [],
          revision: 1,
        }),
      ],
    );
    for (const [seat, accountId] of players.entries()) {
      await accounts.pool.query(
        "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,region,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,'tournament','standard',NULL,'unknown','unknown',0,$4,10)",
        [`tournament-game:${gameId}`, accountId, players[1 - seat], seat === 0 ? "win" : "loss"],
      );
    }
    expect(await new RankedArchetypeStore(accounts).classifyPendingFacts()).toBe(2);
    expect(await getFacts(accounts)).toEqual([
      { archetype: "Jupitermon", opponent_archetype: "Examon", classifier_version: 1 },
      { archetype: "Examon", opponent_archetype: "Jupitermon", classifier_version: 1 },
    ]);
  });
});
