import { ReplayLibrary } from "../../api/dist/replays/ReplayLibrary.js";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { Server, LocalPresence } from "colyseus";
import { createGameTransport } from "../../api/dist/connections/createGameTransport.js";
import { defineAegisRooms } from "../../api/dist/rooms/defineAegisRooms.js";
import { AegisRoom } from "../../api/dist/rooms/AegisRoom.js";
import { installPrivateRoomRoutes } from "../../api/dist/rooms/privateRoomRoutes.js";
import { installSpectatorRoutes } from "../../api/dist/rooms/spectatorRoutes.js";
import { AccountStore } from "../../api/dist/accounts/AccountStore.js";
import { installAccountRoutes } from "../../api/dist/accounts/routes.js";
import { SocialRoom } from "../../api/dist/social/SocialRoom.js";
import { SocialService } from "../../api/dist/social/SocialService.js";
import { socialRuntime } from "../../api/dist/social/socialRuntime.js";
import { resolveSocialInviteRoom } from "../../api/dist/social/resolveSocialInviteRoom.js";
import "../../api/dist/cards/index.js";

export async function startSocialBrowserServer() {
  const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
  const express = requireApi("express") as typeof import("../../api/node_modules/express");
  const { newDb, DataType } = requireApi("pg-mem") as typeof import("../../api/node_modules/pg-mem");
  const db = newDb({ noAstCoverageCheck: true });
  db.public.registerFunction({
    name: "decode",
    args: [DataType.text, DataType.text],
    returns: DataType.bytea,
    implementation: (value: string, format: BufferEncoding) => Buffer.from(value, format),
  });
  db.public.registerFunction({
    name: "encode",
    args: [DataType.bytea, DataType.text],
    returns: DataType.text,
    implementation: (value: Buffer, format: BufferEncoding) => Buffer.from(value).toString(format),
  });
  const accounts = new AccountStore(new (db.adapters.createPg().Pool)());
  const presence = new LocalPresence();
  const service = new SocialService({ accounts, presence, resolveRoom: resolveSocialInviteRoom });
  socialRuntime.service = service;
  const replays = new ReplayLibrary(accounts);
  class GameRoom extends AegisRoom {
    protected override replays() {
      return replays;
    }
    protected override accounts() {
      return accounts;
    }
  }
  class FriendsRoom extends SocialRoom {
    protected override createSocialService() {
      return service;
    }
  }
  const app = express();
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    next();
  });
  app.options("/{*path}", (_req, res) => res.sendStatus(204));
  app.use(express.json());
  installAccountRoutes(app, accounts);
  installPrivateRoomRoutes(app);
  installSpectatorRoutes(app);
  const http = createServer(app);
  const server = new Server({ transport: createGameTransport({ server: http }), presence, gracefullyShutdown: false });
  defineAegisRooms({
    define(name, roomClass, options) {
      if (roomClass === AegisRoom) {
        return server.define(name, GameRoom, options);
      }
      if (roomClass === SocialRoom) {
        return server.define(name, FriendsRoom, options);
      }
      return server.define(name, roomClass, options);
    },
  });
  await server.listen(Number(process.env.AEGIS_E2E_EDGE_PORT ?? 2569), "127.0.0.1");
  return {
    accounts,
    close: async () => {
      await server.gracefullyShutdown(false);
      socialRuntime.service = undefined;
      await accounts.close();
    },
  };
}
