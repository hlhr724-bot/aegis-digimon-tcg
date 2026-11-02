import { describe, expect, it, vi } from "vitest";
import { waitForRankedReservation } from "@/ranked/waitForRankedReservation";

const options = {
  ranked: true,
  displayName: "One",
  deckId: "saved-one",
  format: "BT10" as const,
  deck: { mainDeck: [], eggDeck: [] },
};

describe("ranked queue lifecycle", () => {
  it("uses only saved deck identity and follows the server room reservation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ status: "reserved", roomId: "room-one", pairId: "pair-one", token: "seat-token" }),
        ),
      );
    expect(await waitForRankedReservation({ http: "https://aegis.test", options, fetcher })).toMatchObject({
      roomId: "room-one",
      pairId: "pair-one",
    });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      deckId: "saved-one",
      format: "BT10",
      region: "south_america",
    });
  });
  it("cancels its server queue when a search is aborted", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: "waiting" })));
    const pending = waitForRankedReservation({
      http: "https://aegis.test",
      options,
      signal: controller.signal,
      fetcher,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/i);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/aegis.test\/ranked\/queue\?search=/),
      expect.objectContaining({ method: "DELETE", keepalive: true }),
    );
  });
});
