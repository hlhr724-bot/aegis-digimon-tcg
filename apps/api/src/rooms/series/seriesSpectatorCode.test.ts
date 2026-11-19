import { describe, expect, it, vi } from "vitest";
import type { Delayed } from "colyseus";
import { GameState, type Seat } from "@aegis/shared";
import { AegisRoom, roomCodeDirectory } from "../AegisRoom.js";
import { RED_DECK } from "../../engine/testDecks.js";
import { CasualSeries, type SeriesRoomPort } from "./CasualSeries.js";
import { seriesDirectory, type SeriesRecord, type SeriesSeat } from "./SeriesDirectory.js";

const SPECTATOR_CODE = "WATCH2";

function buildSeat(token: string): SeriesSeat {
  return { token, displayName: token, deck: RED_DECK };
}

function buildPort(createNextRoom: SeriesRoomPort["createNextRoom"]): SeriesRoomPort {
  const timer = { clear: () => {} } as unknown as Delayed;
  return {
    state: new GameState(),
    roomName: "aegis",
    setTimeout: () => timer,
    setInterval: () => timer,
    seatSnapshot: (seat: Seat) => ({ displayName: `seat-${seat}`, deck: RED_DECK }),
    resolveDeckChoice: () => undefined,
    sendToSeat: () => {},
    createNextRoom,
    logError: () => {},
  };
}

describe("spectator code across the games of a casual series", () => {
  it("hands the spectator code of the first game to the next game", async () => {
    let savedRecord: SeriesRecord | undefined;
    const createNextRoom = vi.fn<SeriesRoomPort["createNextRoom"]>(async ({ seriesId }) => {
      savedRecord = await seriesDirectory().load(seriesId);
      return "next-room";
    });
    const port = buildPort(createNextRoom);
    const series = CasualSeries.begin(port, {
      bestOf: 3,
      matchTimer: false,
      timerStartSeconds: 0,
      spectatorCode: SPECTATOR_CODE,
    });
    series.noteFirstSeat(0);

    series.recordGame(0, undefined);
    series.handleMessage(port.state.series.chooserSeat as Seat, { action: "chooseTurnOrder", goFirst: true }, true);

    await vi.waitFor(() => expect(port.state.series.nextRoomId).toBe("next-room"));
    expect(savedRecord?.spectatorCode).toBe(SPECTATOR_CODE);
  });

  it("opens the next game under the spectator code of the series", async () => {
    const record: SeriesRecord = {
      id: "series-with-spectators",
      nonce: "nonce",
      roomName: "aegis",
      bestOf: 3,
      matchTimer: false,
      timerStartSeconds: 0,
      spectatorCode: SPECTATOR_CODE,
      results: [0],
      seats: [buildSeat("first"), buildSeat("second")],
      firstSeat: 1,
    };
    await seriesDirectory().save(record);
    const room = new AegisRoom();
    room.roomName = "aegis";
    room.setPrivate = vi.fn<AegisRoom["setPrivate"]>(async () => {});
    room.setMatchmaking = vi.fn<AegisRoom["setMatchmaking"]>(async () => {});
    (room as unknown as Record<string, () => void>)["__init"]!.call(room);

    await room.onCreate({ seriesId: record.id, seriesNonce: record.nonce });

    expect(room.state.spectatorCode).toBe(SPECTATOR_CODE);
    expect(await roomCodeDirectory().resolve(SPECTATOR_CODE)).toBe(room.roomId);
    room.onDispose();
  });
});
