import type { TournamentSpectateTarget } from "@/tournaments/TournamentSpectateTarget";
import { connectRankedMatch } from "@/ranked/connectRankedMatch";
import type { BotSettings } from "@aegis/shared/bot/BotSettings";
import { GameMode } from "@aegis/shared/manual/GameMode";
import { ROOM_TYPE_MANUAL, ROOM_TYPE_MANUAL_PRIVATE, ROOM_TYPE_TOURNAMENT } from "@aegis/shared/protocol/messages";
import { Client, type Room } from "@colyseus/sdk";
import {
  GameState,
  ROOM_TYPE,
  ROOM_TYPE_UNLIMITED,
  ROOM_TYPE_BOT,
  ROOM_TYPE_PRIVATE,
  ROOM_TYPE_RANKED,
  ROOM_TYPE_BETA,
  type Intent,
  type DeckFormat,
  deckFormat,
  formatIsUnlimited,
} from "@aegis/shared";
import {
  deploymentEndpoint,
  loadCurrentDeploymentManifest,
  type DeploymentManifest,
  type DeploymentSlot,
  usesSlotDeploymentRouter,
} from "./deployment";
import type { AegisJoinOptions } from "./types";
import type { LiveMatchPage } from "@aegis/shared/protocol/LiveMatch";
import {
  MATCH_QUEUE_COUNTS_PATH,
  type MatchQueueCount,
  type MatchQueueCounts,
} from "@aegis/shared/matchmaking/MatchQueueCounts";
import { getMatchQueueKey } from "@aegis/shared/matchmaking/getMatchQueueKey";
import { MATCH_QUEUE_WAITING_LIMIT } from "@aegis/shared/matchmaking/MatchQueueWaitingPlayer";
import { sortLiveMatches } from "@aegis/shared/protocol/sortLiveMatches";
import type { ReconnectSession } from "./reconnectSession";
import { hasRoomTicketAccount } from "./roomAccount";
import type { ActiveMatchClaim } from "@aegis/shared/protocol/ActiveMatchClaim";
import type { ResumableMatch } from "@/net/activeMatch/ResumableMatch";
import { requestActiveMatch } from "@/net/activeMatch/requestActiveMatch";
import { requestActiveMatchClaim } from "@/net/activeMatch/requestActiveMatchClaim";

export type AegisRoom = Room<GameState>;
export type RoomSlot = DeploymentSlot | "legacy";

export interface ColyseusClientPort {
  join: (roomName: string, options: AegisJoinOptions) => Promise<AegisRoom>;
  joinOrCreate: (roomName: string, options: AegisJoinOptions) => Promise<AegisRoom>;
  create: (roomName: string, options: AegisJoinOptions & { private?: boolean }) => Promise<AegisRoom>;
  joinById: (roomId: string, options: AegisJoinOptions & { roomCode?: string }) => Promise<AegisRoom>;
  consumeSeatReservation: (reservation: Parameters<Client["consumeSeatReservation"]>[0]) => Promise<AegisRoom>;
  reconnect: (reconnectionToken: string) => Promise<AegisRoom>;
}

interface RouterDependencies {
  loadManifest: () => Promise<DeploymentManifest>;
  endpointForSlot: (slot: DeploymentSlot) => { http: string; websocket: string };
  createClient: (endpoint: string, slot: DeploymentSlot) => ColyseusClientPort;
  fetcher: typeof fetch;
}

const roomSlots = new WeakMap<AegisRoom, RoomSlot>();

function withDeckRules(options: AegisJoinOptions): AegisJoinOptions {
  if (options.format === undefined) return options;
  const format = deckFormat(options.format, options.unlimited);
  return { ...options, format, unlimited: formatIsUnlimited(format) };
}

