import { describe, expect, it, vi } from "vitest";
import { requestActiveMatch } from "@/net/activeMatch/requestActiveMatch";
import { requestActiveMatchClaim } from "@/net/activeMatch/requestActiveMatchClaim";

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("active match requests", () => {
  it("reads the signed-in account's live match with its session cookie", async () => {
    const fetcher = respond(200, { roomId: "room-1", seat: 1 });

    expect(await requestActiveMatch({ http: "https://api.test", fetcher })).toEqual({ roomId: "room-1", seat: 1 });
    expect(fetcher).toHaveBeenCalledWith("https://api.test/match/active", {
      credentials: "include",
      cache: "no-store",
    });
  });

  it("keeps the reconnect grace left on a dropped seat and ignores an invalid one", async () => {
    const held = respond(200, { roomId: "room-1", seat: 1, reconnectGraceMs: 42_000 });
    const invalid = respond(200, { roomId: "room-1", seat: 1, reconnectGraceMs: -5 });

    expect(await requestActiveMatch({ http: "https://api.test", fetcher: held })).toEqual({
      roomId: "room-1",
      seat: 1,
      reconnectGraceMs: 42_000,
    });
    expect(await requestActiveMatch({ http: "https://api.test", fetcher: invalid })).toEqual({
      roomId: "room-1",
      seat: 1,
    });
  });

  it.each([
    [404, { error: "not_found" }],
    [200, { roomId: "room-1", seat: 2 }],
    [200, { roomId: "", seat: 0 }],
    [200, null],
  ])("treats a %i response %j as no live match", async (status, body) => {
    expect(await requestActiveMatch({ http: "https://api.test", fetcher: respond(status, body) })).toBeUndefined();
  });

  it("claims the seat as JSON and returns the new reconnection token", async () => {
    const fetcher = respond(200, { roomId: "room-1", seat: 0, reconnectionToken: "room-1:fresh" });

    expect(await requestActiveMatchClaim({ http: "https://api.test", fetcher, roomId: "room-1" })).toEqual({
      roomId: "room-1",
      seat: 0,
      reconnectionToken: "room-1:fresh",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/match/active/claim",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: "room-1" }),
      }),
    );
  });

  it.each([
    [404, { error: "not_found" }],
    [200, { roomId: "room-2", seat: 0, reconnectionToken: "room-2:fresh" }],
    [200, { roomId: "room-1", seat: 0, reconnectionToken: "room-2:fresh" }],
    [200, { roomId: "room-1", seat: 0 }],
  ])("refuses a %i claim response %j that does not name the requested room", async (status, body) => {
    expect(
      await requestActiveMatchClaim({ http: "https://api.test", fetcher: respond(status, body), roomId: "room-1" }),
    ).toBeUndefined();
  });
});
