import { randomUUID } from "node:crypto";
import { getStoryGuestHash } from "#api/story/getStoryGuestHash";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { StoryProgressStore } from "#api/story/StoryProgressStore";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { RED_DECK } from "#api/engine/testDecks";
import { getStoryScenario } from "#api/story/getStoryScenario";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { validateScenarioFixture } from "#api/engine/scenario/fixture";
import { validateDecklist } from "#api/engine/deckValidation";
import type { GameEngine } from "#api/engine/GameEngine";
import { storyBattles } from "@aegis/shared/story/storyBattles";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import { BotStyle } from "@aegis/shared/bot/BotStyle";
import { BotLine } from "@aegis/shared/bot/BotLine";
import { CHAT_CHANNEL, type ChatBroadcast } from "@aegis/shared/protocol/chat";

let accounts: AccountStore;
const rooms: AegisRoom[] = [];
class StoryTestRoom extends AegisRoom {
  protected override replays() {
    return { record: async () => "local-replay" };
  }
  protected override accounts(): AccountStore {
    return accounts;
  }
}

function createRoom(battleId: string): AegisRoom {
  const room = new StoryTestRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  room.onCreate({ seed: 1, botRoom: true, betaBattleRoom: true, storyBattleId: battleId });
  rooms.push(room);
  return room;
}

beforeEach(() => {
  accounts = new AccountStore(createMemoryPool());
});
afterEach(async () => {
  for (const room of rooms.splice(0)) {
    room.onDispose();
  }
  await accounts.close();
});