function publicRoomType(options: AegisJoinOptions): string {
  if (options.tournamentGameId && options.tournamentGameToken) {
    return ROOM_TYPE_TOURNAMENT;
  }
  if (options.gameMode === GameMode.MANUAL.value) {
    return ROOM_TYPE_MANUAL;
  }
  const unlimited = formatIsUnlimited(deckFormat(options.format, options.unlimited));
  if (unlimited && (options.ranked || options.betaBattleMode))
    throw new Error("Unlimited battles cannot be ranked or beta battles");
  if (unlimited) return ROOM_TYPE_UNLIMITED;
  if (options.betaBattleMode && options.ranked) throw new Error("Beta battles cannot be ranked");
  return options.betaBattleMode ? ROOM_TYPE_BETA : options.ranked ? ROOM_TYPE_RANKED : ROOM_TYPE;
}

/** Queues split on both settings, so each is always sent explicitly. */
function withQueueFilters(options: AegisJoinOptions): AegisJoinOptions {
  const format = deckFormat(options.format, options.unlimited);
  return {
    ...options,
    matchTimer: options.matchTimer === true,
    allowRollback: options.allowRollback === true,
    bestOf: options.bestOf === 3 ? 3 : 1,
    format,
    unlimited: formatIsUnlimited(format),
  };
}

export function connectionSlot(room: AegisRoom): RoomSlot {
  return roomSlots.get(room) ?? "legacy";
}

export class AegisConnectionRouter {
  private readonly clients = new Map<DeploymentSlot, ColyseusClientPort>();
  private readonly roomsById = new Map<string, WeakRef<AegisRoom>>();
  private readonly slotByRoomId = new Map<string, DeploymentSlot>();

  constructor(private readonly dependencies: RouterDependencies) {}

  async joinOrCreate(options: AegisJoinOptions, signal?: AbortSignal): Promise<AegisRoom> {
    if (options.ranked) {
      publicRoomType(options);
      const manifest = await this.dependencies.loadManifest();
      const slot = manifest.active.slot;
      const { http } = this.dependencies.endpointForSlot(slot);
      return connectRankedMatch({
        http,
        options,
        signal,
        fetcher: this.dependencies.fetcher,
        joinRoom: async (reservation) => {
          const joined = await this.client(slot).joinById(reservation.roomId!, {
            ...(await this.withRoomTicket(options, slot)),
            rankedPairId: reservation.pairId,
            rankedToken: reservation.token,
          });
          return this.remember(joined, slot);
        },
      });
    }
    return this.joinOrCreateWithFreshManifest(withQueueFilters(options), false);
  }

  private async joinOrCreateWithFreshManifest(
    options: AegisJoinOptions,
    retriedAfterDrain: boolean,
  ): Promise<AegisRoom> {
    const manifest = await this.dependencies.loadManifest();
    const roomName = publicRoomType(options);

    for (const deployment of manifest.draining) {
      const slotOptions = await this.withRoomTicket(options, deployment.slot);
      try {
        const joined = await this.client(deployment.slot).join(roomName, slotOptions);
        return this.remember(joined, deployment.slot);
      } catch {
        // A draining slot may have no compatible waiting room. It is forbidden
        // from creating one, so new matchmaking continues on the active slot.
      }
    }

    const activeOptions = await this.withRoomTicket(options, manifest.active.slot);
    try {
      const joined = await this.client(manifest.active.slot).joinOrCreate(roomName, activeOptions);
      return this.remember(joined, manifest.active.slot);
    } catch (error) {
      if (!retriedAfterDrain && isDrainingResponse(error)) {
        return this.joinOrCreateWithFreshManifest(options, true);
      }
      throw error;
    }
  }

  async createPrivate(options: AegisJoinOptions): Promise<AegisRoom> {
    const manifest = await this.dependencies.loadManifest();
    const created = await this.client(manifest.active.slot).create(
      options.gameMode === GameMode.MANUAL.value ? ROOM_TYPE_MANUAL_PRIVATE : ROOM_TYPE_PRIVATE,
      {
        ...(await this.withRoomTicket(withDeckRules(options), manifest.active.slot)),
        private: true,
      },
    );
    return this.remember(created, manifest.active.slot);
  }

  async createBot(options: AegisJoinOptions): Promise<AegisRoom> {
    return this.createBotWithFreshManifest(withDeckRules(options), false);
  }

