import { CloseCode } from "@colyseus/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AegisRoom } from "@/net/client";
import { watchRoomLiveness } from "@/net/watchRoomLiveness";

function createRoom({ answersPings }: { answersPings: boolean }) {
  const close = vi.fn<(code?: number) => void>();
  const ping = vi.fn<(callback: (latencyMs: number) => void) => void>((callback) => {
    if (answersPings) queueMicrotask(() => callback(20));
  });
  const room = { ping, connection: { close } } as unknown as AegisRoom;
  return { room, ping, close };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

it("closes a silent connection for reconnection within eight seconds", async () => {
  const { room, close } = createRoom({ answersPings: false });
  const stop = watchRoomLiveness({ room });
  await vi.advanceTimersByTimeAsync(6_000);
  expect(close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(close).toHaveBeenCalledWith(CloseCode.MAY_TRY_RECONNECT);
  stop();
});

it("keeps a connection open while the server answers pings", async () => {
  const { room, ping, close } = createRoom({ answersPings: true });
  const stop = watchRoomLiveness({ room });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(close).not.toHaveBeenCalled();
  expect(ping.mock.calls.length).toBeGreaterThanOrEqual(15);
  stop();
});

it("probes again instead of closing when the page's timers were frozen", async () => {
  const { room, ping, close } = createRoom({ answersPings: false });
  const stop = watchRoomLiveness({ room });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(ping).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 30_000);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(close).not.toHaveBeenCalled();
  expect(ping).toHaveBeenCalledTimes(2);
  stop();
});
