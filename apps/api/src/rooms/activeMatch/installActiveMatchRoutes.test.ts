import express from "express";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { LocalPresence } from "colyseus";
import type { Account, AuthSession } from "#api/accounts/AccountStore";
import type { ActiveMatchRooms } from "#api/rooms/activeMatch/ActiveMatchRooms";
import { createActiveMatchDirectory } from "#api/rooms/activeMatch/createActiveMatchDirectory";
import { installActiveMatchRoutes } from "#api/rooms/activeMatch/installActiveMatchRoutes";

type RequestParams = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  contentType?: string;
};

function createSession(accountId: string): AuthSession {
  return { id: "session", account: { id: accountId, displayName: "Owner" } as Account, expiresAt: Date.now() + 60_000 };
}

async function createServer(accountId: string | undefined) {
  const directory = createActiveMatchDirectory({ presence: new LocalPresence() });
  const rooms = {
    findSeat: vi.fn<ActiveMatchRooms["findSeat"]>(async ({ roomId }) => ({ roomId, seat: 1 })),
    transferSeat: vi.fn<ActiveMatchRooms["transferSeat"]>(async ({ roomId }) => ({
      roomId,
      seat: 1,
      reconnectionToken: `${roomId}:fresh-token`,
    })),
  };
  const app = express();
  app.use(express.json());
  installActiveMatchRoutes({
    app,
    session: async () => (accountId ? createSession(accountId) : undefined),
    directory: () => directory,
    rooms,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const request = async ({ method, path, body, contentType = "application/json" }: RequestParams) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method,
      ...(body === undefined ? {} : { headers: { "Content-Type": contentType }, body: JSON.stringify(body) }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const close = () =>
    new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return { directory, rooms, request, close };
}

describe("active match routes", () => {
  it("requires a signed-in account to look up or claim a match", async () => {
    const server = await createServer(undefined);
    try {
      expect((await server.request({ method: "GET", path: "/match/active" })).status).toBe(401);
      expect(
        (await server.request({ method: "POST", path: "/match/active/claim", body: { roomId: "room-1" } })).status,
      ).toBe(401);
      expect(server.rooms.findSeat).not.toHaveBeenCalled();
      expect(server.rooms.transferSeat).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("reports the signed-in account's live match", async () => {
    const server = await createServer("account-b");
    try {
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });

      const response = await server.request({ method: "GET", path: "/match/active" });

      expect(response).toEqual({ status: 200, body: { roomId: "room-1", seat: 1 } });
      expect(server.rooms.findSeat).toHaveBeenCalledWith({ roomId: "room-1", accountId: "account-b" });
    } finally {
      await server.close();
    }
  });

  it("returns 404 when the account has no live match or the room no longer seats it", async () => {
    const server = await createServer("account-b");
    try {
      expect((await server.request({ method: "GET", path: "/match/active" })).status).toBe(404);
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });
      server.rooms.findSeat.mockResolvedValueOnce(null);
      expect((await server.request({ method: "GET", path: "/match/active" })).status).toBe(404);
      server.rooms.findSeat.mockRejectedValueOnce(new Error("room timed out"));
      expect((await server.request({ method: "GET", path: "/match/active" })).status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("claims the seat for the account in the session, never for an account named in the body", async () => {
    const server = await createServer("account-b");
    try {
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });

      const response = await server.request({
        method: "POST",
        path: "/match/active/claim",
        body: { roomId: "room-1", accountId: "account-a" },
      });

      expect(response).toEqual({
        status: 200,
        body: { roomId: "room-1", seat: 1, reconnectionToken: "room-1:fresh-token" },
      });
      expect(server.rooms.transferSeat).toHaveBeenCalledWith({ roomId: "room-1", accountId: "account-b" });
    } finally {
      await server.close();
    }
  });

  it("refuses to claim a room that is not the account's live match", async () => {
    const server = await createServer("account-a");
    try {
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });

      const response = await server.request({
        method: "POST",
        path: "/match/active/claim",
        body: { roomId: "room-1" },
      });

      expect(response.status).toBe(404);
      expect(server.rooms.transferSeat).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("returns 404 when the room refuses the transfer", async () => {
    const server = await createServer("account-b");
    try {
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });
      server.rooms.transferSeat.mockResolvedValueOnce(null);

      const response = await server.request({
        method: "POST",
        path: "/match/active/claim",
        body: { roomId: "room-1" },
      });

      expect(response.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it("refuses a claim that is not sent as JSON", async () => {
    const server = await createServer("account-b");
    try {
      await server.directory.publish({ accountId: "account-b", roomId: "room-1" });

      const response = await server.request({
        method: "POST",
        path: "/match/active/claim",
        body: { roomId: "room-1" },
        contentType: "text/plain",
      });

      expect(response.status).toBe(415);
      expect(server.rooms.transferSeat).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
