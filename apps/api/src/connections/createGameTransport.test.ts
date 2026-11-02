import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { getMessageBytes, Protocol, Room, Server } from "colyseus";
import { describe, expect, it } from "vitest";
import type { Intent } from "@aegis/shared/protocol/intents";
import { buildTriggerKey } from "@aegis/shared/protocol/triggerKey";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";
import { createGameTransport } from "#api/connections/createGameTransport";
import { buildSubTriggerEffectKey } from "#api/engine/gameEngine/buildSubTriggerEffectKey";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function openTransportConnection() {
  const received = createDeferred<Intent>();
  class MessageRoom extends Room {
    override onCreate() {
      this.onMessage("intent", (_client, intent: Intent) => received.resolve(intent));
    }
  }
  const http = createServer();
  const server = new Server({ transport: createGameTransport({ server: http }), gracefullyShutdown: false });
  server.define("message-limit", MessageRoom);
  let pendingSocket: WebSocket | undefined;
  try {
    await server.listen(0, "127.0.0.1");
    const port = (http.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/matchmake/joinOrCreate/message-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`Matchmaking failed with ${response.status}`);
    }
    const reservation = (await response.json()) as {
      processId: string;
      roomId: string;
      sessionId: string;
    };
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/${reservation.processId}/${reservation.roomId}?sessionId=${reservation.sessionId}`,
    );
    pendingSocket = socket;
    socket.binaryType = "arraybuffer";
    const joined = createDeferred<void>();
    const closed = new Promise<CloseEvent>((resolve) =>
      socket.addEventListener(
        "close",
        (event) => {
          joined.reject(new Error(`Connection closed before joining: ${event.code}`));
          resolve(event);
        },
        { once: true },
      ),
    );
    socket.addEventListener("error", (event) => joined.reject(event), { once: true });
    socket.addEventListener(
      "message",
      (event: MessageEvent) => {
        try {
          if (new Uint8Array(event.data)[0] !== Protocol.JOIN_ROOM) {
            throw new Error("Expected a room join handshake");
          }
          socket.send(new Uint8Array([Protocol.JOIN_ROOM]));
          joined.resolve(undefined);
        } catch (error) {
          joined.reject(error);
        }
      },
      { once: true },
    );
    await joined.promise;
    return {
      socket,
      received: received.promise,
      closed,
      async stop() {
        socket.close();
        await closed;
        await server.gracefullyShutdown(false);
      },
    };
  } catch (error) {
    pendingSocket?.close();
    await server.gracefullyShutdown(false);
    throw error;
  }
}

function buildResolutionPlan(watcherCount: number): Intent {
  const order = Array.from({ length: watcherCount }, (_, index) => {
    const sourceInstanceId = `s0-${createHash("sha256").update(`watcher-${index}`).digest("hex")}`;
    const effectKey = buildSubTriggerEffectKey({
      event: "whenOneOfYoursDigivolves",
      sourcePermanentId: `perm-${index}`,
      sourceInstanceId,
      dedupeKey: `${sourceInstanceId}/EX11-067/ir-35-0/0`,
      description: "whenOneOfYoursDigivolves",
    });
    return buildTriggerKey(sourceInstanceId, effectKey);
  });
  return {
    type: "respondDecision",
    decisionId: "evolution-watchers",
    response: { kind: "orderTriggers", order, optionalAnswers: Object.fromEntries(order.map((key) => [key, false])) },
  };
}

describe("game transport message limits", () => {
  it.each([12, 256])("receives a plan of %i watchers without dropping the connection", async (watcherCount) => {
    const connection = await openTransportConnection();
    try {
      const intent = buildResolutionPlan(watcherCount);
      const message = getMessageBytes.raw(Protocol.ROOM_DATA, "intent", intent);
      expect(message.byteLength).toBeGreaterThan(4 * 1024);
      if (watcherCount === 256) {
        expect(message.byteLength).toBeGreaterThan(64 * 1024);
      }
      connection.socket.send(message);
      const outcome = await Promise.race([
        connection.received.then((received) => ({ received, closed: false })),
        connection.closed.then((event) => ({ received: undefined, closed: true, code: event.code })),
      ]);
      expect(outcome.closed).toBe(false);
      expect(outcome.received).toEqual(intent);
      expect(connection.socket.readyState).toBe(WebSocket.OPEN);
    } finally {
      await connection.stop();
    }
  });

  it("rejects messages above the shared one MiB limit with a message-too-big close", async () => {
    const connection = await openTransportConnection();
    try {
      expect(GAME_MESSAGE_LIMITS.maxMessageBytes).toBe(1024 * 1024);
      connection.socket.send(new Uint8Array(GAME_MESSAGE_LIMITS.maxMessageBytes + 1));
      expect((await connection.closed).code).toBe(1009);
    } finally {
      await connection.stop();
    }
  });
});