describe("story progression", () => {
  it("reads historic manifestation victories as one battle and writes canonical victories", async () => {
    const account = await accounts.accountForIdentity("discord", "historic-world-player", "Player");
    await accounts.ensureReady();
    await accounts.pool.query(
      "INSERT INTO story_battle_completions (account_id, battle_id, match_id, completed_at) VALUES ($1, $2, $3, $4)",
      [account.id, "dw1-039", "historic-encounter", Date.now()],
    );
    const store = new StoryProgressStore(accounts);
    expect(await store.getProgress(account.id)).toEqual({ completed: ["dw1-038"] });
    await store.recordVictory({ accountId: account.id, battleId: "dw1-040", matchId: "replay-encounter" });
    expect(await store.getProgress(account.id)).toEqual({ completed: ["dw1-038"] });
  });

  it("persists victories per account without duplicating retries", async () => {
    const a = await accounts.accountForIdentity("discord", "a", "Alice");
    const b = await accounts.accountForIdentity("discord", "b", "Bob");
    const store = new StoryProgressStore(accounts);
    await store.recordVictory({ accountId: a.id, battleId: "ice-knight", matchId: "first" });
    await store.recordVictory({ accountId: a.id, battleId: "ice-knight", matchId: "retry" });
    expect(await new StoryProgressStore(accounts).getProgress(a.id)).toEqual({ completed: ["ice-knight"] });
    expect(await store.getProgress(b.id)).toEqual({ completed: [] });
  });

  it("rejects missing identity and locked chapters even with crafted join options", async () => {
    const room = createRoom("crystal-sea-palace");
    const client = { sessionId: "player", send: vi.fn<() => void>() } as unknown as Client;
    const options = { displayName: "Player", deck: RED_DECK, storyBattleId: "crystal-sea-palace" };
    expect(await room.onAuth(client, options)).toBe(false);
    const account = await accounts.accountForIdentity("discord", "a", "Alice");
    const ticket = await accounts.createRoomTicket(account.id);
    expect(await room.onAuth(client, { ...options, authTicket: ticket })).toBe(false);
    await new StoryProgressStore(accounts).recordVictory({
      accountId: account.id,
      battleId: "ice-knight",
      matchId: "first",
    });
    const unlockedTicket = await accounts.createRoomTicket(account.id);
    expect(await room.onAuth(client, { ...options, authTicket: unlockedTicket })).toBe(true);
  });

  it("authorizes Ogremon only after every recruit victory is persisted", async () => {
    const room = createRoom("dw1-009");
    const account = await accounts.accountForIdentity("discord", "world-player", "Player");
    const store = new StoryProgressStore(accounts);
    const client = { sessionId: "world-player", send: vi.fn<() => void>() } as unknown as Client;
    const options = { displayName: "Player", deck: RED_DECK, storyBattleId: "dw1-009" };
    for (const battleId of ["dw1-001", "dw1-002"]) {
      await store.recordVictory({ accountId: account.id, battleId, matchId: battleId });
    }
    expect(await room.onAuth(client, { ...options, authTicket: await accounts.createRoomTicket(account.id) })).toBe(
      false,
    );
    await store.recordVictory({ accountId: account.id, battleId: "dw1-003", matchId: "third-recruit" });
    expect(await room.onAuth(client, { ...options, authTicket: await accounts.createRoomTicket(account.id) })).toBe(
      true,
    );
  });

  it("uses the server scenario instead of a supplied deck and does not unlock on defeat", async () => {
    const room = createRoom("ice-knight");
    const account = await accounts.accountForIdentity("discord", "a", "Alice");
    const client = { sessionId: "player", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
    const options = {
      displayName: "Player",
      deck: RED_DECK,
      storyBattleId: "ice-knight",
      authTicket: await accounts.createRoomTicket(account.id),
    };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    expect(room.addBot()).toBe(true);
    expect(room.state.players[0]!.displayName).toBe("Shoto Kazama");
    expect(room.state.players[0]!.hand.map((card) => card.cardId)).toEqual([
      "ST18-05",
      "ST18-05",
      "ST18-04",
      "ST18-10",
      "ST18-06",
    ]);
    expect(room.state.players[0]!.security).toHaveLength(4);
    expect(room.state.players[1]!.security).toHaveLength(3);
    for (const seat of [0, 1] as const) {
      expect(room.state.players[seat]!.deck.map((card) => card.cardId)).not.toEqual(
        getStoryScenario("ice-knight")!.board[seat]!.deck,
      );
    }
    expect(room.state.memory).toBe(3);
    const engine = (room as unknown as { engine: GameEngine }).engine;
    engine.applyIntent(0, { type: "surrender" });
    expect(room.state.gameOver).toBe(true);
    expect(await new StoryProgressStore(accounts).getProgress(account.id)).toEqual({ completed: [] });
  });

  it("only records completion from the authoritative winning seat", async () => {
    const room = createRoom("ice-knight");
    const account = await accounts.accountForIdentity("discord", "a", "Alice");
    const client = { sessionId: "player", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
    const options = {
      displayName: "Player",
      deck: RED_DECK,
      storyBattleId: "ice-knight",
      authTicket: await accounts.createRoomTicket(account.id),
    };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    room.addBot();
    const engine = (room as unknown as { engine: GameEngine }).engine;
    engine.applyIntent(1, { type: "surrender" });
    await vi.waitFor(async () => {
      expect(await new StoryProgressStore(accounts).getProgress(account.id)).toEqual({ completed: ["ice-knight"] });
    });
  });

  it("starts the World scenario with dealt hands and persists only an authoritative victory", async () => {
    const room = createRoom("dw1-001");
    const account = await accounts.accountForIdentity("discord", "world-winner", "Player");
    const client = { sessionId: "world-winner", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
    const options = {
      displayName: "Player",
      deck: RED_DECK,
      storyBattleId: "dw1-001",
      authTicket: await accounts.createRoomTicket(account.id),
    };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    expect(room.addBot()).toBe(true);
    for (const seat of [0, 1] as const) {
      expect(room.state.players[seat]!.hand).toHaveLength(5);
      expect(room.state.players[seat]!.security).toHaveLength(5);
      expect(room.state.players[seat]!.battleArea).toHaveLength(0);
    }
    expect(await new StoryProgressStore(accounts).getProgress(account.id)).toEqual({ completed: [] });
    const engine = (room as unknown as { engine: GameEngine }).engine;
    engine.applyIntent(1, { type: "surrender" });
    await vi.waitFor(async () => {
      expect(await new StoryProgressStore(accounts).getProgress(account.id)).toEqual({ completed: ["dw1-001"] });
    });
  });

  it.each(storyBattles.filter((battle) => battle.playable).map((battle) => battle.id))(
    "starts %s in the real simulator",
    (battleId) => {
      const room = createRoom(battleId);
      const client = { sessionId: "player", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
      room.clients.push(client);
      room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: battleId });
      expect(room.addBot()).toBe(true);
      expect(room.state.players).toHaveLength(2);
      expect(room.state.gameOver).toBe(false);
      expect(room.state.players[0]!.deck.length).toBeGreaterThan(0);
      expect(room.state.players[1]!.deck.length).toBeGreaterThan(0);
    },
  );

  it("seats the story persona and lets the boss greet and concede through match chat", async () => {
    const room = createRoom("sa06");
    const send = vi.fn<(type: string, payload: unknown) => void>();
    const client = { sessionId: "player", send, view: undefined } as unknown as Client;
    room.clients.push(client);
    room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: "sa06" });
    expect(room.addBot()).toBe(true);
    const persona = room.state.players[1]!.botPersonaId;
    expect(persona).toMatch(/^digimon:/);
    expect(room.state.players[1]!.displayName).toBe(storyBattles.find((battle) => battle.id === "sa06")!.opponent);
    const engine = (room as unknown as { engine: GameEngine }).engine;
    engine.applyIntent(1, { type: "surrender" });
    const getLines = () =>
      send.mock.calls
        .filter(([type]) => type === CHAT_CHANNEL)
        .map(([, payload]) => payload as ChatBroadcast)
        .map(({ sender, message }) => ({ sender, line: message.kind === "botLine" ? message.line : undefined }));
    await vi.waitFor(() => {
      expect(getLines()).toEqual([
        { sender: { kind: "player", seat: 1 }, line: BotLine.BOSS_GREETING.value },
        { sender: { kind: "player", seat: 1 }, line: BotLine.DEFEAT.value },
      ]);
    });
  });

  it.each(["sv01", "sa06"])("seats the fixed story bot level for %s instead of the lobby level", (battleId) => {
    const room = createRoom(battleId);
    const client = { sessionId: "player", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
    room.clients.push(client);
    room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: battleId });
    expect(room.addBot({ botDifficulty: BotDifficulty.MASTER.value, botStyle: BotStyle.DEFENSIVE.value })).toBe(true);
    const difficulty = getStoryBattleDifficulty({ battleId })!;
    const settings = (room as unknown as { botLevelSettings: ({ difficulty: string; style: string } | undefined)[] })
      .botLevelSettings[1];
    expect(settings?.difficulty).toBe(difficulty.botDifficulty);
    expect(settings?.style).not.toBe(BotStyle.DEFENSIVE.value);
    if (difficulty.botStyle) {
      expect(settings?.style).toBe(difficulty.botStyle);
    }
  });

  it.each(storyBattles.filter((battle) => battle.playable).map((battle) => battle.id))(
    "provides valid fixed decks and board for %s",
    (battleId) => {
      const fixture = getStoryScenario(battleId)!;
      expect(() => validateScenarioFixture(fixture)).not.toThrow();
      for (const seat of [0, 1] as const) {
        const deck = getStorySeatDeck({ fixture, seat });
        expect(deck.mainDeck).toHaveLength(50);
        const validation = validateDecklist(deck, { betaBattleMode: true });
        expect(validation).toEqual({ ok: true });
      }
    },
  );
  it("excludes Zephagamon from Shoto's test against Yao", () => {
    const fixture = getStoryScenario("crystal-sea-palace")!;
    expect(getStorySeatDeck({ fixture, seat: 0 }).mainDeck).not.toContain("ST18-12");
  });
});

