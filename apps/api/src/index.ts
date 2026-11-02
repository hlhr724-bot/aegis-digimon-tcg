import { createTournamentDiscordSweep } from "#api/tournaments/discord/createTournamentDiscordSweep";
import { createTournamentResultSweep } from "#api/tournaments/results/createTournamentResultSweep";
import { createTournamentCircuitSweep } from "#api/tournaments/circuits/createTournamentCircuitSweep";
import { startRankedMaintenance } from "#api/ranked/startRankedMaintenance";
import { installQuickMatchPreference } from "#api/rooms/installQuickMatchPreference";
import { installMatchQueueRoutes } from "#api/matchmaking/installMatchQueueRoutes";
import { countRankedSearchers } from "#api/ranked/countRankedSearchers";
import { getRankedConfig } from "#api/ranked/getRankedConfig";
import { DirectMessageStore } from "#api/messages/DirectMessageStore";
import { socialRuntime } from "#api/social/socialRuntime";
import { SocialService } from "#api/social/SocialService";
import { resolveSocialInviteRoom } from "#api/social/resolveSocialInviteRoom";
import { getEngineCodeFingerprint } from "#api/engine/snapshot/getEngineCodeFingerprint";
import { startProviderSync } from "#api/deckProviders/startProviderSync";
import { digilabProvider } from "#api/deckProviders/providers/digilab";
import { ProviderSnapshotReader } from "#api/deckProviders/ProviderSnapshotReader";
import { ProviderClient } from "#api/deckProviders/ProviderClient";
import { installProviderRoutes } from "#api/deckProviders/installProviderRoutes";
import { installBotRoutes } from "#api/rooms/installBotRoutes";
import { getLiveSearchWorkerPool } from "#api/bot/search/getLiveSearchWorkerPool";
import { startProcessMetricsLog } from "#api/processMetrics/startProcessMetricsLog";
import { installPrivateRoomRoutes } from "./rooms/privateRoomRoutes.js";
import { installSpectatorRoutes } from "./rooms/spectatorRoutes.js";
import { createServer } from "node:http";
import { defineAegisRooms } from "./rooms/defineAegisRooms.js";
import { createGameTransport } from "#api/connections/createGameTransport";
import { installGameRequestBody } from "#api/http/installGameRequestBody";
import { handleGameRequestError } from "#api/http/handleGameRequestError";
import express from "express";
import { ROOM_TYPE, ROOM_TYPE_PRIVATE } from "@aegis/shared";
import { roomRegistry } from "./rooms/AegisRoom.js";
import "./cards/index.js"; // side-effect: registers every implemented card EffectModule
import { log, logError, flushLogs } from "./logger.js";
import { installAccountRoutes } from "./accounts/routes.js";
import { GitHubIssueTracker } from "#api/bugs/GitHubIssueTracker";
import { GitHubDeckReportTracker } from "./community/deckReports.js";
import {
  botSeatingStore,
  deadlineScheduler,
  driveBotMatches,
  eliminationStore,
  participantStore,
  seriesStore,
  swissProgram,
  topCutProgram,
} from "./tournaments/runtime.js";
import { drainForShutdown, startDeadlineWorker, type DeadlineWorker } from "./tournaments/scheduler/index.js";
import { accountStore } from "./accounts/runtime.js";
import { replayLibrary } from "./replays/runtime.js";
import { createDeploymentRuntime, installDeploymentRoutes, type DeploymentSlot } from "./deployment/runtime.js";
import { DeploymentServer } from "./deployment/DeploymentServer.js";
import { isActiveDeploymentSlot, setRoomCreationAdmission } from "./deployment/admission.js";
import { corsOriginForRequest } from "./http/cors.js";
import { mailerFromEnv } from "./email/mailer.js";
import { turnstileVerifier } from "#api/accounts/turnstileVerifier";
import { createClusterRuntime } from "./cluster/runtime.js";
import { setRoomCodeDirectory } from "./rooms/AegisRoom.js";
import { activeMatchRuntime } from "#api/rooms/activeMatch/activeMatchRuntime";
import { createActiveMatchDirectory } from "#api/rooms/activeMatch/createActiveMatchDirectory";
import { createSeriesDirectory, setSeriesDirectory } from "./rooms/series/SeriesDirectory.js";
import {
  BACKFILL_TIMEOUT_MS,
  MANUAL_REFRESH_TIMEOUT_MS,
  backfillDiscordAvatars,
  discordAvatarSourceFromEnvironment,
} from "./accounts/discordAvatars.js";
import { startBotInference, stopBotInference } from "./bot/inferenceRuntime.js";