  private async createBotWithFreshManifest(options: AegisJoinOptions, retriedAfterDrain: boolean): Promise<AegisRoom> {
    const manifest = await this.dependencies.loadManifest();
    try {
      const created = await this.client(manifest.active.slot).create(
        ROOM_TYPE_BOT,
        await this.withRoomTicket(options, manifest.active.slot),
      );
      return this.remember(created, manifest.active.slot);
    } catch (error) {
      if (!retriedAfterDrain && isDrainingResponse(error)) {
        return this.createBotWithFreshManifest(options, true);
      }
      throw error;
    }
  }

  async joinPrivateByCode(code: string, options: AegisJoinOptions): Promise<AegisRoom> {
    const manifest = await this.dependencies.loadManifest();
    const deployments = [manifest.active, ...manifest.draining];
    for (const { slot } of deployments) {
      const rules = await this.resolveRoomCode(code, slot);
      if (!rules) continue;
      const joined = await this.client(slot).joinById(rules.roomId, {
        ...(await this.withRoomTicket(options, slot)),
        roomCode: code.toUpperCase(),
        unlimited: rules.unlimited,
        format: rules.format,
        ...(rules.gameMode === GameMode.MANUAL.value ? { gameMode: rules.gameMode } : {}),
      });
      return this.remember(joined, slot);
    }
    throw new Error("room not found");
  }

  /** The next game of a series lives in the slot of the game before it, draining or not. */
  async joinSeriesGame(roomId: string, slot: DeploymentSlot, options: AegisJoinOptions): Promise<AegisRoom> {
    return this.remember(await this.client(slot).joinById(roomId, options), slot);
  }

  async spectate(target: SpectateTarget | TournamentSpectateTarget): Promise<AegisRoom> {
    const manifest = await this.dependencies.loadManifest();
    const deployments = [manifest.active, ...manifest.draining];
    for (const { slot } of deployments) {
      const { http } = this.dependencies.endpointForSlot(slot);
      const response = await this.fetch(
        `${http}${spectatePath(target)}`,
        spectatorJoinRequest(
          target,
          (await this.withRoomTicket({ displayName: "", deck: { mainDeck: [], eggDeck: [] } }, slot)).authTicket,
        ),
      );
      if (response.status === 404) continue;
      if (!response.ok) throw new Error("Match is not available to spectators");
      const reservation = await response.json();
      return this.remember(await this.client(slot).consumeSeatReservation(reservation), slot);
    }
    throw new Error("Match is not available to spectators");
  }

  async liveMatches(limit: number): Promise<LiveMatchPage> {
    const manifest = await this.dependencies.loadManifest();
    const deployments = [manifest.active, ...manifest.draining];
    const pages = await Promise.allSettled(
      deployments.map(({ slot }) =>
        fetchLiveMatches(this.dependencies.endpointForSlot(slot).http, limit, this.dependencies.fetcher),
      ),
    );
    const loaded = pages.flatMap((page) => (page.status === "fulfilled" ? [page.value] : []));
    if (loaded.length === 0) throw new Error("Live matches are unavailable");
    return {
      matches: sortLiveMatches(loaded.flatMap((page) => page.matches)).slice(0, limit),
      total: loaded.reduce((total, page) => total + page.total, 0),
    };
  }

  async matchQueueCounts(): Promise<MatchQueueCounts> {
    const manifest = await this.dependencies.loadManifest();
    const deployments = [manifest.active, ...manifest.draining];
    const results = await Promise.allSettled(
      deployments.map(({ slot }) =>
        fetchMatchQueueCounts(this.dependencies.endpointForSlot(slot).http, this.dependencies.fetcher),
      ),
    );
    const loaded = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (loaded.length === 0) throw new Error("Queue counts are unavailable");
    return sumMatchQueueCounts(loaded);
  }

  async reconnect(reconnectionToken: string, slot: DeploymentSlot): Promise<AegisRoom> {
    const reconnected = await this.client(slot).reconnect(reconnectionToken);
    return this.remember(reconnected, slot);
  }

  async findActiveMatch(): Promise<ResumableMatch | undefined> {
    const manifest = await this.dependencies.loadManifest();
    for (const { slot } of [manifest.active, ...manifest.draining]) {
      const { http } = this.dependencies.endpointForSlot(slot);
      const match = await requestActiveMatch({ http, fetcher: this.dependencies.fetcher });
      if (match) return { ...match, slot };
    }
    return undefined;
  }

