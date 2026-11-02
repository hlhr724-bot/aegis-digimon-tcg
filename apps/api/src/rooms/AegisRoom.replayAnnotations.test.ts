import { describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import type { ReplayAnnotationStore } from "#api/replays/annotations/ReplayAnnotationStore";
import { AegisRoom } from "#api/rooms/AegisRoom";
import { LIVE_REPLAY_ANNOTATION_CHANNEL } from "@aegis/shared/replays/annotations/LiveReplayAnnotation";

const EMPTY_DECK = { mainDeck: [], eggDeck: [] };
const MATCH_ID = "00000000-0000-4000-8000-000000000007";

type RoomInternals = {
  accountByClient: Map<string, string>;
  replayRecording: { id: string; frameCount: number; exceededLimit: boolean };
  handleLiveReplayAnnotation: (client: Client, payload: unknown) => void;
};

class AnnotatedRoom extends AegisRoom {
  readonly addMarker = vi.fn<ReplayAnnotationStore["addMarker"]>(async (params) => ({
    kind: "added",
    marker: { id: "marker", createdAt: 1, ...params },
  }));

  readonly addNote = vi.fn<ReplayAnnotationStore["addNote"]>(async (params) => ({
    kind: "added",
    note: { id: "note", createdAt: 1, updatedAt: 1, ...params },
  }));

  protected override replayAnnotations(): Pick<ReplayAnnotationStore, "addMarker" | "addNote"> {
    return { addMarker: this.addMarker, addNote: this.addNote };
  }
}

function fakeClient(sessionId: string): Client {
  return { sessionId, send: vi.fn<Client["send"]>(), view: undefined } as unknown as Client;
}

describe("AegisRoom live replay markers", () => {
  it("answers only the marking player and never broadcasts the marker", async () => {
    const room = new AnnotatedRoom();
    room.lock = vi.fn<() => Promise<void>>(async () => {});
    room.unlock = vi.fn<() => Promise<void>>(async () => {});
    room.setMatchmaking = vi.fn<() => Promise<void>>(async () => {});
    const broadcast = vi.fn<(type: string, message: unknown) => boolean>(() => true);
    room.broadcast = broadcast as AegisRoom["broadcast"];
    room.onCreate({ seed: 1 });
    try {
      const marking = fakeClient("session-a");
      const opponent = fakeClient("session-b");
      room.clients.push(marking);
      room.onJoin(marking, { displayName: "A", deck: EMPTY_DECK });
      room.clients.push(opponent);
      room.onJoin(opponent, { displayName: "B", deck: EMPTY_DECK });
      const internals = room as unknown as RoomInternals;
      internals.accountByClient.set("session-a", "account-a");
      internals.replayRecording = { id: MATCH_ID, frameCount: 3, exceededLimit: false };

      internals.handleLiveReplayAnnotation(marking, { kind: "marker", emoji: "⭐" });
      await vi.waitFor(() => expect(marking.send).toHaveBeenCalled());

      expect(room.addMarker).toHaveBeenCalledWith(
        expect.objectContaining({ authorId: "account-a", matchId: MATCH_ID, frameIndex: 2, emoji: "⭐" }),
      );
      expect(marking.send).toHaveBeenCalledWith(
        LIVE_REPLAY_ANNOTATION_CHANNEL,
        expect.objectContaining({ kind: "marker", marker: expect.objectContaining({ frameIndex: 2 }) }),
      );
      expect(opponent.send).not.toHaveBeenCalledWith(LIVE_REPLAY_ANNOTATION_CHANNEL, expect.anything());
      expect(broadcast).not.toHaveBeenCalledWith(LIVE_REPLAY_ANNOTATION_CHANNEL, expect.anything());

      internals.handleLiveReplayAnnotation(opponent, { kind: "marker", emoji: "⭐" });
      await vi.waitFor(() =>
        expect(opponent.send).toHaveBeenCalledWith(LIVE_REPLAY_ANNOTATION_CHANNEL, {
          kind: "rejected",
          reason: "sign_in_required",
        }),
      );
      expect(room.addMarker).toHaveBeenCalledTimes(1);
    } finally {
      room.onDispose();
    }
  });
});