getEngineCodeFingerprint();

const app = express();
app.use((req, res, next) => {
  const origin = corsOriginForRequest({
    requestOrigin: req.headers.origin,
    configuredOrigin: process.env.AEGIS_WEB_URL ?? "http://localhost:5173",
    production: process.env.NODE_ENV === "production",
  });
  if (origin !== undefined) res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  next();
});
app.options("/{*path}", (_req, res) => res.sendStatus(204));
installGameRequestBody({ app });
// Two proxies sit in front of this container in production (the host's edge Caddy, then the web
// container's Caddy), so the client address is the third entry from the right. Bug reports meter
// anonymous callers by address, which is the proxy's address without this. A deployment with a
// different number of hops sets AEGIS_TRUSTED_PROXY_HOPS; a direct one sets 0.
const trustedProxyHops = Number(process.env.AEGIS_TRUSTED_PROXY_HOPS ?? 2);
app.set("trust proxy", trustedProxyHops);
// The runtime singletons, not fresh instances: `TopCutProgram`'s in-process lock only serializes
// callers that SHARE the instance, and the routes, the resolution listener and the sweep are three
// callers of the same transition.
// The bug and deck report trackers and the mailer are read from the environment here, at the edge,
// so a test can install the routes with its own — or with none at all.
const discordAvatars = discordAvatarSourceFromEnvironment(MANUAL_REFRESH_TIMEOUT_MS);
const discordAvatarBackfill = discordAvatarSourceFromEnvironment(BACKFILL_TIMEOUT_MS);
installAccountRoutes(
  app,
  accountStore,
  participantStore,
  seriesStore,
  swissProgram,
  eliminationStore,
  botSeatingStore,
  topCutProgram,
  undefined,
  GitHubIssueTracker.fromEnvironment(),
  mailerFromEnv(accountStore),
  GitHubDeckReportTracker.fromEnvironment(),
  discordAvatars,
  replayLibrary,
  process.env.TURNSTILE_SECRET_KEY ? turnstileVerifier({ secret: process.env.TURNSTILE_SECRET_KEY }) : undefined,
);
const providerClient = new ProviderClient({
  store: accountStore,
  providerId: digilabProvider.value,
  apiKey: process.env[digilabProvider.keyVariable],
});
installProviderRoutes({
  app,
  client: new ProviderSnapshotReader({ store: accountStore, providerId: digilabProvider.value }),
});
const stopProviderSync = startProviderSync({
  store: accountStore,
  client: providerClient,
  providerId: digilabProvider.value,
  enabled:
    Boolean(process.env[digilabProvider.keyVariable]) &&
    (process.env.AEGIS_PROVIDER_SYNC_ENABLED === "true" ||
      (process.env.NODE_ENV === "production" && process.env.AEGIS_PROVIDER_SYNC_ENABLED !== "false")),
});
const stopRankedMaintenance = startRankedMaintenance({ accounts: accountStore });
if (discordAvatarBackfill) void backfillDiscordAvatars(accountStore, discordAvatarBackfill).catch(() => undefined);
function scheduleReplayCleanup() {
  let cleaning = false;
  const cleanupReplays = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await replayLibrary.cleanup();
      await new DirectMessageStore(accountStore).cleanup();
    } catch (error) {
      logError("[replays] cleanup failed", error);
    } finally {
      cleaning = false;
    }
  };
  setInterval(() => {
    void cleanupReplays();
  }, 15 * 60_000).unref();
  void cleanupReplays();
}
scheduleReplayCleanup();

const cluster = createClusterRuntime();
socialRuntime.service = new SocialService({
  accounts: accountStore,
  presence: cluster.presence,
  resolveRoom: resolveSocialInviteRoom,
});
setRoomCodeDirectory(cluster.roomCodes);
activeMatchRuntime.directory = createActiveMatchDirectory({ presence: cluster.presence, keyPrefix: cluster.keyPrefix });
setSeriesDirectory(createSeriesDirectory(cluster.presence, cluster.keyPrefix));

