import { afterEach, describe, expect, it, vi } from "vitest";
import type { AegisRoom } from "@/net/client";
import { connectRankedMatch } from "@/ranked/connectRankedMatch";

afterEach(() => {
  vi.useRealTimers();
});
const options = {
  ranked: true,
  displayName: "One",
  deckId: "saved",
  format: "BT10" as const,
  deck: { mainDeck: [], eggDeck: [] },
};

function createRoom(started: boolean) {
  const listeners = new Set<() => void>();
  const onStateChange = Object.assign(
    (listener: () => void) => {
      listeners.add(listener);
    },
    {
      remove: (listener: () => void) => {
        listeners.delete(listener);
      },
    },
  );
  const room = {
    state: { rankedDeadlineAt: started ? 1 : 0 },
    connection: { isOpen: true },
    onStateChange,
    onMessage: vi.fn<() => () => void>(() => () => {}),
    send: vi.fn<() => void>(),
    leave: vi.fn<() => Promise<number>>().mockResolvedValue(1000),
  };
  return room;
}

describe("ranked reservation recovery", () => {
  it("keeps monitoring a seated reservation and follows the replacement after an opponent cancels", async () => {
    vi.useFakeTimers();
    const first = createRoom(false);
    const replacement = createRoom(true);
    let gets = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ status: "reserved", roomId: "old", pairId: "old-pair", token: "old-token" }),
        );
      }
      gets++;
      return new Response(
        JSON.stringify(
          gets === 1
            ? { status: "waiting" }
            : { status: "reserved", roomId: "new", pairId: "new-pair", token: "new-token" },
        ),
      );
    });
    const joinRoom = vi
      .fn<(reservation: { roomId?: string }) => Promise<AegisRoom>>()
      .mockImplementation(
        async (reservation) => (reservation.roomId === "old" ? first : replacement) as unknown as AegisRoom,
      );
    const pending = connectRankedMatch({ http: "https://aegis.test", options, fetcher, joinRoom });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe(replacement);
    expect(first.leave).toHaveBeenCalledOnce();
    expect(joinRoom).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
  });
  it("cancels its own search and closes the waiting socket when the user leaves", async () => {
    vi.useFakeTimers();
    const room = createRoom(false);
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ status: "reserved", roomId: "old", pairId: "old-pair", token: "token" })),
      );
    const pending = connectRankedMatch({
      http: "https://aegis.test",
      options,
      signal: controller.signal,
      fetcher,
      joinRoom: async () => room as unknown as AegisRoom,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/i);
    expect(room.leave).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/queue\?search=/),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
