import { createServer } from "node:http";
import { createRequire } from "node:module";
import { Server } from "colyseus";
import { createGameTransport } from "../../api/dist/connections/createGameTransport.js";
import { defineAegisRooms } from "../../api/dist/rooms/defineAegisRooms.js";
import { installPrivateRoomRoutes } from "../../api/dist/rooms/privateRoomRoutes.js";
import { installSpectatorRoutes } from "../../api/dist/rooms/spectatorRoutes.js";

export async function startManualBrowserServer() {
  const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
  const express = requireApi("express") as typeof import("../../api/node_modules/express");
  const app = express();
  app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", request.headers.origin ?? "*");
    response.header("Access-Control-Allow-Credentials", "true");
    response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });
  app.options("/{*path}", (_request, response) => response.sendStatus(204));
  app.use(express.json());
  installPrivateRoomRoutes(app);
  installSpectatorRoutes(app);
  const http = createServer(app);
  const server = new Server({ transport: createGameTransport({ server: http }) });
  defineAegisRooms(server);
  await server.listen(Number(process.env.AEGIS_E2E_EDGE_PORT ?? 2569), "127.0.0.1");
  return { close: () => server.gracefullyShutdown(false) };
}
