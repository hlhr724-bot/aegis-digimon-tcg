import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { RankedPlayerDeckStore } from "#api/ranked/RankedPlayerDeckStore";
import { RankedDeckResult } from "@aegis/shared/ranked/RankedDeckResult";

type GameParams = {
  main?: string[];
  eggs?: string[];
  result?: RankedDeckResult;
  season?: number;
  format?: string;
  voided?: boolean;
  bot?: boolean;
  finishedAt?: number;
};
let accounts: AccountStore;
let playerId: string;
let opponentId: string;

beforeEach(async () => {
  accounts = new AccountStore(createMemoryPool());
  playerId = (await accounts.accountForIdentity("email", "player@example.test", "Player")).id;
  opponentId = (await accounts.accountForIdentity("email", "opponent@example.test", "Opponent")).id;
  await accounts.pool.query(
    "INSERT INTO ranked_seasons(id,starts_at,ends_at) VALUES(1,0,9999999999999),(2,0,9999999999999)",
  );
});
afterEach(async () => {
  await accounts.close();
});

async function insertGame({
  main = ["BT1-010", "BT1-011"],
  eggs = ["BT1-001"],
  result = RankedDeckResult.WIN.value,
  season = 1,
  format = "standard",
  voided = false,
  bot = false,
  finishedAt = 1000,
}: GameParams = {}) {
  const matchId = randomUUID();
  const pairId = randomUUID();
  await accounts.pool.query(
    "INSERT INTO match_records(id,room_id,mode,player0_account_id,player1_account_id,winner_account_id,reason,finished_at,opponent_kind) VALUES($1,$2,'ranked',$3,$4,$3,'security',$5,$6)",
    [matchId, pairId, playerId, opponentId, finishedAt, bot ? "bot" : "human"],
  );
  await accounts.pool.query(
    "INSERT INTO ranked_pairs(id,format,slot,status,created_at,reservation_expires_at,heartbeat_at,season_id,result_id,voided_at) VALUES($1,$2,'test','finished',0,0,0,$3,$4,$5)",
    [pairId, format, season, matchId, voided ? 999 : null],
  );
  await accounts.pool.query(
    "INSERT INTO ranked_pair_players(pair_id,account_id,seat,region,rating_before,rating_after) VALUES($1,$2,0,'south_america',1000,1016),($1,$3,1,'south_america',1000,984)",
    [pairId, playerId, opponentId],
  );
  await accounts.pool.query(
    "INSERT INTO match_deck_snapshots(match_id,account_id,snapshot_id,deck_id,deck_name,main_deck,egg_deck,result) VALUES($1,$2,$3,'saved','Player deck',$4,$5,$6)",
    [matchId, playerId, matchId, JSON.stringify(main), JSON.stringify(eggs), result],
  );
}

async function publishDeck(main: string[]) {
  const id = randomUUID();
  await accounts.pool.query(
    "INSERT INTO public_decks(id,account_id,source_deck_id,name,colors,main_deck,egg_deck,main_deck_arts,egg_deck_arts,published_at,updated_at,status) VALUES($1,$2,'saved','Published deck','[]',$3,$4,'[]','[]',1,1,'public')",
    [id, playerId, JSON.stringify(main), JSON.stringify(["BT1-001"])],
  );
  return id;
}

it("groups reordered copies and preserves distinct historical compositions", async () => {
  await insertGame({ main: ["BT1-010", "BT1-011", "BT1-010"], finishedAt: 1000 });
  await insertGame({ main: ["BT1-010", "BT1-010", "BT1-011"], result: RankedDeckResult.LOSS.value, finishedAt: 2000 });
  await insertGame({ main: ["BT1-010", "BT1-011"], result: RankedDeckResult.DRAW.value, finishedAt: 3000 });
  const decks = await new RankedPlayerDeckStore(accounts).getDecks({
    accountId: playerId,
    seasonId: 1,
    format: "standard",
  });
  expect(decks).toHaveLength(2);
  expect(decks[0]).toMatchObject({
    matches: 2,
    wins: 1,
    losses: 1,
    draws: 0,
    winrate: 0.5,
    lastPlayedAt: 2000,
    list: null,
  });
  expect(decks[0]?.history.map((game) => game.finishedAt)).toEqual([2000, 1000]);
  expect(decks[0]?.history[0]).toMatchObject({ opponentName: "Opponent", ratingChange: 16 });
  expect(decks[1]).toMatchObject({ matches: 1, draws: 1, winrate: 0 });
});

it("filters season, format, bot games and voided results", async () => {
  await insertGame();
  await insertGame({ season: 2 });
  await insertGame({ format: "BT10" });
  await insertGame({ voided: true });
  await insertGame({ bot: true });
  const decks = await new RankedPlayerDeckStore(accounts).getDecks({
    accountId: playerId,
    seasonId: 1,
    format: "standard",
  });
  expect(decks).toHaveLength(1);
  expect(decks[0]?.matches).toBe(1);
});

it("reveals only an exact public composition to other players", async () => {
  await insertGame();
  const publication = await publishDeck(["BT1-011", "BT1-010"]);
  const decks = await new RankedPlayerDeckStore(accounts).getDecks({
    accountId: playerId,
    seasonId: 1,
    format: "standard",
    viewerId: opponentId,
  });
  expect(decks[0]).toMatchObject({
    publicDeckId: publication,
    list: { mainDeck: ["BT1-010", "BT1-011"], eggDeck: ["BT1-001"] },
  });
});

it("does not reveal an older list just because the saved deck ID is public", async () => {
  await insertGame();
  await publishDeck(["BT1-010", "BT1-012"]);
  const store = new RankedPlayerDeckStore(accounts);
  const other = await store.getDecks({ accountId: playerId, seasonId: 1, format: "standard", viewerId: opponentId });
  expect(other[0]).toMatchObject({ list: null, publicDeckId: null, matches: 1 });
  const owner = await store.getDecks({ accountId: playerId, seasonId: 1, format: "standard", viewerId: playerId });
  expect(owner[0]?.list?.mainDeck).toEqual(["BT1-010", "BT1-011"]);
  await accounts.pool.query("UPDATE public_decks SET main_deck=$1,status='hidden'", [
    JSON.stringify(["BT1-010", "BT1-011"]),
  ]);
  const hidden = await store.getDecks({ accountId: playerId, seasonId: 1, format: "standard" });
  expect(hidden[0]?.list).toBeNull();
});