  async claimActiveMatch(roomId: string, slot: DeploymentSlot): Promise<ActiveMatchClaim | undefined> {
    const { http } = this.dependencies.endpointForSlot(slot);
    return requestActiveMatchClaim({ http, fetcher: this.dependencies.fetcher, roomId });
  }

  async joinWithBot(roomId: string, botDeckId?: string, botSettings?: BotSettings): Promise<void> {
    const room = this.roomsById.get(roomId)?.deref();
    if (!room) throw new Error("Bot join requires a connected room");
    const knownSlot = this.slotByRoomId.get(roomId);
    const slot = knownSlot ?? (await this.dependencies.loadManifest()).active.slot;
    const { http } = this.dependencies.endpointForSlot(slot);
    console.info("[BOT_JOIN_CLIENT] requesting bot", { roomId, slot, botDeckId });
    const response = await this.fetch(`${http}/bot/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, botDeckId, ...botSettings, reconnectionToken: room.reconnectionToken }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Bot join failed (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    console.info("[BOT_JOIN_CLIENT] bot joined", { roomId, slot });
  }

  private client(slot: DeploymentSlot): ColyseusClientPort {
    let client = this.clients.get(slot);
    if (!client) {
      client = this.dependencies.createClient(this.dependencies.endpointForSlot(slot).websocket, slot);
      this.clients.set(slot, client);
    }
    return client;
  }

  private remember(room: AegisRoom, slot: DeploymentSlot): AegisRoom {
    roomSlots.set(room, slot);
    this.slotByRoomId.set(room.roomId, slot);
    this.roomsById.set(room.roomId, new WeakRef(room));
    return room;
  }

  private fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const { fetcher } = this.dependencies;
    return fetcher(input, init);
  }

  /** Every seat a signed-in player takes carries their account, so the match joins their history. */
  private async withRoomTicket(options: AegisJoinOptions, slot: DeploymentSlot): Promise<AegisJoinOptions> {
    if (options.tournamentGameId && options.tournamentGameToken) {
      return { ...options, authTicket: undefined };
    }
    if (!options.ranked && !hasRoomTicketAccount()) return options;
    try {
      const { http } = this.dependencies.endpointForSlot(slot);
      const response = await this.fetch(`${http}/auth/room-ticket`, {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return options;
      const { ticket } = (await response.json()) as { ticket: string };
      return { ...options, authTicket: ticket };
    } catch {
      return options;
    }
  }

  async lookupPrivateRoom(code: string): Promise<PrivateRoomRules> {
    const manifest = await this.dependencies.loadManifest();
    for (const { slot } of [manifest.active, ...manifest.draining]) {
      const rules = await this.resolveRoomCode(code, slot);
      if (rules) return rules;
    }
    throw new Error("room not found");
  }

  private async resolveRoomCode(code: string, slot: DeploymentSlot): Promise<PrivateRoomRules | undefined> {
    const { http } = this.dependencies.endpointForSlot(slot);
    const response = await this.fetch(`${http}/room/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: code.toUpperCase() }),
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Room lookup failed (${response.status})`);
    return privateRoomRules(await response.json());
  }
}

function isDrainingResponse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 503;
}

let productionRouter: AegisConnectionRouter | undefined;
let legacyClient: Client | undefined;

function useProductionRouter(): boolean {
  return usesSlotDeploymentRouter({
    production: import.meta.env.PROD,
    deploymentMode: import.meta.env.VITE_AEGIS_DEPLOYMENT_MODE,
  });
}

function getProductionRouter(): AegisConnectionRouter {
  productionRouter ??= new AegisConnectionRouter({
    loadManifest: () =>
      loadCurrentDeploymentManifest({
        bundleRevision: import.meta.env.VITE_AEGIS_REVISION,
        navigation: window.location,
      }),
    endpointForSlot: (slot) => deploymentEndpoint(window.location, slot),
    createClient: (endpoint) => {
      const client = new Client(endpoint);
      return {
        join: (name, options) => client.join<GameState>(name, options, GameState),
        joinOrCreate: (name, options) => client.joinOrCreate<GameState>(name, options, GameState),
        create: (name, options) => client.create<GameState>(name, options, GameState),
        joinById: (roomId, options) => client.joinById<GameState>(roomId, options, GameState),
        consumeSeatReservation: (reservation) => client.consumeSeatReservation<GameState>(reservation, GameState),
        reconnect: (token) => client.reconnect<GameState>(token, GameState),
      };
    },
    fetcher: fetch,
  });
  return productionRouter;
}

function legacyEndpoint(): string {
  return import.meta.env.VITE_AEGIS_API_URL ?? `ws://${window.location.hostname}:2567`;
}

