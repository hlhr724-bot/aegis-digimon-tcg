import type { Client } from "colyseus";
import { afterEach, expect, it, vi } from "vitest";
import { BotLine } from "@aegis/shared/bot/BotLine";
import { ALL_FAMOUS_DECKS } from "@aegis/shared/decks/index";
import { CHAT_CHANNEL, type ChatBroadcast } from "@aegis/shared/protocol/chat";
import type { Intent } from "@aegis/shared/protocol/intents";
import { trainingDeck, TRAINING_DECK_VERSIONS } from "#api/bot/training/decks";
import { AegisRoom } from "#api/rooms/AegisRoom";

let room: AegisRoom | undefined;

afterEach(() => {
  room?.onDispose();
  room?.clock.stop();
  room = undefined;
});

it("lets a practice bot greet the player and react to the result through match chat", async () => {
  room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => {});
  room.unlock = vi.fn<() => Promise<void>>(async () => {});
  room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => {});
  room.broadcast = vi.fn<AegisRoom["broadcast"]>(() => true);
  room.onCreate({ botRoom: true, seed: 3 });
  const send = vi.fn<(type: string, payload: unknown) => void>();
  const human = { sessionId: "human", send } as unknown as Client;
  room.clients.push(human);
  room.onJoin(human, { displayName: "Human", deck: trainingDeck(TRAINING_DECK_VERSIONS[0]).deck });
  const deckId = ALL_FAMOUS_DECKS.find((deck) => deck.deckVersion === TRAINING_DECK_VERSIONS[1])!.deckId;
  expect(room.addBot(deckId)).toBe(true);
  const getLines = () =>
    send.mock.calls
      .filter(([type]) => type === CHAT_CHANNEL)
      .map(([, payload]) => payload as ChatBroadcast)
      .map(({ sender, message }) => ({ sender, message }));
  await vi.waitFor(() => {
    expect(getLines()).toEqual([
      {
        sender: { kind: "player", seat: 1 },
        message: { kind: "botLine", line: BotLine.GREETING.value, text: BotLine.GREETING.text },
      },
    ]);
  });
  const internal = room as unknown as { handleIntent: (client: Client, intent: Intent) => void };
  internal.handleIntent(human, { type: "surrender" });
  await vi.waitFor(() => {
    expect(getLines().at(-1)?.message).toEqual({
      kind: "botLine",
      line: BotLine.VICTORY.value,
      text: BotLine.VICTORY.text,
    });
  });
});