it("allows guests to play and unlocks only their next battle after an authoritative win", async () => {
  const token = randomUUID();
  const guestHash = getStoryGuestHash(token)!;
  const client = { sessionId: "guest", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
  const options = { displayName: "Guest", deck: RED_DECK, storyBattleId: "ice-knight", storyGuestToken: token };
  const locked = createRoom("crystal-sea-palace");
  expect(await locked.onAuth(client, { ...options, storyBattleId: "crystal-sea-palace" })).toBe(false);
  const room = createRoom("ice-knight");
  expect(await room.onAuth(client, options)).toBe(true);
  room.clients.push(client);
  room.onJoin(client, options);
  expect(room.addBot()).toBe(true);
  const engine = (room as unknown as { engine: GameEngine }).engine;
  engine.applyIntent(1, { type: "surrender" });
  const store = new StoryProgressStore(accounts);
  await vi.waitFor(async () => expect(await store.getGuestProgress(guestHash)).toEqual({ completed: ["ice-knight"] }));
  expect(await store.getGuestProgress(getStoryGuestHash(randomUUID())!)).toEqual({ completed: [] });
  expect(await locked.onAuth(client, { ...options, storyBattleId: "crystal-sea-palace" })).toBe(true);
});

it("does not unlock guest progress on defeat", async () => {
  const token = randomUUID();
  const client = { sessionId: "guest", send: vi.fn<() => void>(), view: undefined } as unknown as Client;
  const options = { displayName: "Guest", deck: RED_DECK, storyBattleId: "ice-knight", storyGuestToken: token };
  const room = createRoom("ice-knight");
  expect(await room.onAuth(client, options)).toBe(true);
  room.clients.push(client);
  room.onJoin(client, options);
  room.addBot();
  (room as unknown as { engine: GameEngine }).engine.applyIntent(0, { type: "surrender" });
  expect(await new StoryProgressStore(accounts).getGuestProgress(getStoryGuestHash(token)!)).toEqual({ completed: [] });
});
