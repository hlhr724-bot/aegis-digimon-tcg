import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";
import { validateDecklist } from "#api/engine/deckValidation";
import { validateScenarioFixture } from "#api/engine/scenario/fixture";
import type { GameEngine } from "#api/engine/GameEngine";
import { RED_DECK } from "#api/engine/testDecks";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { getStoryGuestHash } from "#api/story/getStoryGuestHash";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { StoryProgressStore } from "#api/story/StoryProgressStore";
import { getKeywordDrillScenario } from "#api/tutorial/getKeywordDrillScenario";
import { getTutorialScenario } from "#api/tutorial/getTutorialScenario";
import { getRulePracticeScenario } from "#api/tutorial/getRulePracticeScenario";
import { keywordDrills } from "@aegis/shared/tutorial/keywordDrills";
import { tutorialLessons } from "@aegis/shared/tutorial/tutorialLessons";
import { rulePracticeLessons } from "@aegis/shared/tutorial/rulePracticeLessons";

let accounts: AccountStore;
const rooms: AegisRoom[] = [];
const firstLessonId = tutorialLessons[0]!.id;
const secondLessonId = tutorialLessons[1]!.id;
const firstDrillId = keywordDrills[0]!.id;

class TutorialTestRoom extends AegisRoom {
  protected override replays() {
    return { record: async () => "local-replay" };
  }
  protected override accounts(): AccountStore {
    return accounts;
  }
}

function createRoom(lessonId: string, overrides: Record<string, unknown> = {}): AegisRoom {
  const room = new TutorialTestRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  rooms.push(room);
  room.onCreate({ seed: 1, botRoom: true, betaBattleRoom: true, storyBattleId: lessonId, ...overrides });
  return room;
}

function createClient(sessionId: string): Client {
  return { sessionId, send: vi.fn<() => void>(), view: undefined } as unknown as Client;
}

