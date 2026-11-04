import { Decoder, Encoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import { expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { RED_DECK } from "#api/engine/testDecks";

const uploadedAvatarUrl = "/account/avatar/first-account/image?v=3";

function client(sessionId: string): Client {
  return { sessionId, send: vi.fn<Client["send"]>(), view: undefined } as unknown as Client;
}

function decodeFor(encoder: Encoder, target: Client): GameState {
  const decoder = new Decoder(new GameState());
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  decoder.decode(encoder.encodeAllView(target.view!, iterator.offset, iterator));
  return decoder.state;
}

it("shows each seated account's profile avatar URL to both players in the match state", () => {
  const room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => undefined);
  room.unlock = vi.fn<() => Promise<void>>(async () => undefined);
  room.broadcast = vi.fn<AegisRoom["broadcast"]>() as never;
  room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => undefined) as never;
  Reflect.set(room, "_listing", {});
  room.onCreate({ seed: 1 });
  const encoder = new Encoder(room.state);
  Object.assign(room, {
    accountByClient: new Map([["first", "first-account"]]),
    liveAvatarUrlByClient: new Map([["first", uploadedAvatarUrl]]),
  });
  try {
    for (const [sessionId, displayName] of [
      ["first", "Taichi"],
      ["second", "Sora"],
    ] as const) {
      const player = client(sessionId);
      room.clients.push(player);
      room.onJoin(player, { displayName, deck: structuredClone(RED_DECK) });
    }

    expect(room.state.players[0]!.avatarUrl).toBe(uploadedAvatarUrl);
    expect(room.state.players[1]!.avatarUrl).toBe("");
    expect(decodeFor(encoder, room.clients[1]!).players[0]!.avatarUrl).toBe(uploadedAvatarUrl);
  } finally {
    room.onDispose();
  }
});