function getLegacyClient(): Client {
  legacyClient ??= new Client(legacyEndpoint());
  return legacyClient;
}

const legacyRoomsById = new Map<string, WeakRef<AegisRoom>>();

function rememberLegacy(room: AegisRoom): AegisRoom {
  roomSlots.set(room, "legacy");
  legacyRoomsById.set(room.roomId, new WeakRef(room));
  return room;
}

/** Join an existing public/ranked match or create one on the active deployment. */
export async function joinOrCreate(options: AegisJoinOptions, signal?: AbortSignal): Promise<AegisRoom> {
  if (useProductionRouter()) return getProductionRouter().joinOrCreate(options, signal);
  if (options.ranked) {
    publicRoomType(options);
    const http = legacyEndpoint().replace(/^ws/, "http");
    return connectRankedMatch({
      http,
      options,
      signal,
      joinRoom: async (reservation) => {
        const joined = await getLegacyClient().joinById<GameState>(reservation.roomId!, {
          ...(await withLegacyRoomTicket(options)),
          rankedPairId: reservation.pairId,
          rankedToken: reservation.token,
        });
        return rememberLegacy(joined);
      },
    });
  }
  const authenticatedOptions = await withLegacyRoomTicket(withQueueFilters(options));
  const joined = await getLegacyClient().joinOrCreate<GameState>(publicRoomType(options), authenticatedOptions);
  return rememberLegacy(joined);
}

/** Take this player's seat in the next game of their series, in the slot that runs it. */
export async function joinSeriesGame(roomId: string, slot: RoomSlot, options: AegisJoinOptions): Promise<AegisRoom> {
  if (slot !== "legacy") return getProductionRouter().joinSeriesGame(roomId, slot, options);
  return rememberLegacy(await getLegacyClient().joinById<GameState>(roomId, options));
}

/** Re-establish a dropped room through the slot that still owns it. */
export async function reconnect(reconnectionToken: string, slot: RoomSlot): Promise<AegisRoom> {
  if (slot !== "legacy") return getProductionRouter().reconnect(reconnectionToken, slot);
  return rememberLegacy(await getLegacyClient().reconnect<GameState>(reconnectionToken));
}

/** Resume a persisted seat using the owner directory only when the manifest opts in. */
export async function resumeReconnectSession(session: ReconnectSession): Promise<AegisRoom> {
  if (session.slot === "legacy") {
    return rememberLegacy(await getLegacyClient().reconnect<GameState>(session.reconnectionToken));
  }
  return getProductionRouter().reconnect(session.reconnectionToken, session.slot);
}

export async function findActiveMatch(): Promise<ResumableMatch | undefined> {
  if (useProductionRouter()) return getProductionRouter().findActiveMatch();
  const match = await requestActiveMatch({ http: legacyEndpoint().replace(/^ws/, "http"), fetcher: fetch });
  return match && { ...match, slot: "legacy" };
}

export async function claimActiveMatch(match: ResumableMatch): Promise<ReconnectSession | undefined> {
  const claim =
    match.slot === "legacy"
      ? await requestActiveMatchClaim({
          http: legacyEndpoint().replace(/^ws/, "http"),
          fetcher: fetch,
          roomId: match.roomId,
        })
      : await getProductionRouter().claimActiveMatch(match.roomId, match.slot);
  if (!claim) return undefined;
  return { reconnectionToken: claim.reconnectionToken, roomId: claim.roomId, slot: match.slot, savedAt: Date.now() };
}