const configuredSlot = process.env.AEGIS_DEPLOYMENT_SLOT ?? "legacy";
if (!/^(?:blue|red|green|legacy|g-[a-f0-9]{12})$/.test(configuredSlot)) {
  throw new Error(`Invalid AEGIS_DEPLOYMENT_SLOT: ${configuredSlot}`);
}
const deploymentRuntime = createDeploymentRuntime({
  slot: configuredSlot as DeploymentSlot,
  revision: process.env.AEGIS_REVISION ?? "development",
  adminToken: process.env.AEGIS_DEPLOYMENT_ADMIN_TOKEN ?? "",
  acceptingNewRooms: process.env.AEGIS_DEPLOYMENT_START_DRAINING !== "true",
  ...(process.env.AEGIS_DEPLOYMENT_MANIFEST
    ? {
        canAcceptNewRooms: () => isActiveDeploymentSlot(process.env.AEGIS_DEPLOYMENT_MANIFEST!, configuredSlot),
      }
    : {}),
  activeRooms: () => roomRegistry.size,
  connectedClients: () => [...roomRegistry.values()].reduce((total, room) => total + room.clients.length, 0),
  readiness: () => accountStore.healthCheck(),
  broadcastAcceptingNewRooms: cluster.broadcastAcceptingNewRooms,
});
setRoomCreationAdmission(() => deploymentRuntime.allowMatchmaking("create"));
const stopProcessMetricsLog = startProcessMetricsLog({
  readSearchUsage: () => getLiveSearchWorkerPool().readUsage(),
  countRooms: () => {
    const rooms = [...roomRegistry.values()];
    return {
      rooms: rooms.length,
      botRooms: rooms.filter((room) => room.hasBotSeat()).length,
      clients: rooms.reduce((total, room) => total + room.clients.length, 0),
    };
  },
});
cluster.onAcceptingNewRoomsChanged((accepting) => deploymentRuntime.applyAcceptingNewRooms(accepting));
installDeploymentRoutes({ app, runtime: deploymentRuntime });

installBotRoutes(app);

installPrivateRoomRoutes(app);

installSpectatorRoutes(app);

installMatchQueueRoutes({
  app,
  countRankedSearchers: async () =>
    getRankedConfig().enabled ? countRankedSearchers({ accounts: accountStore, slot: configuredSlot }) : [],
});
app.use(handleGameRequestError);

const httpServer = createServer(app);
const gameServer = new DeploymentServer(deploymentRuntime, {
  transport: createGameTransport({ server: httpServer }),
  // Aegis owns SIGTERM/SIGINT below so it can refuse a stop while rooms exist.
  gracefullyShutdown: false,
  trustedProxyHops,
  presence: cluster.presence,
  driver: cluster.driver,
  // Undefined in single-process mode, where Colyseus keeps its own default.
  ...(cluster.publicAddress === undefined ? {} : { publicAddress: cluster.publicAddress }),
});
defineAegisRooms(gameServer);
installQuickMatchPreference({
  accounts: accountStore,
  canCreate: () => deploymentRuntime.allowMatchmaking("joinOrCreate"),
});

/**
 * The deadline worker runs in production by default and nowhere else by default, because a test or
 * a local session that boots the server should not have a background loop applying no-show
 * penalties to whatever happens to be in the database. `TOURNAMENT_SCHEDULER=on|off` overrides
 * either way. Running it on every production instance is intended: rows are leased, so instances
 * take disjoint work, and the commands are idempotent, so an overlap during blue/green applies
 * once regardless.
 */
const ON_VALUES = ["1", "true", "on"];
const OFF_VALUES = ["0", "false", "off"];
const configuredScheduler = (process.env.TOURNAMENT_SCHEDULER ?? "").trim().toLowerCase();
if (configuredScheduler !== "" && ![...ON_VALUES, ...OFF_VALUES].includes(configuredScheduler)) {
  // Refused rather than defaulted, exactly like AEGIS_DEPLOYMENT_SLOT above. Reading an
  // unrecognised value as "off" would let one typo silently disable every no-show, game loss and
  // match-loss deadline in production, and nothing would look wrong until a player complained.
  throw new Error(
    `Invalid TOURNAMENT_SCHEDULER: ${process.env.TOURNAMENT_SCHEDULER} (expected one of ${[...ON_VALUES, ...OFF_VALUES].join(", ")})`,
  );
}
const schedulerEnabled =
  configuredScheduler === "" ? process.env.NODE_ENV === "production" : ON_VALUES.includes(configuredScheduler);