function getEngine(room: AegisRoom): GameEngine {
  return (room as unknown as { engine: GameEngine }).engine;
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

describe("tutorial lesson rooms", () => {
  it.each([
    ["a non-bot room", { botRoom: false }],
    ["a ranked room", { rankedRoom: true }],
    ["a private room", { private: true }],
    ["a dev scenario", { devScenario: "local-fixture" }],
  ])("rejects a lesson in %s", (_label, overrides) => {
    expect(() => createRoom(firstLessonId, overrides)).toThrow("Invalid story room");
  });

  it("rejects an unknown lesson id", () => {
    expect(() => createRoom("tutorial-unknown")).toThrow("Story battle is not available");
  });

  it("keeps the player's name, names the deck after the lesson, and seats the training bot", async () => {
    const room = createRoom(firstLessonId);
    const client = createClient("player");
    const options = {
      displayName: "Player",
      deck: RED_DECK,
      storyBattleId: firstLessonId,
      storyGuestToken: randomUUID(),
    };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    expect(room.addBot()).toBe(true);
    expect(room.state.players[0]!.displayName).toBe("Player");
    expect(room.state.players[1]!.displayName).toBe("Training Bot");
    expect(room.state.allowRollback).toBe(false);
  });

  it("keeps the lesson draw order instead of shuffling the decks", () => {
    const room = createRoom(firstLessonId);
    const client = createClient("player");
    room.clients.push(client);
    room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: firstLessonId });
    expect(room.addBot()).toBe(true);
    const fixture = getTutorialScenario(firstLessonId)!;
    for (const seat of [0, 1] as const) {
      const deck = room.state.players[seat]!.deck.map((card) => card.cardId);
      const expected = fixture.board[seat]!.deck as string[];
      expect(expected.slice(expected.length - deck.length)).toEqual(deck);
    }
  });

  it("requires the first lesson before later lessons", async () => {
    const token = randomUUID();
    const client = createClient("guest");
    const options = { displayName: "Guest", deck: RED_DECK, storyGuestToken: token };
    const locked = createRoom(secondLessonId);
    expect(await locked.onAuth(client, { ...options, storyBattleId: secondLessonId })).toBe(false);
    await new StoryProgressStore(accounts).recordGuestVictory({
      guestHash: getStoryGuestHash(token)!,
      battleId: firstLessonId,
      matchId: "first",
    });
    expect(await locked.onAuth(client, { ...options, storyBattleId: secondLessonId })).toBe(true);
  });

  it("records the lesson id when the account player wins", async () => {
    const room = createRoom(firstLessonId);
    const account = await accounts.accountForIdentity("discord", "a", "Alice");
    const client = createClient("player");
    const options = {
      displayName: "Player",
      deck: RED_DECK,
      storyBattleId: firstLessonId,
      authTicket: await accounts.createRoomTicket(account.id),
    };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    room.addBot();
    getEngine(room).applyIntent(1, { type: "surrender" });
    await vi.waitFor(async () => {
      expect(await new StoryProgressStore(accounts).getProgress(account.id)).toEqual({ completed: [firstLessonId] });
    });
  });

  it("records the lesson id when a guest wins and not when the guest loses", async () => {
    const store = new StoryProgressStore(accounts);
    const winnerToken = randomUUID();
    const loserToken = randomUUID();
    for (const [token, losingSeat] of [
      [winnerToken, 1],
      [loserToken, 0],
    ] as const) {
      const room = createRoom(firstLessonId);
      const client = createClient(`guest-${losingSeat}`);
      const options = { displayName: "Guest", deck: RED_DECK, storyBattleId: firstLessonId, storyGuestToken: token };
      expect(await room.onAuth(client, options)).toBe(true);
      room.clients.push(client);
      room.onJoin(client, options);
      room.addBot();
      getEngine(room).applyIntent(losingSeat, { type: "surrender" });
    }
    await vi.waitFor(async () => {
      expect(await store.getGuestProgress(getStoryGuestHash(winnerToken)!)).toEqual({ completed: [firstLessonId] });
    });
    expect(await store.getGuestProgress(getStoryGuestHash(loserToken)!)).toEqual({ completed: [] });
  });

  it.each(tutorialLessons.map((lesson) => lesson.id))("starts %s with two legal fixed decks", (lessonId) => {
    const fixture = getTutorialScenario(lessonId)!;
    expect(() => validateScenarioFixture(fixture)).not.toThrow();
    for (const seat of [0, 1] as const) {
      const deck = getStorySeatDeck({ fixture, seat });
      expect(deck.mainDeck).toHaveLength(50);
      expect(validateDecklist(deck), `seat ${seat}`).toEqual({ ok: true });
    }
    const room = createRoom(lessonId);
    const client = createClient("player");
    room.clients.push(client);
    room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: lessonId });
    expect(room.addBot()).toBe(true);
    expect(room.state.players).toHaveLength(2);
    expect(room.state.gameOver).toBe(false);
  });

  it.each(keywordDrills.map((drill) => drill.id))("starts the drill %s with two legal fixed decks", (drillId) => {
    const fixture = getKeywordDrillScenario(drillId)!;
    expect(() => validateScenarioFixture(fixture)).not.toThrow();
    for (const seat of [0, 1] as const) {
      const deck = getStorySeatDeck({ fixture, seat });
      expect(deck.mainDeck).toHaveLength(50);
      expect(validateDecklist(deck), `seat ${seat}`).toEqual({ ok: true });
    }
    const room = createRoom(drillId);
    const client = createClient("player");
    room.clients.push(client);
    room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: drillId });
    expect(room.addBot()).toBe(true);
    expect(room.state.players[1]!.displayName).toBe("Training Bot");
    expect(room.state.gameOver).toBe(false);
  });

  it("opens a drill for a new guest and records the drill id when the guest wins", async () => {
    const token = randomUUID();
    const room = createRoom(firstDrillId);
    const client = createClient("guest");
    const options = { displayName: "Guest", deck: RED_DECK, storyBattleId: firstDrillId, storyGuestToken: token };
    expect(await room.onAuth(client, options)).toBe(true);
    room.clients.push(client);
    room.onJoin(client, options);
    room.addBot();
    getEngine(room).applyIntent(1, { type: "surrender" });
    await vi.waitFor(async () => {
      expect(await new StoryProgressStore(accounts).getGuestProgress(getStoryGuestHash(token)!)).toEqual({
        completed: [firstDrillId],
      });
    });
  });

  it.each(rulePracticeLessons.map((lesson) => lesson.id))(
    "starts rules practice %s with legal decks and a bot",
    (lessonId) => {
      const fixture = getRulePracticeScenario(lessonId)!;
      expect(() => validateScenarioFixture(fixture)).not.toThrow();
      for (const seat of [0, 1] as const) {
        const deck = getStorySeatDeck({ fixture, seat });
        expect(deck.mainDeck).toHaveLength(50);
        expect(validateDecklist(deck), `seat ${seat}`).toEqual({ ok: true });
      }
      const room = createRoom(lessonId);
      const client = createClient("player");
      room.clients.push(client);
      room.onJoin(client, { displayName: "Player", deck: RED_DECK, storyBattleId: lessonId });
      expect(room.addBot()).toBe(true);
      expect(room.state.players[1]!.displayName).toBe("Training Bot");
      expect(room.state.gameOver).toBe(false);
    },
  );
});