/** Ask the owning server to seat a bot as the second player. */
export async function joinWithBot(roomId: string, botDeckId?: string, botSettings?: BotSettings): Promise<void> {
  if (useProductionRouter()) return getProductionRouter().joinWithBot(roomId, botDeckId, botSettings);
  const room = legacyRoomsById.get(roomId)?.deref();
  if (!room) throw new Error("Bot join requires a connected room");
  const response = await fetch(`${legacyEndpoint().replace(/^ws/, "http")}/bot/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, botDeckId, ...botSettings, reconnectionToken: room.reconnectionToken }),
  });
  if (!response.ok) throw new Error(`Bot join failed (${response.status})`);
}

/** Create an isolated one-human room for a match against the server bot. */
export async function createBot(options: AegisJoinOptions): Promise<AegisRoom> {
  if (useProductionRouter()) return getProductionRouter().createBot(options);
  const created = await getLegacyClient().create<GameState>(
    ROOM_TYPE_BOT,
    await withLegacyRoomTicket(withDeckRules(options)),
  );
  return rememberLegacy(created);
}

/** Create a private room on the active deployment. */
export async function createPrivate(options: AegisJoinOptions): Promise<AegisRoom> {
  if (useProductionRouter()) return getProductionRouter().createPrivate(options);
  const created = await getLegacyClient().create<GameState>(
    options.gameMode === GameMode.MANUAL.value ? ROOM_TYPE_MANUAL_PRIVATE : ROOM_TYPE_PRIVATE,
    {
      ...(await withLegacyRoomTicket(withDeckRules(options))),
      private: true,
    },
  );
  return rememberLegacy(created);
}

export interface PrivateRoomRules {
  gameMode?: GameMode;
  roomId: string;
  unlimited: boolean;
  format: DeckFormat;
}

function privateRoomRules(value: {
  roomId: string;
  unlimited?: boolean;
  format?: DeckFormat;
  gameMode?: GameMode;
}): PrivateRoomRules {
  return {
    roomId: value.roomId,
    ...(value.gameMode === GameMode.MANUAL.value ? { gameMode: GameMode.MANUAL.value } : {}),
    unlimited: value.unlimited === true,
    format: deckFormat(value.format, value.unlimited),
  };
}

/** Inspect the host's rules before choosing a guest deck. */
export async function lookupPrivateRoom(code: string): Promise<PrivateRoomRules> {
  if (useProductionRouter()) return getProductionRouter().lookupPrivateRoom(code);
  const response = await fetch(`${legacyEndpoint().replace(/^ws/, "http")}/room/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: code.toUpperCase() }),
  });
  if (!response.ok) throw new Error("room not found");
  return privateRoomRules(await response.json());
}