/**
 * Every reconciliation pass the worker runs after the deadlines, chained so one failing does not
 * skip the others.
 *
 * Four of them today, and they answer different questions: `armPendingJoinLadders` asks whether a
 * published match still needs its attendance ladder queued, `sweepOpenTournaments` whether a
 * Swiss round can close, `sweepFrozenSwissPhases` whether a finished Swiss phase is still waiting
 * for its Top Cut, and `driveBotMatches` whether a bot is due in a room. All four are guarantees
 * rather than optimisations — the in-memory notifications that normally trigger them are lost to a
 * crash — so a pass that threw and took its siblings down with it would leave one whole format
 * stalled with nothing in the logs to say which.
 *
 * The Swiss pass runs before the Top Cut pass on purpose: closing the last round is what parks a
 * phase in `frozen`, and running them in this order cuts within the same tick instead of the next.
 */
const syncTournamentDiscord = createTournamentDiscordSweep({
  accounts: accountStore,
  standings: (tournamentId) => swissProgram.standings(tournamentId),
});
const recordTournamentResults = createTournamentResultSweep({
  accounts: accountStore,
  standings: (tournamentId) => swissProgram.standings(tournamentId),
});
const circuitSweep = createTournamentCircuitSweep({
  accounts: accountStore,
  participants: participantStore,
  bots: botSeatingStore,
  elimination: eliminationStore,
  swiss: swissProgram,
});
async function runSweeps(now: number): Promise<number> {
  let total = 0;
  for (const [name, sweep] of [
    ["join_ladders", () => deadlineScheduler.armPendingJoinLadders(now)],
    ["auto_start", () => circuitSweep.start(now)],
    ["swiss", () => swissProgram.sweepOpenTournaments(now)],
    ["top_cut", () => topCutProgram.sweepFrozenSwissPhases(now)],
    ["bracket_rounds", () => eliminationStore.sweepAutomaticRounds(now)],
    ["bots", () => driveBotMatches(now)],
    ["discord", () => syncTournamentDiscord(now)],
    ["results", () => recordTournamentResults(now)],
    ["circuits", () => circuitSweep.maintain(now)],
  ] as const) {
    try {
      total += await sweep();
    } catch (error) {
      logError(`[TOURNAMENT_SWEEP] ${name} pass failed`, error);
    }
  }
  return total;
}
const deadlineWorker: DeadlineWorker | undefined = schedulerEnabled
  ? startDeadlineWorker({
      scheduler: deadlineScheduler,
      sweep: (now) => runSweeps(now),
    })
  : undefined;
log(`[aegis/api] tournament deadline worker ${deadlineWorker ? "started" : "disabled"} (slot ${configuredSlot})`);

const port = Number(process.env.PORT ?? 2567);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  const { activeRooms } = deploymentRuntime.status();
  if (process.env.NODE_ENV === "production" && activeRooms > 0) {
    logError(`[aegis/api] ${signal} refused — ${activeRooms} active room(s) still owned by this slot`);
    return;
  }
  shuttingDown = true;
  stopProviderSync();
  stopRankedMaintenance();
  stopProcessMetricsLog();
  log(`[aegis/api] ${signal} received — shutting down gracefully`);
  // Close the HTTP server immediately so the port is freed before node --watch
  // spawns the next instance, avoiding EADDRINUSE on fast restarts.
  httpServer.close();
  // Worker first, then rooms. The ordering — and why it may not be swapped — lives in
  // `drainForShutdown`, where it is unit-tested; this call site only supplies the two steps.
  void drainForShutdown({
    stopDeadlineWorker: () => deadlineWorker?.stop(),
    shutdownRooms: () => gameServer.gracefullyShutdown(false),
  })
    .finally(() => stopBotInference())
    .then(() => cluster.shutdown())
    .then(() => flushLogs())
    .finally(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// The buffered log stream is flushed before exiting: a crash line written and then dropped by
// an immediate `process.exit` is the one line that always matters.
const exitAfterFlush = () => void Promise.allSettled([stopBotInference(), flushLogs()]).finally(() => process.exit(1));
process.on("uncaughtException", (err) => {
  logError("[aegis/api] uncaught exception:", err);
  exitAfterFlush();
});
process.on("unhandledRejection", (reason) => {
  logError("[aegis/api] unhandled rejection:", reason);
  exitAfterFlush();
});

// Validate configuration and install cleanup handlers before launching an external scorer.
void startBotInference(process.env)
  .then(() => {
    if (!shuttingDown) return gameServer.listen(port);
  })
  .then(() => {
    if (!shuttingDown)
      log(`[aegis/api] Colyseus listening on :${port} (rooms "${ROOM_TYPE}" + "${ROOM_TYPE_PRIVATE}")`);
  })
  .catch(async (err: unknown) => {
    logError("[aegis/api] failed to start:", err);
    await stopBotInference();
    process.exit(1);
  });
