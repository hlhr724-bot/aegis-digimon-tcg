import type { Client } from "colyseus";
import { afterEach, expect, it, vi } from "vitest";
import { AegisRoom } from "#api/rooms/AegisRoom";

const rooms: AegisRoom[] = [];

afterEach(() => {
  for (const room of rooms.splice(0)) {
    room.onDispose();
    room.clock.stop();
  }
});

it("seats the opponent in the Arisa rematch with a complete story deck", () => {
  const room = new AegisRoom();
  rooms.push(room);
  room.broadcast = vi.fn<() => boolean>(() => true) as AegisRoom["broadcast"];
  room.onCreate({ botRoom: true, betaBattleRoom: true, storyBattleId: "arisa-rematch", seed: 1265452487 });
  const human = { sessionId: "human", send: vi.fn<() => void>() } as unknown as Client;
  room.clients.push(human);
  room.onJoin(human, { displayName: "Human", deck: { mainDeck: [], eggDeck: [] } });

  expect(room.addBot()).toBe(true);
  expect(room.state.players[1]?.sessionId).toBe("bot");
});