/** Resolve and join a private room on either the active or draining deployment. */
export async function joinPrivateByCode(code: string, options: AegisJoinOptions): Promise<AegisRoom> {
  if (useProductionRouter()) return getProductionRouter().joinPrivateByCode(code, options);
  const httpBase = legacyEndpoint().replace(/^ws/, "http");
  const response = await fetch(`${httpBase}/room/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: code.toUpperCase() }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "room not found");
  }
  const rules = privateRoomRules(await response.json());
  const { roomId } = rules;
  const joined = await getLegacyClient().joinById<GameState>(roomId, {
    ...(await withLegacyRoomTicket(options)),
    roomCode: code.toUpperCase(),
    unlimited: rules.unlimited,
    format: rules.format,
    ...(rules.gameMode === GameMode.MANUAL.value ? { gameMode: rules.gameMode } : {}),
  });
  return rememberLegacy(joined);
}

async function withLegacyRoomTicket(options: AegisJoinOptions): Promise<AegisJoinOptions> {
  if (options.tournamentGameId && options.tournamentGameToken) {
    return { ...options, authTicket: undefined };
  }
  if (!options.ranked && !hasRoomTicketAccount()) return options;
  try {
    const response = await fetch(`${legacyEndpoint().replace(/^ws/, "http")}/auth/room-ticket`, {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return options;
    const { ticket } = (await response.json()) as { ticket: string };
    return { ...options, authTicket: ticket };
  } catch {
    return options;
  }
}

/** Intents queued while disconnected are replayed after a successful reconnect. */
const pendingIntents: { type: string; payload: Record<string, unknown> }[] = [];

export function sendIntent(room: AegisRoom, intent: Intent): void {
  const { type, ...fields } = intent;
  const payload = { ...fields, rollbackRevision: room.state.rollbackRevision ?? 0 };
  if (room.connection?.isOpen) room.send(type, payload);
  else pendingIntents.push({ type, payload });
}

export function flushIntents(room: AegisRoom): void {
  const queued = pendingIntents.splice(0);
  for (const { type, payload } of queued) {
    if (room.connection?.isOpen) room.send(type, payload);
    else pendingIntents.push({ type, payload });
  }
}

export function clearPendingIntents(): void {
  pendingIntents.length = 0;
}

/** `displayName` only labels the spectator's chat messages; the server cleans it up. */
export interface SpectateTarget {
  accountId?: string;
  roomCode: string;
  displayName?: string;
}

function spectatePath(target: SpectateTarget | TournamentSpectateTarget): string {
  if ("tournamentId" in target) return "/spectate/tournament";
  return target.accountId ? "/spectate/friend" : "/spectate/join";
}

function spectatorJoinRequest(target: SpectateTarget | TournamentSpectateTarget, authTicket?: string): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, ...(authTicket ? { authTicket } : {}) }),
  };
}

async function fetchLiveMatches(http: string, limit: number, fetcher: typeof fetch): Promise<LiveMatchPage> {
  const response = await fetcher(`${http}/spectate/live?limit=${limit}`);
  if (!response.ok) throw new Error("Live matches are unavailable");
  return (await response.json()) as LiveMatchPage;
}

async function fetchMatchQueueCounts(http: string, fetcher: typeof fetch): Promise<MatchQueueCounts> {
  const response = await fetcher(`${http}${MATCH_QUEUE_COUNTS_PATH}`);
  if (!response.ok) throw new Error("Queue counts are unavailable");
  const counts = (await response.json()) as Partial<MatchQueueCounts>;
  return { buckets: counts.buckets ?? [], waiting: counts.waiting ?? [] };
}

function sumMatchQueueCounts(slots: MatchQueueCounts[]): MatchQueueCounts {
  const buckets = new Map<string, MatchQueueCount>();
  for (const bucket of slots.flatMap((slot) => slot.buckets)) {
    const key = getMatchQueueKey(bucket);
    const existing = buckets.get(key);
    buckets.set(key, existing ? { ...existing, searching: existing.searching + bucket.searching } : bucket);
  }
  const waiting = slots
    .flatMap((slot) => slot.waiting)
    .sort((first, second) => second.waitingSeconds - first.waitingSeconds)
    .slice(0, MATCH_QUEUE_WAITING_LIMIT);
  return { buckets: [...buckets.values()], waiting };
}

export async function matchQueueCounts(): Promise<MatchQueueCounts> {
  if (useProductionRouter()) return getProductionRouter().matchQueueCounts();
  return fetchMatchQueueCounts(legacyEndpoint().replace(/^ws/, "http"), fetch);
}

export async function liveMatches(limit: number): Promise<LiveMatchPage> {
  if (useProductionRouter()) return getProductionRouter().liveMatches(limit);
  return fetchLiveMatches(legacyEndpoint().replace(/^ws/, "http"), limit, fetch);
}

export async function spectate(target: SpectateTarget | TournamentSpectateTarget): Promise<AegisRoom> {
  if (useProductionRouter()) return getProductionRouter().spectate(target);
  const response = await fetch(
    `${legacyEndpoint().replace(/^ws/, "http")}${spectatePath(target)}`,
    spectatorJoinRequest(
      target,
      (await withLegacyRoomTicket({ displayName: "", deck: { mainDeck: [], eggDeck: [] } })).authTicket,
    ),
  );
  if (!response.ok) throw new Error("Match is not available to spectators");
  return rememberLegacy(await getLegacyClient().consumeSeatReservation<GameState>(await response.json(), GameState));
}
