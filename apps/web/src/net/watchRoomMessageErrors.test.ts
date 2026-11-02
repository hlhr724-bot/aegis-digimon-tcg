import { CloseCode, Protocol, Room } from "@colyseus/sdk";
import { describe, expect, it, vi } from "vitest";
import { GameState } from "@aegis/shared";
import { Connection } from "@colyseus/sdk/Connection";
import { watchRoomMessageErrors } from "@/net/watchRoomMessageErrors";

class ReceivingRoom extends Room<GameState> {
  constructor() {
    super("test");
    this.connection = new Connection();
    this.connection.events.onmessage = this.onMessageCallback.bind(this);
  }
}

function setup() {
  const room = new ReceivingRoom();
  const close = vi.spyOn(room.connection, "close").mockImplementation(() => {});
  const report = vi.fn();
  const original = room.connection.events.onmessage;
  const stop = watchRoomMessageErrors({ room, report });
  function receive(bytes: number[]) {
    room.connection.events.onmessage?.(new MessageEvent("message", { data: new Uint8Array(bytes).buffer }));
  }
  return { room, close, report, original, stop, receive };
}

describe("room message decoding recovery", () => {
  it("delivers valid data without reconnecting", () => {
    const s = setup();
    const receiveData = vi.fn();
    s.room.onMessage("x", receiveData);
    s.receive([Protocol.ROOM_DATA, 161, 120, 42]);
    expect(receiveData).toHaveBeenCalledExactlyOnceWith(42);
    expect(s.close).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled();
  });

  it("reports the decoding error and closes once before consuming further messages", () => {
    const s = setup();
    const receiveData = vi.fn();
    s.room.onMessage("x", receiveData);
    s.receive([Protocol.ROOM_DATA, 161, 120, 129, 161]);
    s.receive([Protocol.ROOM_DATA, 161, 120, 129, 161]);
    s.receive([Protocol.ROOM_DATA, 161, 120, 42]);
    expect(s.report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: "Unexpected end of MessagePack data" }),
    );
    expect(s.close).toHaveBeenCalledExactlyOnceWith(CloseCode.MAY_TRY_RECONNECT);
    expect(receiveData).not.toHaveBeenCalled();
  });

  it("does not hide application errors or reconnect for them", () => {
    const s = setup();
    const error = new RangeError("Maximum call stack size exceeded");
    s.room.onMessage("x", () => {
      throw error;
    });
    expect(() => s.receive([Protocol.ROOM_DATA, 161, 120, 42])).toThrow(error);
    expect(s.close).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled();
  });

  it("restores the receive handler when the room is unbound", () => {
    const s = setup();
    s.stop();
    expect(s.room.connection.events.onmessage).toBe(s.original);
    expect(() => s.receive([Protocol.ROOM_DATA, 161, 120, 129, 161])).toThrow("Unexpected end of MessagePack data");
  });

  it("preserves a handler installed later", () => {
    const s = setup();
    const replacement = vi.fn();
    s.room.connection.events.onmessage = replacement;
    s.stop();
    expect(s.room.connection.events.onmessage).toBe(replacement);
  });
});
