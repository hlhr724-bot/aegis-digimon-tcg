import { describe, expect, it, vi } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RankedMetaStore } from "#api/ranked/RankedMetaStore";

describe("ranked deck statistics", () => {
  it("keeps a game finishing after the season boundary in its assigned season", async () => {
    const accounts = new AccountStore(createMemoryPool());
    const first = (await accounts.accountForIdentity("discord", "meta-first", "First")).id;
    const second = (await accounts.accountForIdentity("discord", "meta-second", "Second")).id;
    const matchId = "00000000-0000-4000-8000-000000000001";
    await accounts.pool.query("INSERT INTO ranked_seasons (id,starts_at,ends_at) VALUES (1,100,200),(2,200,300)");
    await accounts.pool.query(
      "INSERT INTO match_records (id,room_id,mode,player0_account_id,player1_account_id,winner_account_id,reason,finished_at) VALUES ($1,'boundary','ranked',$2,$3,$2,'surrender',205)",
      [matchId, first, second],
    );
    await accounts.pool.query(
      "INSERT INTO ranked_pairs (id,format,slot,room_id,status,created_at,reservation_expires_at,heartbeat_at,season_id,result_id) VALUES ($1,'standard','legacy','boundary','finished',190,200,205,1,$1)",
      [matchId],
    );
    await accounts.pool.query(
      "INSERT INTO competitive_match_facts (match_id,account_id,opponent_account_id,origin,format,region,archetype,opponent_archetype,classifier_version,result,finished_at) VALUES ($1,$2,$3,'ranked','standard','europe','unknown','unknown',0,'win',205)",
      [matchId, first, second],
    );
    const store = new RankedMetaStore(accounts);
    expect(await store.getDeckStats({ format: "standard", seasonId: 1 })).toEqual([
      { archetype: "unknown", games: 1, wins: 1, players: 1, winrate: null },
    ]);
    expect(await store.getDeckStats({ format: "standard", seasonId: 2 })).toEqual([]);
    expect(await store.getDeckStats({ format: "standard", seasonId: 1, region: "asia" })).toEqual([]);
    await accounts.close();
  });

  it("keeps win rates private for unidentified decks and insufficient samples", async () => {
    const accounts = new AccountStore(createMemoryPool());
    await accounts.ensureReady();
    const query = vi.spyOn(accounts.pool, "query").mockResolvedValueOnce({
      rows: [
        { archetype: "Greymon", games: "40", wins: "24", players: "12" },
        { archetype: "Small", games: "20", wins: "15", players: "12" },
        { archetype: "Few players", games: "40", wins: "20", players: "9" },
        { archetype: "unknown", games: "100", wins: "50", players: "30" },
      ],
      rowCount: 4,
      command: "SELECT",
      oid: 0,
      fields: [],
    });
    const data = await new RankedMetaStore(accounts).getDeckStats({
      format: "standard",
      region: "europe",
      seasonId: 1,
    });
    expect(data).toEqual([
      { archetype: "Greymon", games: 40, wins: 24, players: 12, winrate: 0.6 },
      { archetype: "Small", games: 20, wins: 15, players: 12, winrate: null },
      { archetype: "Few players", games: 40, wins: 20, players: 9, winrate: null },
      { archetype: "unknown", games: 100, wins: 50, players: 30, winrate: null },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("f.origin='ranked'"), ["standard", "europe", 1]);
    query.mockRestore();
    await accounts.close();
  });
});
