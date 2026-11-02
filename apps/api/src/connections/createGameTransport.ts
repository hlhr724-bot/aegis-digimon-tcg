import type { Server } from "node:http";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GAME_MESSAGE_LIMITS } from "@aegis/shared/protocol/gameMessageLimits";

type Params = {
  server: Server;
};

export function createGameTransport({ server }: Params): WebSocketTransport {
  return new WebSocketTransport({ server, maxPayload: GAME_MESSAGE_LIMITS.maxMessageBytes });
}
