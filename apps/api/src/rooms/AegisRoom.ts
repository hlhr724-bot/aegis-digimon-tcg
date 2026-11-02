import { getLiveMatchPlayerPreview } from "#api/rooms/getLiveMatchPlayerPreview";
import { RankedRewardStore } from "#api/ranked/RankedRewardStore";
import type { RankedTier } from "@aegis/shared/ranked/RankedTier";
import { claimAccountRoom } from "#api/ranked/claimAccountRoom";
import { RankedStore } from "#api/ranked/RankedStore";
import { RankedRoundClock } from "#api/ranked/RankedRoundClock";
import { getRankedConfig } from "#api/ranked/getRankedConfig";
import { buildReplayDecks } from "#api/replays/buildReplayDecks";
import { QuickMatchPreference } from "#api/rooms/QuickMatchPreference";
import { buildDeckCompositionKey } from "#api/accounts/buildDeckCompositionKey";
import { SPECTATOR_ACCESS_REVOKED_CLOSE_CODE } from "@aegis/shared/protocol/spectatorAccessRevokedCloseCode";
import { SEAT_TRANSFERRED_CLOSE_CODE } from "@aegis/shared/protocol/seatTransferredCloseCode";
import type { ActiveMatch } from "@aegis/shared/protocol/ActiveMatch";
import type { ActiveMatchClaim } from "@aegis/shared/protocol/ActiveMatchClaim";
import type { ActiveMatchDirectory } from "#api/rooms/activeMatch/ActiveMatchDirectory";
import { activeMatchRuntime } from "#api/rooms/activeMatch/activeMatchRuntime";
import type { SocialEvent } from "@aegis/shared/protocol/social";
import { SPECTATOR_REPLAY_SEAT } from "@aegis/shared/replays/spectatorReplaySeat";
import { canSpectatePlayers } from "#api/social/canSpectatePlayers";
import { SpectatorAccess } from "@aegis/shared/account/SpectatorAccess";
import { socialRuntime } from "#api/social/socialRuntime";
import { SocialStatus } from "@aegis/shared/social/SocialStatus";
import { getStoryBattleDifficulty } from "@aegis/shared/story/getStoryBattleDifficulty";
import { resolveBotProfile } from "#api/bot/profiles";
import { BotDifficulty } from "@aegis/shared/bot/BotDifficulty";
import type { BotStyle } from "@aegis/shared/bot/BotStyle";
import { isBotDifficulty } from "@aegis/shared/bot/isBotDifficulty";
import { isBotStyle } from "@aegis/shared/bot/isBotStyle";
import { createLevelBotOptions } from "#api/bot/levels/createLevelBotOptions";
import { defaultStyleForDeck } from "#api/bot/levels/defaultStyleForDeck";
import { GameMode } from "@aegis/shared/manual/GameMode";

import { getStoryGuestHash } from "#api/story/getStoryGuestHash";
import { shuffleStoryDecks } from "#api/story/shuffleStoryDecks";
import { findSoloBattle } from "#api/story/findSoloBattle";
import { getStoryBotPersona } from "#api/story/getStoryBotPersona";
import { getBotLine } from "#api/bot/lines/getBotLine";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { StoryDifficulty } from "@aegis/shared/story/StoryDifficulty";
import type { SoloBattle } from "#api/story/SoloBattle";
import { StoryProgressStore } from "#api/story/StoryProgressStore";
import { getStorySeatDeck } from "#api/story/getStorySeatDeck";
import { getTournamentGameRules } from "#api/tournaments/lifecycle/getTournamentGameRules";
import { canSpectateTournament } from "#api/tournaments/spectators/canSpectateTournament";
import { TournamentSpectatorStore } from "#api/tournaments/spectators/TournamentSpectatorStore";
import type { AccountPreferences } from "#api/accounts/AccountStore";
import { RollbackHistory } from "#api/rooms/RollbackHistory";
import { RollbackKind, ROLLBACK_CHANNEL, ROLLBACK_RESET_CHANNEL } from "@aegis/shared/protocol/RollbackKind";
import { LIVE_MATCH_SPECTATOR_LIMIT, type LiveMatch } from "@aegis/shared/protocol/LiveMatch";
import type { GameEngineHooks } from "#api/engine/gameEngine/types";
import type { ReplayInput } from "#api/replays/inputs/types";

import { OPPONENT_DECK_CHANNEL } from "@aegis/shared/decks/OPPONENT_DECK_CHANNEL";
import { USED_DECK_CHANNEL, type UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { validateDecklist } from "../engine/deckValidation.js";
import { log, logError, withMatchLog } from "../logger.js";
import { CloseCode, Room, Client, ServerError, matchMaker, type Delayed } from "colyseus";
import { canCreateRoom } from "../deployment/admission.js";
import { tokenBucketLimiter, type TokenBucketOptions } from "../http/rateLimit.js";
import { getRoomRandomness } from "#api/rooms/getRoomRandomness";
import { randomBytes, randomUUID } from "node:crypto";
import { ReplayRecording } from "../replays/recording.js";
import { replayDownload } from "../replays/download.js";
import { replayLibrary } from "../replays/runtime.js";
import type { ReplayLibrary } from "../replays/ReplayLibrary.js";
import {
  GameState,
  MATCH_EXPIRED_CLOSE_CODE,
  MESSAGE_FLOOD_CLOSE_CODE,
  REPLAY_CHANNEL,
  type ReplaySummary,
  type ReplayDownloadMessage,
  RECONNECT_GRACE_SECONDS,
  combatWindowKey,
  type CombatWindow,
  type Intent,
  type DecisionRequest,
  type Seat,
  type ServerEvent,
  type SequencedServerEvent,
  EVENT_CHANNEL,
  DECISION_CHANNEL,
  PRESENTATION_CHANNEL,
  ANIMATION_SPEED_CHANNEL,
  DEFAULT_EFFECT_SPEED,
  eventAnimationMs,
  isEffectSpeed,
  type EffectSpeed,
  CHAT_CHANNEL,
  CHAT_COOLDOWN_MS,
  parseChatMessage,
  normalizeChatText,
  SPECTATOR_NAME_MAX_LENGTH,
  type ChatBroadcast,
  type ChatMessage,
  type ChatSender,
  SERIES_CHANNEL,
  matchBestOf,
  type MatchBestOf,
  type DeckFormat,
  deckFormat,
  isDeckFormat,
  formatIsUnlimited,
  isDigimonWorldAvatarId,
  MATCH_TIMER_START_SECONDS,
} from "@aegis/shared";
import { getLocalScenario, isLocalScenarioEntry, type LocalScenarioEntry } from "../engine/scenario/local.js";
import { bindScenarioDecks, type ScenarioFixture } from "../engine/scenario/fixture.js";
import { createFixtureBotPolicy } from "../engine/scenario/botPolicy.js";
import { GameEngine, type SeatJoinOptions } from "../engine/GameEngine.js";
import { finalRevealOf, type VisibilityPort } from "../engine/state/index.js";
import { BotPlayer, type BotOptions } from "../bot/BotPlayer.js";
import { botPersonaForDeck } from "@aegis/shared/bot/personas/botPersonaForDeck";
import { trainedBotOptions } from "../bot/inferenceRuntime.js";
import { evolvedBotOptions } from "../bot/evolution/livePolicy.js";
import { getActiveBotExperiment } from "#api/bot/experiment/activeBotExperiment";
import { assignBotArm } from "#api/bot/experiment/assignBotArm";
import type { BotExperimentRecord } from "#api/bot/experiment/BotExperimentRecord";
import { createBotArmOptions } from "#api/bot/experiment/createBotArmOptions";
import type { DefaultBotDeck } from "#api/bot/defaultBotProgram";
import { playableBotDeck } from "../engine/botDeck.js";
import { accountStore } from "../accounts/runtime.js";
import type { AccountStore, DeckSnapshot, Tournament } from "#api/accounts/AccountStore";
import { seriesStore } from "../tournaments/runtime.js";
import type { SeriesStore } from "../tournaments/series/index.js";
import { createLocalRoomCodeDirectory, type RoomCodeDirectory } from "../cluster/roomCodes.js";
import { MatchClock, type ClockMode } from "./MatchClock.js";
import {
  CasualSeries,
  type RematchOpening,
  type SeriesContinuationOptions,
  type SeriesRoomPort,
  type SeriesSeatDeck,
} from "./series/CasualSeries.js";
import type { SeriesDeckChoice } from "@aegis/shared/protocol/series";
import type { SeriesRecord } from "./series/SeriesDirectory.js";
import { RematchOffer } from "#api/rooms/series/RematchOffer";
import { GuestApprovalGate } from "#api/rooms/guestApproval/GuestApprovalGate";
import { GUEST_APPROVAL_CHANNEL } from "@aegis/shared/protocol/GuestApprovalMessage";
import { GUEST_DECLINED_CLOSE_CODE, HOST_LEFT_CLOSE_CODE } from "@aegis/shared/protocol/closeCodes";
import { REMATCH_BEST_OF } from "@aegis/shared/protocol/RematchStatus";
import { parsePresentationReport } from "./presentationReport.js";
import { CONNECTION_REPORT_CHANNEL } from "@aegis/shared/protocol/ConnectionReport";
import { ConnectionDropOutcome, type ResolvedConnectionDropOutcome } from "#api/connections/ConnectionDropOutcome";
import type { ConnectionDropStore } from "#api/connections/ConnectionDropStore";
import { connectionDropStore } from "#api/connections/runtime";
import { parseConnectionReport } from "#api/connections/parseConnectionReport";
import { hasBlockedWord, maskBlockedWords } from "../moderation/blockedWords.js";
import type {
  ReplayDeck,
  ReplayDeckRules,
  ReplayHeaderLine,
  ReplayInputLine,
  ReplayRoomInput,
  ReplaySeatLine,
  ReplaySite,
} from "../replays/inputs/types.js";

/** Hand-laid boards must never be reachable by a real player. */
const DEV_SCENARIOS_ENABLED = process.env.NODE_ENV !== "production";
/**
 * A real client sends a few messages per second, with bursts when it catches up on presentation
 * reports. The budget is several times that, so only a flooding client hits it. Its excess messages
 * are dropped before they reach the engine, and a client that keeps flooding is disconnected.
 */
const CLIENT_MESSAGE_RATE_LIMIT: TokenBucketOptions = { capacity: 120, refillMs: 25 };
const CLIENT_DROPPED_MESSAGE_LIMIT: TokenBucketOptions = { capacity: 400, refillMs: 1_000 };

/**
 * A draining deployment keeps its processes, and their CPU and memory, until its last room closes,
 * and an abandoned tab used to hold a room open for days. A match therefore ends after this long
 * without a player action, and a match on a draining deployment ends this long after draining began.
 */
export const MATCH_INACTIVITY_LIMIT_MS = 15 * 60_000;
export const DRAINING_MATCH_LIMIT_MS = 60 * 60_000;
export const FINISHED_MATCH_LIMIT_MS = 10 * 60_000;
const MATCH_LIMIT_CHECK_MS = 60_000;
const WAITING_ROOM_TIMEOUT_SECONDS = positiveSeconds(process.env.AEGIS_WAITING_ROOM_TIMEOUT_SECONDS, 30 * 60);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function generateRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[bytes[i]! % CODE_CHARS.length]!;
  }
  return code;
}

interface RoomCreateOptions extends Partial<SeriesContinuationOptions> {
  rankedPairId?: string;
  allowRollback?: boolean;
  matchTimer?: boolean;
  bestOf?: unknown;
  timerStartSeconds?: number;
  timerRefillSeconds?: number;
  seed?: number;
  private?: boolean;
  requireApproval?: boolean;
  /** Reopens a private room under the code of the one that just finished. */
  roomCode?: unknown;
  botRoom?: boolean;
  rankedRoom?: boolean;
  manualRoom?: boolean;
  betaBattleRoom?: boolean;
  unlimitedRoom?: boolean;
  /** Only the registered bot/private handlers grant this capability. */
  allowUnlimitedSelection?: boolean;
  unlimited?: boolean;
  format?: DeckFormat;
  allowFormatSelection?: boolean;
  tournamentRoom?: boolean;
  tournamentGameId?: string;
  devScenario?: unknown;
  storyBattleId?: unknown;
}

function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && value.length === 6 && [...value].every((char) => CODE_CHARS.includes(char));
}

function positiveSeconds(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Rebuild the opening event of a mirrored combat window, so a client that was offline when the
 * original broadcast went out (Colyseus never redelivers a channel message to a socket that was
 * down) receives it on reconnect — the combat counterpart of the resent `pendingDecision`.
 */
function combatWindowEvent(window: CombatWindow): ServerEvent | undefined {
  switch (window.kind) {
    case "block":
      return {
        kind: "blockWindowOpened",
        attackerPermanentId: window.attackerPermanentId,
        eligibleBlockerIds: [...window.eligiblePermanentIds],
        ...(window.mustBlock ? { mustBlock: true } : {}),
      };
    case "counter":
      return {
        kind: "counterWindowOpened",
        attackerPermanentId: window.attackerPermanentId,
        defendingSeat: window.seat,
        eligibleCounters: JSON.parse(window.eligibleCountersJson || "[]") as {
          instanceId: string;
          effectKey: string;
          description: string;
        }[],
      };
    case "alliance":
      return {
        kind: "alliancePrompt",
        permanentId: window.permanentId,
        eligibleAllyIds: [...window.eligiblePermanentIds],
      };
    case "evade":
      return { kind: "evadePrompt", permanentId: window.permanentId };
    case "barrier":
      return { kind: "barrierPrompt", permanentId: window.permanentId };
    default:
      return undefined;
  }
}

/**
 * Join payload a client supplies via client.joinOrCreate(ROOM_TYPE, options). Extends the
 * engine-owned {@link SeatJoinOptions} (displayName + deck) with the transport-only private
 * room code, which the engine's seatPlayer has no use for.
 *
 * A tournament room is entered by one of two flows, told apart by which options are present:
 *
 *  - PROGRAM flow — `tournamentGameId` + `tournamentGameToken`. The token is a Tournament Game
 *    authorization issued by the series module to one participant. It carries the identity, so
 *    this flow needs no `authTicket` and never touches `room_tickets` or the legacy bracket.
 *  - LEGACY flow — `authTicket` + `tournamentMatchId`, the pre-program single-elimination path
 *    where `POST /tournaments/:id/matches/:matchId/ticket` mints a room ticket that names a match.
 *
 * The program options win when both are supplied. The legacy flow is untouched so existing
 * brackets keep running until the manager takes them over.
 */
export interface AegisJoinOptions extends SeatJoinOptions {
  rankedPairId?: string;
  rankedToken?: string;
  gameMode?: GameMode;
  storyBattleId?: string;
  storyGuestToken?: string;
  allowRollback?: boolean;
  spectator?: boolean;
  botDeck?: SeatJoinOptions["deck"];
  matchTimer?: boolean;
  timerStartSeconds?: number;
  timerRefillSeconds?: number;
  bestOf?: MatchBestOf;
  /** A later game of a casual best-of-three: the seat token the series handed this seat. */
  seriesToken?: string;
  deckId?: string;
  deckName?: string;
  community?: import("@aegis/shared/decks/UsedDeck").UsedDeck["community"];
  roomCode?: string; // for joining a private room by code
  ranked?: boolean;
  authTicket?: string;
  tournamentMatchId?: string;
  tournamentGameId?: string;
  tournamentGameToken?: string;
  /**
   * How the client paces a chain of triggered effects. `sequential` plays them one at a time
   * at the viewer's Effect speed, so a bot opponent need not space them out itself.
   */
  presentationPacing?: "current" | "sequential";
}

/**
 * Who a validated join belongs to, and the exclusive claim to take once every other check passes.
 * `commit` returning false is a rejection like any other.
 */
type JoinIdentity = {
  account: { id: string; displayName: string; avatarUrl?: string | null } | undefined;
  commit: () => Promise<boolean>;
};

/**
 * Registry of all live AegisRoom instances, keyed by roomId. Used by the HTTP
 * bot endpoint to look up rooms without going through the Colyseus matchmaker.
 */
export const roomRegistry = new Map<string, AegisRoom>();

/**
 * Where private room codes are resolved to Colyseus room ids.
 *
 * Injected rather than fixed, because the answer depends on the deployment: one process resolves
 * from its own memory, while a cluster has to resolve a code claimed by a sibling. Defaults to
 * the local directory so nothing has to configure anything to run a single process.
 */
let roomCodes: RoomCodeDirectory = createLocalRoomCodeDirectory();

/** Point every room at a shared code directory (called once, at boot). */
export function setRoomCodeDirectory(directory: RoomCodeDirectory): void {
  roomCodes = directory;
}

/** The directory in force, for callers that resolve codes outside a room. */
export function roomCodeDirectory(): RoomCodeDirectory {
  return roomCodes;
}

/**
 * A batch being filled. `recipient` is set for a batch that belongs to one client only
 * (a rejection), which is never broadcast and never bumps the shared state revision.
 */
interface OpenBatch {
  id: string;
  emitted: number;
  lastSeq: number;
  recipient?: Client;
  events: SequencedServerEvent[];
  /** How long each seat's screen spends on the events, at that seat's Effect speed. */
  presentationMs: [number, number];
}

type ConnectionDropParams = {
  seat: Seat;
  accountId: string | undefined;
  closeCode: number | undefined;
};

type ReconnectDeadline = { expiresAt: number; timer: Delayed; expire: () => void };

type HeldReconnection = { tokens: string[]; deadline: ReconnectDeadline };

type PendingSeatTransfer = { promise: Promise<string | undefined>; resolve: (token: string | undefined) => void };

const SEAT_TRANSFER_TIMEOUT_MS = 5_000;

/**
 * The one and only room class (REQUIRED name "AegisRoom"), registered as room
 * type "aegis" in src/index.ts. It is a thin transport adapter: it seats players,
 * forwards intents to the GameEngine, relays decision requests, and broadcasts the
 * event log. All rules live in the engine (API-CONTRACT.md section 1).
 */
const TOURNAMENT_BOT_ROOM_IDLE_MS = 30 * 60_000;

export class AegisRoom extends Room<{
  state: GameState;
  metadata: { unlimited: boolean; format: DeckFormat; gameMode?: GameMode; live?: LiveMatch };
}> {
  override maxClients = 2;
  private engine!: GameEngine;
  private spectatorClients = new Set<string>();
  private spectatorIdentities = new Map<string, { id: string; displayName: string }>();
  private spectatorPrivacyReady = false;
  private seatByClient = new Map<string, Seat>(); // sessionId -> seat
  /** Each seat's Effect speed, which sets how long the seat's clock waits for a batch to play. */
  private animationSpeed: [EffectSpeed, EffectSpeed] = [DEFAULT_EFFECT_SPEED, DEFAULT_EFFECT_SPEED];
  private presentationLogWindows = new Map<Seat, { start: number; count: number }>();
  /** Keyed by `seat:<n>` for players and by session id for spectators. */
  private lastChatAtBySender = new Map<string, number>();
  private spokenBotLines = new Set<string>();
  /** The number in each spectator's chat name, given the first time that spectator writes. */
  private spectatorNumbers = new Map<string, number>();
  private spectatorsNumbered = 0;
  /** The raw name each spectator joined with; `spectatorChatName` decides whether to show it. */
  private spectatorJoinNames = new Map<string, string>();
  private accountByClient = new Map<string, string>();
  private equippedRankedTierByClient = new Map<string, RankedTier>();
  private rollbackHistory?: RollbackHistory;
  private engineHooks!: GameEngineHooks;
  private engineGeneration = 0;
  private rollbackSequence = 0;
  private rollbackPending?: { id: string; seat: Seat; target: { index: number; turn?: number } };
  private replayRecording?: ReplayRecording;
  private readonly spectatorReplayDownloads = new Map<string, Promise<ReplayDownloadMessage>>();
  private replayDownloads = new Map<Seat, Promise<ReplayDownloadMessage>>();
  private replayFinished = false;
  private replayRequestTimes = new WeakMap<Client, number>();
  private reportableDropBySeat = new Map<Seat, Promise<number | undefined>>();
  private readonly allowClientMessage = tokenBucketLimiter(CLIENT_MESSAGE_RATE_LIMIT);
  private readonly allowDroppedClientMessage = tokenBucketLimiter(CLIENT_DROPPED_MESSAGE_LIMIT);
  /** Index entries per `seat:account`, so repeated replay requests write the row once. */
  private replayIndexes = new Map<string, Promise<string | undefined>>();
  private rankedByClient = new Map<string, boolean>();
  /** Clients that pace chains of triggered effects themselves (`presentationPacing: "sequential"`). */
  private chainPacingClients = new Set<string>();
  private deckStartedAtBySeat = new Map<Seat, number>();
  private livePreferredCardBySeat = new Map<Seat, string>();
  private liveAvatarUrlByClient = new Map<string, string>();
  private initialDeckBySeat = new Map<Seat, UsedDeck>();
  private readonly spectatorPrivacySubscriptions = new Map<string, (event: SocialEvent) => void>();
  private deckOwnerBySeat = new Map<Seat, string>();
  private opponentDeckRequestTimes = new WeakMap<Client, number>();
  private deckByClient = new Map<string, UsedDeck>();
  /**
   * Every StateView this room handed out, disposed with the room. @colyseus/schema's GC
   * backstop for undisposed views holds the state Root strongly, and the Root reaches this
   * room through the visibility port, so an undisposed view keeps the whole match alive.
   */
  private issuedViews = new Set<NonNullable<Client["view"]>>();
  /**
   * Bot drivers by seat. An array rather than one field because a tournament confrontation between
   * two bots has to run with nobody connected at all, so both seats can be driven at once.
   */
  private bots: (BotPlayer | undefined)[] = [undefined, undefined];
  private botLevelSettings: ({ difficulty: BotDifficulty; style: BotStyle } | undefined)[] = [undefined, undefined];
  private botExperimentRecord: BotExperimentRecord | undefined;
  /**
   * Which participant each tournament seat belongs to, recorded when the seat's authorization is
   * redeemed. A bot seat has no client and therefore no `accountByClient` entry, so this is the
   * only way the room can say who won.
   */
  private tournamentSeatHolders: ({ accountId: string } | { participantId: string } | undefined)[] = [
    undefined,
    undefined,
  ];
  private isBotRoom = false;
  private devScenario: LocalScenarioEntry | undefined;
  private scenarioFixture: ScenarioFixture | undefined;
  private storyBattleId: string | undefined;
  private soloBattle: SoloBattle | undefined;
  private storyAccountId: string | undefined;
  private storyGuestHash: string | undefined;
  private readonly BOT_SEAT = 1 as Seat;
  private isPrivate = false;
  private guestApproval: GuestApprovalGate | undefined;
  private isRankedRoom = false;
  private isBetaBattleRoom = false;
  private isUnlimitedRoom = false;
  private customBotDeck?: SeatJoinOptions["deck"];
  private isTournamentRoom = false;
  private tournamentMatchId: string | undefined;
  private tournamentGameId: string | undefined;
  private tournamentId: string | undefined;
  private tournamentRules: Pick<Tournament, "format" | "banlistCards"> | undefined;
  private readyTimeout: Delayed | undefined;
  private waitingRoomTimeout: Delayed | undefined;
  private tournamentBotRoomIdleTimeout: Delayed | undefined;
  private matchStartRequested = false;
  private rankedPairId: string | undefined;
  private rankedRules: Pick<Tournament, "format" | "banlistCards"> | undefined;
  private rankedRoundClock: RankedRoundClock | undefined;
  private rankedHeartbeatAt = 0;
  private rankedStartPending = false;
  private liveListingStartedAt: number | undefined;
  private matchClock: MatchClock | undefined;
  private matchClockInterval: Delayed | undefined;
  private matchLimitInterval: Delayed | undefined;
  private gameOverAt: number | undefined;
  private lastPlayerActionAt: number | undefined;
  private drainingSince: number | undefined;
  /** How many games this room's match runs to; only casual and private rooms play more than one. */
  private bestOf: MatchBestOf = 1;
  private casualSeries: CasualSeries | undefined;
  private rematchOffer: RematchOffer | undefined;
  /** Seats claimed by series token in onAuth, for onJoin to honour. */
  private seriesSeatByClient = new Map<string, Seat>();
  /** Series seats that arrived before their opponent, waiting to be seated together. */
  private seriesArrivals = new Map<Seat, { client: Client; options: AegisJoinOptions }>();
  /** Waiting series clients that already sent `ready`, which is sent only once per join. */
  private seriesEarlyReady = new Set<string>();
  /** Set while a departure is being turned into a concession, so the series can tell it from a surrender. */
  private departingSeat: Seat | undefined;

  /** Position of the last event put on the wire; the first event of a room is `seq` 1. */
  private eventSeq = 0;
  /** Serial the batch ids are minted from. */
  private batchSeq = 0;
  /** The batch events are currently being stamped into, if any. */
  private currentBatch: OpenBatch | undefined;
  /** How many nested engine entries are inside the open batch; only the outermost closes it. */
  private batchDepth = 0;
  /** Full channel request retained while its mirrored decision can be resumed. */
  private pendingDecisionRequest: DecisionRequest | undefined;
  /**
   * The `securityRevealed` of a check that has not closed yet, kept so a client that reconnects
   * mid-check is handed the reveal it missed. Unlike the pending decision and the combat window,
   * an open check has no mirror in synchronized state, so there is nothing a resumed client could
   * read it back from: it would resync to the current board and play the clash it never saw
   * opened, on a board that stood still for the seconds the check was asking its questions.
   */
  private openSecurityReveal: ServerEvent | undefined;
  /** Ordinal of the last replay-relevant log line (see `replays/inputs/types.ts`). */
  private replaySeq = 0;
  /** How many events the engine has emitted; places each replay input in the match. */
  private engineEvents = 0;
  /** Set while the room runs code that can issue an engine input synchronously (see `ReplaySite`). */
  private replaySite: ReplaySite | undefined;

  /** Seam: the tournament series module this room reports to. Tests substitute their own. */
  protected series(): SeriesStore {
    return seriesStore;
  }

  /** Seam: the account store this room reads identity and legacy bracket state from. */
  protected accounts(): AccountStore {
    return accountStore;
  }

  protected connectionDrops():
    | Pick<ConnectionDropStore, "recordDrop" | "resolveDrop" | "recordClientReport">
    | undefined {
    return connectionDropStore;
  }

  protected activeMatches(): ActiveMatchDirectory {
    return activeMatchRuntime.directory;
  }

  // How long the in-memory match is held open for a client that dropped without
  // a consented leave (network blip, tab reload, mobile browser backgrounded —
  // phones kill the socket seconds after the app loses focus). A reconnect within
  // this window resumes the same seat; past it the drop resolves as a real
  // departure. Sized for a reload or a network blip, not for a long absence: an
  // opponent should not sit through minutes of a frozen board. This cannot survive
  // a server restart (deploy) — the room state lives only in memory.
  private readonly RECONNECT_GRACE_SECONDS = RECONNECT_GRACE_SECONDS;

  private readonly RECONNECT_CLAIM_SECONDS = 15;

  private readonly reconnectDeadlines = new Map<string, ReconnectDeadline>();

  private readonly tokenBeforeLastReconnect = new Map<string, string>();

  private readonly heldReconnections = new Map<string, HeldReconnection>();

  private readonly pendingSeatTransfers = new Map<string, PendingSeatTransfer>();

  private readonly publishedActiveMatchAccounts = new Set<string>();

  // How long both seats can sit joined-but-not-ready (e.g. a client stuck loading
  // assets, or one that crashed before it could send `ready`) before the room gives
  // up waiting and starts anyway, so the match never hangs indefinitely.
  private readonly READY_TIMEOUT_SECONDS = 60;

  // How long an open combat prompt (block, Counter, Alliance, Evade, Barrier) waits for its
  // answer before the server closes it at the safe default. The attack is parked on an
  // unresolved promise until then, so an answer that never comes wedges the match for BOTH
  // seats. Sized above RECONNECT_GRACE_SECONDS so a player who drops mid-window still gets the
  // full grace period to come back and answer it themselves; past that the seat is gone anyway.
  private readonly COMBAT_WINDOW_TIMEOUT_SECONDS = 240;

  private combatWindowTimeout: Delayed | undefined;
  private combatWindowTimeoutKey: string | undefined;

  override async onAuth(client: Client, options: AegisJoinOptions): Promise<boolean> {
    if (options.spectator === true) {
      if (this.isTournamentRoom) {
        return this.authorizeTournamentSpectator(client, options);
      }
      if (!this.spectatorInfo(options.roomCode)) {
        return false;
      }
      if (options.authTicket) {
        const ticket = await this.accounts().consumeRoomTicket(options.authTicket);
        if (!ticket || ticket.tournamentMatchId) {
          return false;
        }
        this.spectatorIdentities.set(client.sessionId, ticket.account);
      }
      const viewerId = this.spectatorIdentities.get(client.sessionId)?.id;
      if (
        !(await canSpectatePlayers({
          accounts: this.accounts(),
          ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
          viewerId,
        }))
      ) {
        this.spectatorIdentities.delete(client.sessionId);
        return false;
      }
      return true;
    }
    if (this.matchStartRequested || this.seatByClient.size + this.occupiedBotSeats().length >= 2) return false;
    if (this.casualSeries?.continuation)
      return this.authorizeSeriesSeat(client, options, this.casualSeries.continuation);
    const identity = await this.resolveIdentity(options);
    if (!identity) return false;
    const account = identity.account;
    if (account && this.guestApproval?.isDeclinedAccount(account.id)) {
      return false;
    }
    if (account) options.displayName = account.displayName;
    const normalizedName = options.displayName.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      this.state.players.some((player) => player?.displayName.trim().toLocaleLowerCase() === normalizedName)
    )
      return false;
    if ((options.ranked === true) !== this.isRankedRoom || ((this.isRankedRoom || this.isTournamentRoom) && !account))
      return false;
    if (!this.isPrivate && this.state.gameMode !== (options.gameMode ?? GameMode.AUTOMATIC.value)) {
      return false;
    }
    // Private and bot rooms allow beta cards without the client asking for them, so only the
    // public queues have to agree with the joiner's beta flag.
    if (
      this.state.gameMode !== GameMode.MANUAL.value &&
      !this.isPrivate &&
      !this.isBotRoom &&
      (options.betaBattleMode === true) !== this.isBetaBattleRoom
    )
      return false;
    if ((options.unlimited === true) !== this.isUnlimitedRoom) return false;
    if (options.format !== undefined && !isDeckFormat(options.format)) return false;
    if (!this.isPrivate && deckFormat(options.format, options.unlimited) !== this.state.format) return false;
    if (options.botDeck && (!this.isBotRoom || !this.isLegalRoomDeck(options.botDeck))) return false;
    // A guest of a private room plays whatever the host set; a public joiner must have asked for it.
    if (
      !this.isPrivate &&
      !this.isBotRoom &&
      !this.isRankedRoom &&
      !this.isTournamentRoom &&
      (options.allowRollback === true) !== this.state.allowRollback
    )
      return false;
    if (!this.isPrivate && this.offersSeries() && matchBestOf(options.bestOf) !== this.bestOf) return false;
    if (
      (this.isRankedRoom || this.isTournamentRoom) &&
      account &&
      [...this.accountByClient.values()].includes(account.id)
    )
      return false;
    // The host of a private room is always allowed; anybody after them needs the code.
    if (this.isPrivate && this.clients.length > 0 && options.roomCode !== this.state.roomCode) return false;
    // Every cheap check has passed, so it is finally safe to take the exclusive claims. Claiming
    // before a rejection would pin a bracket match or a Tournament Game to a room nobody ever
    // enters, and neither can be re-bound afterwards: the match would wedge (onDispose only
    // releases what was committed) and the game's UNIQUE room_id would refuse every later room.
    if (this.storyBattleId) {
      const guestHash = getStoryGuestHash(options.storyGuestToken);
      if ((!account && !guestHash) || options.storyBattleId !== this.storyBattleId) {
        return false;
      }
      const battle = this.soloBattle;
      const store = new StoryProgressStore(this.accounts());
      const progress = account ? await store.getProgress(account.id) : await store.getGuestProgress(guestHash!);
      const prerequisites = [
        ...(battle?.prerequisiteIds ?? []),
        ...(battle?.prerequisiteId ? [battle.prerequisiteId] : []),
      ];
      if (!battle || prerequisites.some((id) => !progress.completed.includes(id))) {
        return false;
      }
      this.storyAccountId = account?.id;
      this.storyGuestHash = account ? undefined : guestHash;
    } else if (options.storyBattleId !== undefined) {
      return false;
    }
    if (!(await identity.commit())) return false;
    if (
      account &&
      (getRankedConfig().enabled || this.rankedPairId) &&
      !(await claimAccountRoom({
        accounts: this.accounts(),
        accountId: account.id,
        roomId: this.roomId,
        rankedPairId: this.rankedPairId,
      }))
    ) {
      return false;
    }
    if (account) {
      this.accountByClient.set(client.sessionId, account.id);
      if (account.avatarUrl) {
        this.liveAvatarUrlByClient.set(client.sessionId, account.avatarUrl);
      }
      await this.loadEquippedRankedTier(client.sessionId, account.id);
    }
    return true;
  }

  /**
   * A later game of a casual series admits only the two seats of its series, by the token each was
   * handed, and seats them with exactly what they played game 1 with: the name and the deck are
   * locked for the series, so nothing in the join payload is trusted.
   */
  private async authorizeSeriesSeat(client: Client, options: AegisJoinOptions, record: SeriesRecord): Promise<boolean> {
    const seat = this.casualSeries?.seatForToken(options.seriesToken);
    if (seat === undefined || [...this.seriesSeatByClient.values()].includes(seat)) return false;
    const entry = record.seats[seat];
    if (
      entry.accountId &&
      getRankedConfig().enabled &&
      !(await claimAccountRoom({ accounts: this.accounts(), accountId: entry.accountId, roomId: this.roomId }))
    ) {
      return false;
    }
    options.displayName = entry.displayName;
    options.avatarId = entry.avatarId;
    options.deck = {
      mainDeck: [...entry.deck.mainDeck],
      eggDeck: [...entry.deck.eggDeck],
      mainDeckArts: entry.deck.mainDeckArts?.slice(),
      eggDeckArts: entry.deck.eggDeckArts?.slice(),
    };
    options.deckId = entry.deckId;
    options.deckName = entry.deckName;
    options.community = entry.community;
    options.presentationPacing = entry.presentationPacing;
    options.ranked = false;
    options.betaBattleMode = this.isBetaBattleRoom;
    options.unlimited = this.isUnlimitedRoom;
    options.format = this.state.format as DeckFormat;
    this.seriesSeatByClient.set(client.sessionId, seat);
    if (entry.accountId) {
      this.accountByClient.set(client.sessionId, entry.accountId);
      await this.loadEquippedRankedTier(client.sessionId, entry.accountId);
    }
    return true;
  }

  private async loadEquippedRankedTier(sessionId: string, accountId: string): Promise<void> {
    const rewards = await new RankedRewardStore(this.accounts()).getRewards(accountId);
    const equipped = rewards.items.find((reward) => reward.equipped);
    if (equipped) {
      this.equippedRankedTierByClient.set(sessionId, equipped.tier);
    }
  }

  /**
   * Establishes who is joining, by whichever of the two tournament flows the options describe (see
   * {@link AegisJoinOptions}), or by the plain room ticket for casual and ranked play.
   *
   * The two flows are mutually exclusive in BOTH directions — by the options presented and by what
   * this room is already bound to. Colyseus builds its room-discovery query only from the filter
   * keys a client actually sends, so a legacy join carrying a spurious `tournamentGameId` would
   * otherwise create a room that a later program join for that game discovers and enters, seating a
   * non-participant in a real tournament game.
   *
   * `undefined` means the join is refused. The returned `commit` takes the exclusive claim and
   * records what the room must remember; it runs only once every other check has passed, and its
   * `false` is itself a rejection.
   */
  private async resolveIdentity(options: AegisJoinOptions): Promise<JoinIdentity | undefined> {
    if (this.isRankedRoom && this.rankedPairId) {
      if (options.rankedPairId !== this.rankedPairId || typeof options.rankedToken !== "string") {
        return undefined;
      }
      const ticket = await this.accounts().consumeRoomTicket(options.authTicket);
      if (!ticket || ticket.tournamentMatchId) {
        return undefined;
      }
      const params = {
        accountId: ticket.account.id,
        pairId: this.rankedPairId,
        roomId: this.roomId,
        token: options.rankedToken,
      };
      const store = new RankedStore(this.accounts());
      const entry = await store.claimSeat({ ...params, consume: false });
      if (!entry) {
        return undefined;
      }
      this.rankedRules = { format: entry.format, banlistCards: entry.banlist };
      options.deck = structuredClone(entry.deck);
      options.deckId = entry.deck.id;
      options.deckName = entry.deck.name;
      options.format = entry.format;
      return { account: ticket.account, commit: async () => Boolean(await store.claimSeat(params)) };
    }
    if (options.rankedPairId || options.rankedToken || (this.isRankedRoom && getRankedConfig().enabled)) {
      return undefined;
    }
    const gameId = options.tournamentGameId;
    const token = options.tournamentGameToken;
    if (gameId && token) {
      // PROGRAM flow. Nothing from the legacy flow may ride along, and this room must not already
      // be a legacy bracket room.
      if (!this.isTournamentRoom || this.tournamentMatchId || options.tournamentMatchId || options.authTicket)
        return undefined;
      if (this.tournamentGameId && this.tournamentGameId !== gameId) return undefined;
      const entry = await this.series().inspectAuthorization({
        gameId,
        authorizationToken: token,
        roomId: this.roomId,
      });
      if (!entry.ok) return undefined;
      const tournament = await this.accounts().tournament(entry.value.authorization.tournamentId);
      if (!tournament || tournament.format !== this.state.format) {
        return undefined;
      }
      this.tournamentRules = tournament;
      options.format = tournament.format;
      options.unlimited = formatIsUnlimited(tournament.format);
      const { accountId, displayName, deck } = entry.value;
      // A bot's authorization is never valid over the wire. It has no Account, it is only ever
      // issued server-side to the code that drives the bot seat, and a client presenting one would
      // be redeeming a seat that is not a person's to take.
      if (!accountId) return undefined;
      // The frozen competitive deck is the only deck a tournament game is played with. Whatever the
      // client sent is discarded here, before onJoin can hand it to the engine.
      options.deck = {
        mainDeck: [...deck.mainDeck],
        eggDeck: [...deck.eggDeck],
        mainDeckArts: deck.mainDeckArts?.slice(),
        eggDeckArts: deck.eggDeckArts?.slice(),
      };
      options.deckId = deck.deckId ?? undefined;
      options.deckName = deck.name;
      return {
        account: { id: accountId, displayName },
        commit: async () => {
          // Claiming binds this room to the game exactly once; the opponent's own authorization
          // then finds it already bound to this room and is admitted to it.
          const claimed = await this.series().claimGame({ gameId, authorizationToken: token, roomId: this.roomId });
          if (!claimed.ok) return false;
          this.tournamentGameId = gameId;
          this.tournamentId = tournament.id;
          return true;
        },
      };
    }

    // LEGACY flow (and casual/ranked): a single-use room ticket, which for a tournament room must
    // name the match the client asked to join. A program option present here is a mismatched join.
    if (options.tournamentGameId || options.tournamentGameToken || this.tournamentGameId) return undefined;
    const ticket = await this.accounts().consumeRoomTicket(options.authTicket);
    if (this.isTournamentRoom) {
      const matchId = ticket?.tournamentMatchId;
      if (!ticket || !matchId || options.tournamentMatchId !== matchId) return undefined;
      if (this.tournamentMatchId && this.tournamentMatchId !== matchId) return undefined;
      return {
        account: ticket.account,
        commit: async () => {
          if (!(await this.accounts().claimTournamentRoom(matchId, this.roomId))) return false;
          this.tournamentMatchId = matchId;
          return true;
        },
      };
    }
    return {
      account: ticket?.account,
      commit: async () => {
        if (ticket?.tournamentMatchId) this.tournamentMatchId = ticket.tournamentMatchId;
        return true;
      },
    };
  }

  override onCreate(options: RoomCreateOptions): void | Promise<void> {
    if (options.rankedRoom && options.rankedPairId) {
      this.rankedPairId = options.rankedPairId;
      options.allowFormatSelection = true;
    }
    if (options.tournamentRoom && options.tournamentGameId) {
      return this.openTournamentGame(options);
    }
    if (options.tournamentRoom && options.format !== undefined && options.format !== "standard") {
      throw new ServerError(400, "Tournament format must come from its game");
    }
    if (options.seriesId !== undefined || options.seriesNonce !== undefined) return this.continueSeries(options);
    const reopenedCode = options.private && isRoomCode(options.roomCode) ? options.roomCode : undefined;
    if (reopenedCode) return this.reopenUnderCode(options, reopenedCode);
    this.initialize(options);
    return this.publishRoomRules();
  }

  private async openTournamentGame(options: RoomCreateOptions): Promise<void> {
    const tournament = await getTournamentGameRules({ accounts: this.accounts(), gameId: options.tournamentGameId! });
    if (!tournament) {
      throw new ServerError(404, "Tournament game not found");
    }
    this.tournamentRules = tournament;
    this.initialize({
      ...options,
      format: tournament.format,
      unlimitedRoom: formatIsUnlimited(tournament.format),
      allowFormatSelection: true,
    });
    await this.publishRoomRules();
  }

  private async reopenUnderCode(options: RoomCreateOptions, code: string): Promise<void> {
    if ((await roomCodes.resolve(code)) !== undefined) throw new ServerError(409, "This room code is still in use.");
    this.initialize(options, code);
    await this.publishRoomRules();
  }

  /**
   * The next game of a casual series, requested by the previous game's room. Every setting comes
   * from the series record, never from the request, which carries only the record's id and nonce.
   */
  private async continueSeries(options: RoomCreateOptions): Promise<void> {
    const record = await CasualSeries.loadContinuation(this.roomName, options);
    if (!record) throw new ServerError(403, "This series cannot continue here.");
    const settings: RoomCreateOptions = {
      private: options.private,
      botRoom: options.botRoom,
      rankedRoom: options.rankedRoom,
      betaBattleRoom: options.betaBattleRoom,
      unlimitedRoom: options.unlimitedRoom,
      allowUnlimitedSelection: options.allowUnlimitedSelection,
      unlimited: record.unlimited === true,
      format: record.format,
      allowFormatSelection: options.allowFormatSelection,
      tournamentRoom: options.tournamentRoom,
      allowRollback: record.allowRollback === true,
      matchTimer: record.matchTimer,
      timerStartSeconds: record.timerStartSeconds,
      bestOf: record.bestOf,
    };
    const code = options.private ? record.roomCode : undefined;
    if (code && (await roomCodes.resolve(code)) !== undefined)
      throw new ServerError(409, "This room code is still in use.");
    this.initialize(settings, code, record);
    await this.publishRoomRules();
    // Reachable only by the room id the series hands its two seats, never through matchmaking.
    await this.setPrivate(true);
  }

  private initialize(options: RoomCreateOptions, reopenedCode?: string, continuation?: SeriesRecord): void {
    this.setState(new GameState());
    this.guardFullStateSync();
    this.state.gameMode = options.manualRoom === true ? GameMode.MANUAL.value : GameMode.AUTOMATIC.value;
    if (options.manualRoom) {
      options.matchTimer = false;
      options.bestOf = 1;
      options.allowRollback = false;
      options.botRoom = false;
      options.rankedRoom = false;
      options.tournamentRoom = false;
    }
    // A draining slot still finishes the series it is running: refusing the next game would end
    // every series in progress at each release.
    if (!canCreateRoom() && !continuation)
      throw new ServerError(503, "This game server is draining; retry on the active slot.");
    this.state.matchLogId = randomUUID();
    this.clock.setInterval(() => {
      void this.publishSocialPresence().catch(() => undefined);
      if (!this.state.gameOver) {
        this.refreshLiveListing();
      }
    }, 10_000);
    const { seed, randomKey } = getRoomRandomness({ seed: options.seed });
    this.debug("room.created", {
      seed,
      private: options.private,
      botRoom: options.botRoom,
      rankedRoom: options.rankedRoom,
      betaBattleRoom: options.betaBattleRoom,
      unlimitedRoom: options.unlimitedRoom,
      tournamentRoom: options.tournamentRoom,
      devScenario: options.devScenario,
    });
    this.isBotRoom = options.botRoom === true;
    if (this.isBotRoom) {
      this.maxClients = 1;
      this.autoDispose = true;
      if (DEV_SCENARIOS_ENABLED && isLocalScenarioEntry(options.devScenario)) {
        this.devScenario = options.devScenario;
        this.scenarioFixture = getLocalScenario();
      }
    }
    if (options.storyBattleId !== undefined) {
      if (
        !this.isBotRoom ||
        options.rankedRoom ||
        options.tournamentRoom ||
        options.private ||
        typeof options.storyBattleId !== "string" ||
        options.devScenario !== undefined
      ) {
        throw new ServerError(400, "Invalid story room");
      }
      const battle = findSoloBattle(options.storyBattleId);
      if (!battle) {
        throw new ServerError(400, "Story battle is not available");
      }
      this.storyBattleId = battle.id;
      this.soloBattle = battle;
      if (battle.shuffleDecks) {
        shuffleStoryDecks({ fixture: battle.fixture, seed });
      }
      this.scenarioFixture = battle.fixture;
      options.allowRollback = false;
    }
    this.isRankedRoom = options.rankedRoom === true;
    this.isBetaBattleRoom = options.betaBattleRoom === true;
    this.isUnlimitedRoom =
      !options.rankedRoom &&
      (!options.tournamentRoom || this.tournamentRules !== undefined) &&
      (options.unlimitedRoom === true ||
        (options.allowUnlimitedSelection === true &&
          (options.botRoom === true || options.private === true || options.manualRoom === true) &&
          options.unlimited === true));
    if (options.format !== undefined && !isDeckFormat(options.format))
      throw new ServerError(400, "Unknown deck format");
    const format = deckFormat(options.format, this.isUnlimitedRoom);
    if (
      ((options.rankedRoom && !this.rankedPairId) ||
        (options.tournamentRoom && this.tournamentRules === undefined) ||
        (options.betaBattleRoom && !options.private && !options.botRoom && !options.manualRoom)) &&
      format !== "standard"
    )
      throw new ServerError(400, "This room requires Standard format");
    if (format !== "standard" && format !== "unlimited" && options.allowFormatSelection !== true)
      throw new ServerError(400, "Format selection is unavailable in this room");
    if (formatIsUnlimited(format) !== this.isUnlimitedRoom)
      throw new ServerError(400, "Format does not match this room type");
    this.state.format = format;
    this.state.unlimited = this.isUnlimitedRoom;
    this.isTournamentRoom = options.tournamentRoom === true;
    if (options.private) {
      this.isPrivate = true;
      const code = reopenedCode ?? generateRoomCode();
      this.state.roomCode = code;
      roomCodes.claim(code, this.roomId);
      this.autoDispose = true;
      if (options.requireApproval === true && !continuation) {
        this.guestApproval = this.createGuestApprovalGate();
      }
    }
    if (!this.isBotRoom && !this.isRankedRoom && !this.isTournamentRoom) {
      this.state.spectatorCode = this.state.roomCode || generateRoomCode();
      if (!this.isPrivate) roomCodes.claim(this.state.spectatorCode, this.roomId);
    }
    if (!this.isTournamentRoom && this.devScenario === undefined) {
      this.waitingRoomTimeout = this.clock.setTimeout(() => {
        if (!this.matchStartRequested) void this.disconnect();
      }, WAITING_ROOM_TIMEOUT_SECONDS * 1000);
    }
    if (this.offersSeries()) {
      this.bestOf = matchBestOf(options.bestOf);
      if (continuation) this.casualSeries = CasualSeries.continueFrom(this.seriesPort(), continuation);
      else if (this.bestOf > 1)
        this.casualSeries = CasualSeries.begin(this.seriesPort(), {
          bestOf: this.bestOf,
          unlimited: this.isUnlimitedRoom,
          format: this.state.format as DeckFormat,
          allowRollback: options.allowRollback === true,
          matchTimer: options.matchTimer === true,
          timerStartSeconds: options.timerStartSeconds ?? MATCH_TIMER_START_SECONDS,
          ...(this.isPrivate ? { roomCode: this.state.roomCode } : {}),
        });
      this.rematchOffer = new RematchOffer({
        readState: () => this.state,
        startSeries: (opening) => this.startRematchSeries(opening),
        afterSeries: this.casualSeries !== undefined,
      });
    }
    this.state.allowRollback = options.allowRollback === true && !this.isRankedRoom && !this.isTournamentRoom;
    if (this.state.allowRollback)
      this.rollbackHistory = new RollbackHistory({
        seed,
        randomKey,
        firstSeat: this.casualSeries?.fixedFirstSeat,
        matchId: this.state.matchLogId,
        rules: {
          gameMode: this.state.gameMode,
          deckFormat: this.state.format as DeckFormat,
          unlimited: this.state.unlimited,
          betaBattle: this.isBetaBattleRoom,
        },
      });
    this.engineHooks = {
      beforeTurn: (turn) => {
        if (this.rankedRoundClock?.shouldDrawBeforeTurn({ now: Date.now(), turn })) {
          this.atReplaySite("beforeTurn", () => {
            this.recordReplayInput({ kind: "expireRankedRound" });
            this.withBatch(() => this.engine.win.declareDraw("timeout"));
          });
          return;
        }
        this.rollbackHistory?.beforeTurn(turn, this.engine);
        this.refreshRollbackAvailability();
      },
      seed,
      randomKey,
      ...(this.casualSeries?.fixedFirstSeat !== undefined ? { firstSeat: this.casualSeries.fixedFirstSeat } : {}),
      requestDecision: (seat, req) => this.requestDecision(seat, req),
      onBothReady: () => this.atReplaySite("bothReady", () => this.startMatchNow()),
      onActionSettled: (seat, intentType) => {
        this.refreshRollbackAvailability();
        this.bots[seat]?.onActionSettled(intentType);
      },
      emit: (event) => {
        if (event.kind === "cardPlayed" || event.kind === "digivolved") this.matchClock?.grantCardBonus(event.seat);
        this.engineEvents += 1;
        this.refreshRollbackAvailability();
        if (event.kind === "matchStarted" && !this.devScenario && !this.replayRecording) {
          this.replayRecording = new ReplayRecording();
        }
        if (
          event.kind === "gameOver" &&
          this.storyBattleId &&
          (this.storyAccountId || this.storyGuestHash) &&
          event.result.outcome !== "draw" &&
          event.result.winnerSeat === 0
        ) {
          const store = new StoryProgressStore(this.accounts());
          const completion = { battleId: this.storyBattleId, matchId: this.state.matchLogId };
          const saved = this.storyAccountId
            ? store.recordVictory({ ...completion, accountId: this.storyAccountId })
            : store.recordGuestVictory({ ...completion, guestHash: this.storyGuestHash! });
          void saved.catch((error) => this.debugError("[AegisRoom] failed to persist story progress", error));
        }
        if (event.kind === "gameOver") {
          this.releaseActiveMatches();
          void this.publishSocialPresence().catch(() => undefined);
          // A completed engine cannot accept replacement players. Locking also
          // guarantees a drawn tournament replay receives a fresh room. A failure here is worth
          // logging and nothing more — the engine is over, so an unlocked room admits nobody who
          // could change the outcome — but it must never surface as an unhandled rejection, which
          // in production kills the process and in tests hides every other failure behind noise.
          void this.lock().catch((error: unknown) =>
            this.debugError("[AegisRoom] failed to lock finished room", error),
          );
          void this.recordRecentResults(event).catch((error) =>
            this.debugError("[AegisRoom] failed to persist recent match", error),
          );
          void this.recordAuthoritativeResult(event).catch((error) =>
            this.debugError("[AegisRoom] failed to persist match result", error),
          );
          // Frees the code for the next game, which the players open from the same private room.
          if (this.state.roomCode) roomCodes.release(this.state.roomCode, this.roomId);
          if (this.state.spectatorCode && !this.isPrivate) roomCodes.release(this.state.spectatorCode, this.roomId);
          this.refreshLiveListing();
          this.casualSeries?.recordGame(
            event.result.outcome === "draw" ? -1 : event.result.winnerSeat,
            this.departingSeat,
          );
          if (!this.casualSeries || this.casualSeries.over) {
            this.rematchOffer?.open({
              result: event.result.outcome === "draw" ? -1 : event.result.winnerSeat,
              departed: this.departingSeat !== undefined,
            });
          }
        }
        if (event.kind === "matchStarted") {
          void this.publishSocialPresence().catch(() => undefined);
          this.casualSeries?.noteFirstSeat(event.firstSeat);
          this.rematchOffer?.noteFirstSeat(event.firstSeat);
        }
        if (event.kind === "counterWindowOpened") {
          const stamped = this.stamp(event);
          for (const client of this.clients) {
            client.send(
              EVENT_CHANNEL,
              this.seatByClient.get(client.sessionId) === event.defendingSeat
                ? stamped
                : { ...stamped, eligibleCounters: [] },
            );
          }
        } else {
          this.broadcast(EVENT_CHANNEL, this.stamp(event));
        }
        // A tournament set or a casual series plays on with the same decks, so its hidden cards
        // stay hidden until the last game.
        if (event.kind === "gameOver" && !this.isTournamentRoom && (this.casualSeries?.over ?? true)) {
          this.broadcast(EVENT_CHANNEL, this.stamp({ kind: "finalReveal", players: finalRevealOf(this.state) }));
        }
        // Rebuild each client's StateView after any event that can move a CardInstance
        // into a public zone (battleArea/breeding topCard) from a private one
        // (hand/eggDeck). @colyseus/schema snapshots node visibility when the view is
        // built, so a card redacted while private stays redacted after it goes public
        // unless the view is rebuilt — otherwise the opponent reads topCard=undefined.
        if (
          event.kind === "cardPlayed" ||
          event.kind === "cardsMoved" ||
          event.kind === "digivolved" ||
          event.kind === "manualAction"
        ) {
          this.rebuildClientViews();
        }
        // After dealing opening hands, force a state patch so clients receive
        // their cards before the mulligan decision arrives. Without this, the
        // decision message (sent synchronously) races ahead of the next scheduled
        // Colyseus patch and the client renders the mulligan overlay with 0 cards.
        if (event.kind === "matchStarted") {
          this.debug("match.initialState", this.state.toJSON());
          // Rebuild each human client's StateView now that the hands are dealt.
          // view.add() records which card ChangeTree nodes are visible at call time;
          // cards pushed after the initial view.add() in onJoin are not automatically
          // visible. Rebuilding here, after runSetup() populates the hands, ensures
          // every dealt card is in the view's visible set before broadcastPatch().
          this.rebuildClientViews();
          this.debug(
            "[AegisRoom] matchStarted — rebuilt views. Hand sizes:",
            this.state.players.map((p, i) => `seat${i}=${p?.hand?.length ?? "?"}`).join(", "),
          );
          this.atReplaySite("matchStarted", () => this.broadcastPatch());
          this.debug("[AegisRoom] broadcastPatch() returned");
        }
        // A check opens on its reveal and closes on `securityChecked`; everything it asks in
        // between happens while both clients hold on the revealed card.
        if (event.kind === "securityRevealed") this.openSecurityReveal = event;
        else if (event.kind === "securityChecked") this.openSecurityReveal = undefined;
        for (const bot of this.bots) bot?.onEvent(event);
        this.speakBotLines(event);
        this.syncCombatWindowTimeout();
      },
    };
    this.engine = new GameEngine(this.state, this.guardedEngineHooks());
    const firstSeat = this.casualSeries?.fixedFirstSeat;
    const serverRevision = process.env.AEGIS_REVISION;
    this.debug("replay.header", {
      gameMode: this.state.gameMode,
      replaySeq: this.nextReplaySeq(),
      seed,
      randomKey,
      ...(firstSeat !== undefined ? { firstSeat } : {}),
      ...(serverRevision ? { serverRevision } : {}),
      deckFormat: this.state.format as DeckFormat,
      unlimited: this.isUnlimitedRoom,
      betaBattle: this.isBetaBattleRoom,
      ...(this.devScenario !== undefined ? { devScenario: this.devScenario } : {}),
    } satisfies ReplayHeaderLine);
    // Route zone arrivals to the per-client StateViews (see exposeCardToClients). Installed
    // before any seat is filled so `seatPlayer` picks it up for both PlayerStates. Not a replay
    // input: it only wires per-client views, which never feed back into engine state.
    this.engine.installVisibility(this.guardedVisibilityPort());

    // One catch-all handler: every client intent type is reassembled into a
    // discriminated-union Intent and handed to the engine, which validates,
    // mutates state, and emits events. Rejections are surfaced as an
    // "actionRejected" event to the offending client only.
    this.onMessage("*", (client, type, payload) => {
      if (!this.admitClientMessage(client)) return;
      if (type === ROLLBACK_CHANNEL) {
        void this.handleRollback(client, payload);
        return;
      }

      if (type === CONNECTION_REPORT_CHANNEL) {
        this.handleConnectionReport(client, payload);
        return;
      }
      if (type === OPPONENT_DECK_CHANNEL) {
        const now = performance.now();
        if (now - (this.opponentDeckRequestTimes.get(client) ?? -Infinity) >= 10_000) {
          this.opponentDeckRequestTimes.set(client, now);
          void this.sendOpponentDeck(client).catch((error: unknown) =>
            this.debugError("[AegisRoom] failed to share opponent deck", error),
          );
        }
        return;
      }
      if (type === USED_DECK_CHANNEL) {
        const deck = this.deckByClient.get(client.sessionId);
        if (deck && !this.spectatorClients.has(client.sessionId)) client.send(USED_DECK_CHANNEL, structuredClone(deck));
        return;
      }
      if (type === REPLAY_CHANNEL) {
        const now = performance.now();
        if (now - (this.replayRequestTimes.get(client) ?? -Infinity) >= 10_000) {
          this.replayRequestTimes.set(client, now);
          this.sendReplayDownload(client);
        }
        return;
      }
      if (type === PRESENTATION_CHANNEL) {
        if (
          this.state.rollbackBusy ||
          (this.state.rollbackRevision > 0 &&
            (payload as { rollbackRevision?: unknown })?.rollbackRevision !== this.state.rollbackRevision)
        )
          return;
        this.handlePresentationReport(client, payload);
        return;
      }
      if (type === ANIMATION_SPEED_CHANNEL) {
        this.handleAnimationSpeed(client, payload);
        return;
      }
      if (type === CHAT_CHANNEL) {
        this.handleChat(client, payload);
        return;
      }
      if (type === GUEST_APPROVAL_CHANNEL) {
        if (!this.matchStartRequested) {
          this.guestApproval?.handleMessage({ senderSessionId: client.sessionId, payload });
        }
        return;
      }
      if (type === SERIES_CHANNEL) {
        const seat = this.seatByClient.get(client.sessionId);
        if (seat === undefined) {
          return;
        }
        if (this.casualSeries && !this.casualSeries.over) {
          this.casualSeries.handleMessage(seat, payload, this.matchStartRequested);
        } else {
          this.rematchOffer?.handleMessage(seat, payload);
        }
        return;
      }
      if (this.state.rollbackBusy || this.rollbackPending) return;
      if (
        this.state.allowRollback &&
        this.state.rollbackRevision > 0 &&
        (payload as { rollbackRevision?: unknown })?.rollbackRevision !== this.state.rollbackRevision
      )
        return;
      this.handleIntent(client, { ...(payload as object), type } as Intent);
    });

    // Optional clocks belong to casual/private rooms. Ignore crafted ranked/tournament options.
    const devTimer = this.scenarioFixture?.presentation?.timed === true;
    this.matchClock = new MatchClock(
      this.state,
      {
        ...options,
        matchTimer:
          this.rankedPairId !== undefined ||
          (!this.isTournamentRoom &&
            !this.isRankedRoom &&
            (devTimer || (!this.isBotRoom && options.matchTimer === true))),
        ...(this.rankedPairId ? { timerStartSeconds: MATCH_TIMER_START_SECONDS, timerRefillSeconds: 60 } : {}),
        ...(devTimer ? { timerStartSeconds: MATCH_TIMER_START_SECONDS } : {}),
      },
      this.isPrivate || devTimer,
      performance.now(),
      !this.isPrivate &&
        !this.isBotRoom &&
        !this.isRankedRoom &&
        !this.isTournamentRoom &&
        this.state.gameMode !== GameMode.MANUAL.value,
    );
    if (this.state.matchTimer) {
      this.matchClockInterval = this.clock.setInterval(() => this.syncMatchClock(), 100);
    }
    this.matchLimitInterval = this.clock.setInterval(() => {
      this.enforceMatchLimits();
      this.publishActiveMatches();
      if (this.accountByClient.size && (getRankedConfig().enabled || this.rankedPairId) && !this.state.gameOver) {
        void this.accounts()
          .pool.query("UPDATE account_active_rooms SET expires_at=$2 WHERE room_id=$1", [
            this.roomId,
            Date.now() + 120_000,
          ])
          .catch((error: unknown) => this.debugError("[rooms] account presence failed", error));
      }
    }, MATCH_LIMIT_CHECK_MS);
    roomRegistry.set(this.roomId, this);
  }

  /** Bot, ranked, tournament and hand-laid rooms always play a single game. */
  private offersSeries(): boolean {
    return (
      this.state.gameMode !== GameMode.MANUAL.value &&
      !this.isBotRoom &&
      !this.isRankedRoom &&
      !this.isTournamentRoom &&
      this.devScenario === undefined
    );
  }

  private startRematchSeries(opening: RematchOpening): boolean {
    if (!this.offersSeries() || (this.casualSeries && !this.casualSeries.over) || !this.state.gameOver) {
      return false;
    }
    this.casualSeries?.dispose();
    this.casualSeries = CasualSeries.rematch(
      this.seriesPort(),
      {
        bestOf: REMATCH_BEST_OF,
        unlimited: this.isUnlimitedRoom,
        format: this.state.format as DeckFormat,
        allowRollback: this.state.allowRollback,
        matchTimer: this.state.matchTimer,
        timerStartSeconds: this.state.timerStartSeconds,
        ...(this.isPrivate ? { roomCode: this.state.roomCode } : {}),
      },
      opening,
    );
    return true;
  }

  private seriesPort(): SeriesRoomPort {
    const currentState = () => this.state;
    return {
      get state() {
        return currentState();
      },
      roomName: this.roomName,
      setTimeout: (run, ms) => this.clock.setTimeout(run, ms),
      setInterval: (run, ms) => this.clock.setInterval(run, ms),
      seatSnapshot: (seat) => {
        const player = this.state.players[seat];
        const deck = player ? this.deckByClient.get(player.sessionId) : undefined;
        if (!player || !deck) return undefined;
        return {
          accountId: this.accountByClient.get(player.sessionId),
          displayName: player.displayName,
          ...(player.avatarId ? { avatarId: player.avatarId } : {}),
          deck: {
            mainDeck: [...deck.mainDeck],
            eggDeck: [...deck.eggDeck],
            mainDeckArts: deck.mainDeckArts?.slice(),
            eggDeckArts: deck.eggDeckArts?.slice(),
          },
          ...(deck.deckId ? { deckId: deck.deckId } : {}),
          deckName: deck.deckName,
          community: deck.community ? structuredClone(deck.community) : undefined,
          presentationPacing: this.chainPacingClients.has(player.sessionId) ? "sequential" : "current",
        };
      },
      resolveDeckChoice: (choice) => this.resolveSeriesDeckChoice(choice),
      sendToSeat: (seat, message) =>
        this.clients.find((client) => this.seatByClient.get(client.sessionId) === seat)?.send(SERIES_CHANNEL, message),
      createNextRoom: async (options) => (await matchMaker.createRoom(this.roomName, options)).roomId,
      logError: (...data) => this.debugError(...data),
    };
  }

  private getBotResult(event: Extract<import("@aegis/shared").ServerEvent, { kind: "gameOver" }>) {
    if (event.result.outcome === "draw") {
      return "draw";
    }
    if (event.result.winnerSeat === this.BOT_SEAT) {
      return "win";
    }
    return "loss";
  }

  private async recordRecentResults(
    event: Extract<import("@aegis/shared").ServerEvent, { kind: "gameOver" }>,
  ): Promise<void> {
    if (this.devScenario || this.storyBattleId || this.state.gameMode === GameMode.MANUAL.value) return;
    const finishedAt = Date.now();
    for (const seat of [0, 1] as const) {
      const settings = this.botLevelSettings[seat];
      const bot = this.bots[seat];
      if (settings === undefined || bot === undefined) continue;
      const botResult = event.result.outcome === "draw" ? "draw" : event.result.winnerSeat === seat ? "win" : "loss";
      this.debug("bot.level.result", {
        seat,
        botDifficulty: settings.difficulty,
        botStyle: settings.style,
        botResult,
        concededByOpponent: event.reason === "surrender" && botResult === "win",
        reason: event.reason,
        gameLengthTurns: this.state.turnCount,
        policyName: bot.policyName,
        policyDecisionLatencyMs: bot.policyDecisionLatencySummary,
        inferenceFallbacks: bot.inferenceFallbacks,
        ...(bot.searchFallbacks === undefined ? {} : { searchFallbacks: bot.searchFallbacks }),
        ...(bot.searchErrors === undefined ? {} : { searchErrors: bot.searchErrors }),
        ...(seat === this.BOT_SEAT && this.botExperimentRecord !== undefined
          ? {
              botExperiment: this.botExperimentRecord.botExperiment,
              botArm: this.botExperimentRecord.botArm,
            }
          : {}),
      });
    }
    const experimentRecord = this.botExperimentRecord;
    if (experimentRecord) {
      this.debug("bot.experiment.result", {
        ...experimentRecord,
        botResult: this.getBotResult(event),
        reason: event.reason,
        inferenceFallbacks: this.bots[this.BOT_SEAT]?.inferenceFallbacks,
      });
    }
    // Snapshot both identities before I/O: onLeave clears accountByClient synchronously.
    const participants = ([0, 1] as const).flatMap((seat) => {
      const player = this.state.players[seat];
      const owner = player && this.accountByClient.get(player.sessionId);
      if (!owner) return [];
      const opponentSeat = seat === 0 ? 1 : 0;
      const opponent = this.state.players[opponentSeat];
      const ownDeck = this.initialDeckBySeat.get(seat);
      const opponentDeck = this.initialDeckBySeat.get(opponentSeat);
      const opponentDeckOwnerAccountId = this.deckOwnerBySeat.get(opponentSeat);
      return [
        {
          owner,
          record: {
            id: this.replayRecording?.id ?? this.roomId,
            ownDeck: ownDeck ? structuredClone(ownDeck) : undefined,
            ownDeckId: ownDeck?.deckId,
            ownDeckName: ownDeck?.deckName,
            ownDeckKey: ownDeck ? buildDeckCompositionKey(ownDeck) : undefined,
            ownDeckStartedAt: this.deckStartedAtBySeat.get(seat),
            mode: this.replayMode(),
            opponentName: opponent?.displayName ?? "Opponent",
            opponentAccountId: opponent ? this.accountByClient.get(opponent.sessionId) : undefined,
            ...(opponentDeck === undefined ? {} : { opponentDeck: structuredClone({ ...opponentDeck, deckId: null }) }),
            ...(opponentDeckOwnerAccountId === undefined ? {} : { opponentDeckOwnerAccountId }),
            opponentKind: this.bots[seat === 0 ? 1 : 0] ? ("bot" as const) : ("human" as const),
            ...(isDigimonWorldAvatarId(opponent?.avatarId) ? { opponentAvatarId: opponent.avatarId } : {}),
            result:
              event.result.outcome === "draw"
                ? ("draw" as const)
                : event.result.winnerSeat === seat
                  ? ("win" as const)
                  : ("loss" as const),
            reason: event.reason,
            finishedAt,
            ...(experimentRecord && this.bots[seat === 0 ? 1 : 0] ? experimentRecord : {}),
          },
        },
      ];
    });
    await Promise.all(
      participants.map(({ owner, record }) => this.accounts().recordRecentMatch(owner, this.roomId, record)),
    );
  }

  /**
   * Publishes what this room is authoritative about: the outcome of the ONE game it ran.
   *
   * For a Tournament Game that is the whole story — the series module decides whether another game
   * opens, whether the confrontation is over and what a timeout means. The room does not know
   * whether this was game 2 of a best-of-three, and must not learn.
   */
  private async recordAuthoritativeResult(
    event: Extract<import("@aegis/shared").ServerEvent, { kind: "gameOver" }>,
  ): Promise<void> {
    if (this.accountByClient.size && (getRankedConfig().enabled || this.rankedPairId)) {
      await this.accounts().ensureReady();
      await this.accounts().pool.query("DELETE FROM account_active_rooms WHERE room_id=$1", [this.roomId]);
    }
    if (this.state.gameMode === GameMode.MANUAL.value) {
      return;
    }
    // The Tournament Game path comes first and does not require two Accounts: a seat driven by a
    // bot has no client, so `accountByClient` holds nothing for it and the two-account guard below
    // would silently discard a perfectly good result.
    if (this.tournamentGameId) {
      const outcome =
        event.result.outcome === "draw" ? ({ kind: "draw" } as const) : this.winnerOutcome(event.result.winnerSeat);
      if (!outcome) {
        this.debugError(
          `[AegisRoom] tournament game result UNATTRIBUTABLE gameId=${this.tournamentGameId} roomId=${this.roomId} winnerSeat=${event.result.outcome === "draw" ? "-" : event.result.winnerSeat}`,
        );
        return;
      }
      const recorded = await this.series().recordGameResult({
        gameId: this.tournamentGameId,
        roomId: this.roomId,
        outcome,
        finishedAt: Date.now(),
      });
      this.releaseTournamentBotRoom();
      // A refusal here means a finished game was NOT persisted — the confrontation is now stuck
      // waiting on a result that will never arrive. It must be loud enough to alert on.
      if (!recorded.ok)
        this.debugError(
          `[AegisRoom] tournament game result REJECTED gameId=${this.tournamentGameId} roomId=${this.roomId} reason=${recorded.reason}`,
        );
      return;
    }
    const accounts = ([0, 1] as Seat[]).map((seat) => {
      const player = this.state.players[seat];
      return player ? this.accountByClient.get(player.sessionId) : undefined;
    });
    if (!accounts[0] || !accounts[1]) return;
    const ranked = ([0, 1] as Seat[]).every((seat) => {
      const player = this.state.players[seat];
      return !!player && this.rankedByClient.get(player.sessionId) === true;
    });
    const decks = ([0, 1] as Seat[]).map((seat) => {
      const player = this.state.players[seat];
      return player ? this.deckByClient.get(player.sessionId) : undefined;
    });
    if (this.isTournamentRoom && this.tournamentMatchId) {
      const snapshots = decks[0] && decks[1] ? ([decks[0], decks[1]] as [DeckSnapshot, DeckSnapshot]) : undefined;
      if (event.result.outcome === "draw") {
        await this.accounts().recordTournamentRoomDraw(
          this.tournamentMatchId,
          this.roomId,
          [accounts[0], accounts[1]],
          event.reason,
          snapshots,
        );
        return;
      }
      const winner = event.result.winnerSeat;
      await this.accounts().recordTournamentRoomResult(
        this.tournamentMatchId,
        this.roomId,
        [accounts[0], accounts[1]],
        accounts[winner],
        event.reason,
        snapshots,
      );
      return;
    }
    if (!ranked) return;
    if (event.result.outcome === "draw") {
      await this.accounts().recordMatch({
        roomId: this.roomId,
        mode: "ranked",
        rankedPairId: this.rankedPairId,
        matchLogId: this.state.matchLogId,
        format: this.state.format as DeckFormat,
        playerAccountIds: [accounts[0], accounts[1]],
        reason: event.reason,
        deckSnapshots: decks[0] && decks[1] ? [decks[0], decks[1]] : undefined,
      });
      return;
    }
    const winner = event.result.winnerSeat;
    await this.accounts().recordMatch({
      roomId: this.roomId,
      mode: "ranked",
      rankedPairId: this.rankedPairId,
      matchLogId: this.state.matchLogId,
      format: this.state.format as DeckFormat,
      playerAccountIds: [accounts[0], accounts[1]],
      winnerAccountId: accounts[winner],
      reason: event.reason,
      deckSnapshots: decks[0] && decks[1] ? [decks[0], decks[1]] : undefined,
    });
  }

  /**
   * Names the winning seat the way the series module can accept it: by Account when a person won,
   * by participant when a bot did.
   *
   * A seated client is preferred over the recorded holder, so the ordinary human path is unchanged.
   * `undefined` means the seat belongs to nobody the room knows about, which is never expected and
   * must not be reported as somebody else's win.
   */
  private winnerOutcome(
    winnerSeat: Seat,
  ):
    | { kind: "winner"; winnerAccountId: string }
    | { kind: "winnerParticipant"; winnerParticipantId: string }
    | undefined {
    const player = this.state.players[winnerSeat];
    const accountId = player ? this.accountByClient.get(player.sessionId) : undefined;
    if (accountId) return { kind: "winner", winnerAccountId: accountId };
    const holder = this.tournamentSeatHolders[winnerSeat];
    if (holder && "accountId" in holder) return { kind: "winner", winnerAccountId: holder.accountId };
    if (holder && "participantId" in holder)
      return { kind: "winnerParticipant", winnerParticipantId: holder.participantId };
    return undefined;
  }

  /**
   * Seats a tournament bot on its own Tournament Game authorization.
   *
   * This is the ONLY way a bot enters a tournament room, and deliberately not the path
   * {@link addBot} takes: `addBot` still refuses every tournament room, so `POST /bot/join` — the
   * one route that reaches it — cannot put a bot into a competitive event. What replaces that
   * blanket guard here is the authorization itself: the token is minted by the series module for a
   * participant of `kind: "bot"` seated in THIS game, it is single-use, and no HTTP surface can
   * obtain one. A caller without a valid token seats nothing.
   *
   * Returns false rather than throwing on every refusal, so a driver retrying a room it lost a race
   * for reads one uniform answer.
   */
  async seatTournamentBot(input: {
    gameId: string;
    authorizationToken: string;
    botOptions?: BotOptions;
  }): Promise<boolean> {
    if (!this.isTournamentRoom || this.matchStartRequested) return false;
    if (this.tournamentGameId && this.tournamentGameId !== input.gameId) return false;
    if (this.seatByClient.size + this.occupiedBotSeats().length >= 2) return false;

    // Only a bot participant may be driven from here — a human's authorization redeemed this way
    // would seat an unattended bot in a person's seat. Checked BEFORE anything is consumed:
    // `inspectAuthorization` validates without binding a room or spending the token, so a human's
    // token presented here is refused and stays usable by the person it belongs to.
    const inspected = await this.series().inspectAuthorization({
      gameId: input.gameId,
      authorizationToken: input.authorizationToken,
      roomId: this.roomId,
    });
    if (!inspected.ok || inspected.value.kind !== "bot" || !inspected.value.participantId) return false;
    const tournament = await this.accounts().tournament(inspected.value.authorization.tournamentId);
    if (!tournament || tournament.format !== this.state.format) {
      return false;
    }
    this.tournamentRules = tournament;

    const claimed = await this.series().claimGame({
      gameId: input.gameId,
      authorizationToken: input.authorizationToken,
      roomId: this.roomId,
    });
    if (!claimed.ok) return false;
    const { participantId, kind, displayName, deck } = claimed.value;
    if (kind !== "bot" || !participantId) return false;
    this.tournamentGameId = input.gameId;

    const taken = new Set<Seat>([...this.seatByClient.values(), ...this.occupiedBotSeats()]);
    const seat: Seat = taken.has(0 as Seat) ? (1 as Seat) : (0 as Seat);
    if (taken.has(seat)) return false;

    const style = resolveBotProfile(input.botOptions?.profile).name;
    const botOptions = {
      ...createLevelBotOptions({
        difficulty: BotDifficulty.STANDARD.value,
        style,
        engine: this.engine,
        seat,
        deck,
        seed: input.botOptions?.seed ?? this.engine.hooks.seed + seat * 7919,
      }),
      ...input.botOptions,
      difficulty: BotDifficulty.STANDARD.value,
    };
    this.debug("bot.seated", { seat, deck, botDifficulty: BotDifficulty.STANDARD.value, botStyle: style });
    this.botLevelSettings[seat] = { difficulty: BotDifficulty.STANDARD.value, style };
    this.tournamentSeatHolders[seat] = { participantId };
    this.bots[seat] = new BotPlayer(
      seat,
      this.state,
      (intent) => {
        const result = this.applyLoggedIntent(seat, intent);
        this.rebuildClientViews();
        return result;
      },
      botOptions,
    );
    this.withBatch(() => {
      this.engine.seatPlayer(seat, `bot:${participantId}`, {
        displayName,
        format: this.state.format as DeckFormat,
        banlistCards: (this.rankedRules ?? this.tournamentRules)?.banlistCards,
        deck: {
          mainDeck: [...deck.mainDeck],
          eggDeck: [...deck.eggDeck],
          mainDeckArts: deck.mainDeckArts?.slice(),
          eggDeckArts: deck.eggDeckArts?.slice(),
        },
      });
      this.state.players[seat]!.botPersonaId = botPersonaForDeck({ deck }).id;
    });
    this.recordReplaySeat(
      seat,
      deck,
      {
        format: this.state.format as DeckFormat,
        banlistCards: (this.rankedRules ?? this.tournamentRules)?.banlistCards,
      },
      true,
    );
    // The bot announces readiness through the ordinary intent, so the ready gate closes for the
    // usual reason rather than being bypassed. Against a person that means the match starts when
    // THEY are ready (with the existing timeout as the fallback), instead of dealing them a hand
    // while their client is still loading; between two bots it means the second seat's readiness
    // starts the match, with nobody waiting on anybody.
    this.applyLoggedIntent(seat, { type: "ready" });
    this.holdTournamentBotRoom();
    this.armReadyTimeoutIfSeated();
    return true;
  }

  private holdTournamentBotRoom(): void {
    this.autoDispose = false;
    if (this.tournamentBotRoomIdleTimeout || this.matchStartRequested) {
      return;
    }
    this.tournamentBotRoomIdleTimeout = this.clock.setTimeout(() => {
      if (!this.matchStartRequested) {
        void this.disconnect();
      }
    }, TOURNAMENT_BOT_ROOM_IDLE_MS);
  }

  private releaseTournamentBotRoom(): void {
    if (this.occupiedBotSeats().length === 0) {
      return;
    }
    if (this.clients.length === 0) {
      void this.disconnect();
      return;
    }
    this.autoDispose = true;
  }

  private occupiedBotSeats(): Seat[] {
    return ([0, 1] as Seat[]).filter((seat) => this.bots[seat] !== undefined);
  }

  hasBotSeat(): boolean {
    return this.occupiedBotSeats().length > 0;
  }

  /**
   * Arms the never-readying fallback once every seat is taken.
   *
   * Counted in SEATS rather than clients: a room with one person and one bot is full, and waiting
   * for a second client that is never going to connect would hang it for the whole timeout and then
   * start anyway.
   */
  private armReadyTimeoutIfSeated(): void {
    if (this.matchStartRequested || this.guestApproval?.blocksMatchStart()) return;
    if (this.seatByClient.size + this.occupiedBotSeats().length !== 2) return;
    this.readyTimeout?.clear();
    this.readyTimeout = this.clock.setTimeout(() => this.startMatchNow(), this.READY_TIMEOUT_SECONDS * 1000);
  }

  private createGuestApprovalGate(): GuestApprovalGate {
    return new GuestApprovalGate({
      readState: () => this.state,
      readSeatedSessionIds: () => [...this.seatByClient.keys()],
      findAccountId: (sessionId) => this.accountByClient.get(sessionId),
      admitGuest: ({ guestSessionId, readyDeferred }) => {
        if (this.clients.some((client) => client.sessionId === guestSessionId)) {
          this.armReadyTimeoutIfSeated();
        }
        const seat = this.seatByClient.get(guestSessionId);
        if (readyDeferred && seat !== undefined) {
          this.applyLoggedIntent(seat, { type: "ready" });
        }
      },
      removeGuest: (guestSessionId) => {
        const connected = this.clients.find((client) => client.sessionId === guestSessionId);
        if (connected) {
          connected.leave(GUEST_DECLINED_CLOSE_CODE);
          return;
        }
        this.heldReconnections.get(guestSessionId)?.deadline.expire();
      },
    });
  }

  private settleGuestApprovalDeparture(sessionId: string): void {
    if (!this.guestApproval || this.matchStartRequested) {
      return;
    }
    if (!this.guestApproval.isHost(sessionId)) {
      this.guestApproval.noteGuestDeparted(sessionId);
      return;
    }
    void this.disconnect(HOST_LEFT_CLOSE_CODE).catch((error: unknown) =>
      this.debugError("[AegisRoom] failed to close a private room its host left", error),
    );
  }

  override onDispose(): void {
    this.releaseActiveMatches();
    for (const [accountId, receive] of this.spectatorPrivacySubscriptions) {
      void this.presence?.unsubscribe(`social:account:${accountId}`, receive);
    }
    this.spectatorPrivacySubscriptions.clear();
    for (const accountId of this.deckOwnerBySeat.values()) {
      void socialRuntime.service?.deletePresence({ accountId, connectionId: this.roomId }).catch(() => undefined);
    }
    for (const bot of this.bots) bot?.dispose();
    this.casualSeries?.dispose();
    // A refused private-code lookup can dispose the room before initialize creates its state.
    // This hook must return normally so Colyseus can clear the room's patch timer.
    if (this.state) this.debug("room.disposed");
    this.readyTimeout?.clear();
    this.waitingRoomTimeout?.clear();
    this.tournamentBotRoomIdleTimeout?.clear();
    this.matchClockInterval?.clear();
    this.matchLimitInterval?.clear();
    // Legacy only. A Tournament Game's room binding is permanent by design: the game either
    // finished here or is voided by the scheduler, and re-binding it to a second room would be the
    // duplicate-claim the UNIQUE room_id exists to prevent.
    if (!this.tournamentGameId && this.tournamentMatchId)
      void this.accounts()
        .releaseTournamentRoom(this.tournamentMatchId, this.roomId)
        .catch((error) => this.debugError("[AegisRoom] failed to release tournament room", error));
    if (this.accountByClient.size && (getRankedConfig().enabled || this.rankedPairId)) {
      void this.accounts()
        .pool.query("DELETE FROM account_active_rooms WHERE room_id=$1", [this.roomId])
        .catch((error: unknown) => this.debugError("[rooms] account release failed", error));
    }
    roomRegistry.delete(this.roomId);
    for (const view of this.issuedViews) view.dispose();
    this.issuedViews.clear();
    if (this.state?.spectatorCode && !this.isPrivate) roomCodes.release(this.state.spectatorCode, this.roomId);
    if (this.state?.roomCode) {
      roomCodes.release(this.state.roomCode, this.roomId);
    }
  }

  private assignView(client: Client, seat: Seat | undefined): void {
    if (client.view) {
      client.view.dispose();
      this.issuedViews.delete(client.view);
    }
    // Views are per-client filters over the state, so they are not replay inputs.
    client.view = this.engine.makeStateView(seat);
    if (client.view) this.issuedViews.add(client.view);
  }

  private async publishRoomRules(): Promise<void> {
    // Standalone room lifecycle consumers have no matchmaker listing to publish into.
    if (!Reflect.get(this, "_listing")) return;
    await this.setMatchmaking({
      metadata: {
        ...this.metadata,
        unlimited: this.isUnlimitedRoom,
        format: this.state.format as DeckFormat,
        gameMode: this.state.gameMode,
        live: this.liveMatch(),
      },
    });
  }

  private liveMatch(): LiveMatch | undefined {
    if (this.liveListingStartedAt === undefined || this.state.gameOver) return undefined;
    return {
      spectatorCode: this.state.spectatorCode,
      players: this.state.players.map((player) => (player.hideIdentityFromSpectators ? "" : player.displayName)),
      playerPreviews: this.state.players.map((player) =>
        getLiveMatchPlayerPreview({
          player,
          avatarUrl: this.liveAvatarUrlByClient.get(player.sessionId),
          deck: this.initialDeckBySeat.get(player.seat),
          preferredCardId: this.livePreferredCardBySeat.get(player.seat),
        }),
      ),
      format: this.state.format as DeckFormat,
      gameMode: this.state.gameMode,
      startedAt: this.liveListingStartedAt,
      spectators: this.spectatorClients.size,
    };
  }

  private async listLiveMatchWhenBothPlayersConsent(): Promise<void> {
    if (this.isBotRoom || this.isRankedRoom || this.isTournamentRoom) {
      return;
    }
    const owners = [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)];
    const preferences: AccountPreferences[] = await Promise.all(
      owners.map((owner) => (owner ? this.accounts().preferences(owner) : {})),
    );
    for (const player of this.state.players) {
      player.hideIdentityFromSpectators = preferences[player.seat]?.hideIdentityFromSpectators === true;
    }
    this.spectatorPrivacyReady = true;
    if (this.isPrivate || !owners.every((owner) => owner !== undefined)) {
      this.liveListingStartedAt = undefined;
      await this.publishRoomRules();
      return;
    }
    if (
      !preferences.every(
        (preference) =>
          preference.listLiveMatches !== false &&
          (preference.spectatorAccess === undefined || preference.spectatorAccess === SpectatorAccess.EVERYONE.value),
      ) ||
      this.state.gameOver
    ) {
      this.liveListingStartedAt = undefined;
      await this.publishRoomRules();
      return;
    }
    await Promise.all(
      this.state.players.map(async (player) => {
        this.livePreferredCardBySeat.delete(player.seat);
        const deck = this.initialDeckBySeat.get(player.seat);
        const owner = this.deckOwnerBySeat.get(player.seat);
        if (!owner || !deck?.deckId || player.hideIdentityFromSpectators) {
          return;
        }
        const savedDeck = (await this.accounts().decks(owner)).find((entry) => entry.id === deck.deckId);
        if (savedDeck?.coverCardId) {
          this.livePreferredCardBySeat.set(player.seat, savedDeck.coverCardId);
        }
      }),
    );
    this.liveListingStartedAt ??= Date.now();
    await this.publishRoomRules();
  }

  private syncSpectatorRoster(): void {
    const names = new Map<string, string>();
    let anonymous = 0;
    for (const sessionId of this.spectatorClients) {
      const identity = this.spectatorIdentities.get(sessionId);
      if (identity) {
        names.set(identity.id, identity.displayName);
      } else {
        anonymous += 1;
      }
    }
    for (const player of this.state.players) {
      player.spectatorNamesJson = JSON.stringify([...names.values()]);
      player.anonymousSpectatorCount = anonymous;
    }
  }

  private refreshLiveListing(): void {
    if (this.liveListingStartedAt === undefined) return;
    void this.publishRoomRules().catch((error: unknown) =>
      this.debugError("[AegisRoom] failed to refresh live match listing", error),
    );
  }

  private async publishSocialPresence(): Promise<void> {
    if (this.devScenario) {
      return;
    }
    await this.refreshSpectatorPrivacy();
    for (const accountId of this.deckOwnerBySeat.values()) {
      const connected = this.state.players.some(
        (player) => player.connected && this.accountByClient.get(player.sessionId) === accountId,
      );
      if (this.state.gameOver || !connected) {
        await socialRuntime.service?.deletePresence({ accountId, connectionId: this.roomId });
      } else {
        await socialRuntime.service?.writePresence({
          accountId,
          connectionId: this.roomId,
          status: this.matchStartRequested ? SocialStatus.IN_MATCH.value : SocialStatus.IN_LOBBY.value,
          ...(this.spectatorInfo(this.state.spectatorCode) ? { roomCode: this.state.spectatorCode } : {}),
        });
      }
    }
  }

  private async refreshSpectatorPrivacy(): Promise<void> {
    if (!this.matchStartRequested) {
      return;
    }
    await this.listLiveMatchWhenBothPlayersConsent();
    for (const client of this.clients) {
      if (!this.spectatorClients.has(client.sessionId)) {
        continue;
      }
      const viewerId = this.spectatorIdentities.get(client.sessionId)?.id;
      if (
        !(await canSpectatePlayers({
          accounts: this.accounts(),
          ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
          viewerId,
        }))
      ) {
        await client.leave(SPECTATOR_ACCESS_REVOKED_CLOSE_CODE);
      }
    }
  }

  async canSpectateAccount(viewerId: string, code: string): Promise<boolean> {
    return (
      this.spectatorInfo(code) !== null &&
      (await canSpectatePlayers({
        accounts: this.accounts(),
        ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
        viewerId,
      }))
    );
  }

  getOpponentAccountId(accountId: string): string | undefined {
    for (const seat of [0, 1] as const) {
      const player = this.state.players[seat];
      const opponent = this.state.players[seat === 0 ? 1 : 0];
      if (player && opponent && this.accountByClient.get(player.sessionId) === accountId) {
        return this.accountByClient.get(opponent.sessionId);
      }
    }
    return undefined;
  }

  privateRoomInfo(): {
    unlimited: boolean;
    format: DeckFormat;
    gameMode?: GameMode;
    hostAccountId?: string;
    waiting: boolean;
  } {
    return {
      hostAccountId: this.deckOwnerBySeat.get(0),
      waiting: !this.matchStartRequested && !this.state.gameOver && this.seatByClient.size === 1,
      unlimited: this.isUnlimitedRoom,
      format: this.state.format as DeckFormat,
      ...(this.state.gameMode === GameMode.MANUAL.value ? { gameMode: this.state.gameMode } : {}),
    };
  }

  private canAdmitSpectator(roomCode?: string): boolean {
    if (this.isTournamentRoom) {
      return this.canAdmitTournamentSpectator();
    }
    return this.spectatorInfo(roomCode) !== null;
  }

  private canAdmitTournamentSpectator(): boolean {
    return (
      this.tournamentId !== undefined &&
      this.matchStartRequested &&
      !this.state.gameOver &&
      this.spectatorClients.size < LIVE_MATCH_SPECTATOR_LIMIT
    );
  }

  private async authorizeTournamentSpectator(client: Client, options: AegisJoinOptions): Promise<boolean> {
    if (!this.canAdmitTournamentSpectator() || !this.tournamentId) {
      return false;
    }
    const ticket = await this.accounts().consumeRoomTicket(options.authTicket);
    if (!ticket || ticket.tournamentMatchId) {
      return false;
    }
    const tournament = await this.accounts().tournament(this.tournamentId);
    if (
      !tournament ||
      !(await canSpectateTournament({
        tournament,
        account: ticket.account,
        spectators: new TournamentSpectatorStore(this.accounts()),
      }))
    ) {
      return false;
    }
    this.spectatorIdentities.set(client.sessionId, ticket.account);
    return true;
  }

  /** Public information only; the HTTP gateway calls this through cluster RPC. */
  spectatorInfo(roomCode?: string): { roomId: string; players: string[]; spectators: number } | null {
    if (
      this.isBotRoom ||
      this.isRankedRoom ||
      this.isTournamentRoom ||
      !this.matchStartRequested ||
      !this.spectatorPrivacyReady ||
      this.state.gameOver
    )
      return null;
    if (!roomCode || roomCode !== this.state.spectatorCode) return null;
    if (this.spectatorClients.size >= LIVE_MATCH_SPECTATOR_LIMIT) return null;
    return {
      roomId: this.roomId,
      players: this.state.players.map((player) => (player.hideIdentityFromSpectators ? "" : player.displayName)),
      spectators: this.spectatorClients.size,
    };
  }

  override onJoin(client: Client, options: AegisJoinOptions): void {
    if (options.spectator === true) {
      // Recheck after reservation: a match can end while the socket is connecting.
      if (!this.canAdmitSpectator(options.roomCode)) {
        throw new ServerError(403, "Match is not available to spectators");
      }
      this.spectatorClients.add(client.sessionId);
      this.syncSpectatorRoster();
      this.refreshLiveListing();
      const identity = this.spectatorIdentities.get(client.sessionId);
      if (identity) {
        this.spectatorJoinNames.set(client.sessionId, identity.displayName);
      }
      this.assignView(client, undefined);
      if (this.openSecurityReveal)
        this.withBatch(() => client.send(EVENT_CHANNEL, this.stamp(this.openSecurityReveal!)), client);
      return;
    }
    if (this.matchStartRequested || this.seatByClient.size + this.occupiedBotSeats().length >= 2) {
      throw new ServerError(403, "Player seats are full");
    }
    if (this.soloBattle && this.scenarioFixture) {
      const battle = this.soloBattle;
      options = {
        ...options,
        displayName: battle.playerName ?? options.displayName,
        deck: getStorySeatDeck({ fixture: this.scenarioFixture, seat: 0 }),
        deckId: undefined,
        deckName: battle.deckName,
        community: undefined,
        botDeck: undefined,
      };
      this.customBotDeck = getStorySeatDeck({ fixture: this.scenarioFixture, seat: 1 });
    }
    this.debug("player.join", { sessionId: client.sessionId, deck: options.deck });
    // The room type, not the payload, decides whether unreleased cards are legal: a private
    // room accepts them and its clients never send the flag (onAuth already vetted the pair).
    options = {
      ...options,
      betaBattleMode: this.isBetaBattleRoom,
      unlimited: this.isUnlimitedRoom,
      format: this.state.format as DeckFormat,
      banlistCards: (this.rankedRules ?? this.tournamentRules)?.banlistCards,
    };
    if (options.botDeck) {
      if (!this.isBotRoom || !this.isLegalRoomDeck(options.botDeck))
        throw new ServerError(400, "Illegal custom bot deck");
      this.customBotDeck = {
        mainDeck: [...options.botDeck.mainDeck],
        eggDeck: [...options.botDeck.eggDeck],
        mainDeckArts: options.botDeck.mainDeckArts?.slice(),
        eggDeckArts: options.botDeck.eggDeckArts?.slice(),
      };
    }
    this.rankedByClient.set(client.sessionId, options.ranked === true);
    if (options.presentationPacing === "sequential") this.chainPacingClients.add(client.sessionId);
    else this.chainPacingClients.delete(client.sessionId);
    this.deckByClient.set(client.sessionId, {
      deckId: options.deckId ?? null,
      deckName: options.deckName ?? "Deck sem nome",
      format: this.state.format as DeckFormat,
      community: validCommunityAttribution(options.community),
      mainDeck: [...options.deck.mainDeck],
      eggDeck: [...options.deck.eggDeck],
      mainDeckArts: options.deck.mainDeckArts?.slice(),
      eggDeckArts: options.deck.eggDeckArts?.slice(),
    });
    // A later game of a series keeps every player in the seat their series token names. Seats
    // fill in order, so whoever arrives first waits for the other before either is seated.
    const seriesSeat = this.seriesSeatByClient.get(client.sessionId);
    if (seriesSeat !== undefined) {
      this.casualSeries?.noteArrival(seriesSeat);
      this.seriesArrivals.set(seriesSeat, { client, options });
      if (this.seriesArrivals.size < 2) return;
      const arrivals = [...this.seriesArrivals].sort(([a], [b]) => a - b);
      this.seriesArrivals.clear();
      for (const [arrivedSeat, arrival] of arrivals) this.seatClient(arrival.client, arrivedSeat, arrival.options);
      for (const [arrivedSeat, arrival] of arrivals)
        if (this.seriesEarlyReady.delete(arrival.client.sessionId))
          this.applyLoggedIntent(arrivedSeat, { type: "ready" });
      this.armReadyTimeoutIfSeated();
      return;
    }
    // Assign the first free seat instead of using clients.length - 1, which
    // breaks when a client disconnects and reconnects (e.g. React StrictMode
    // double-mounts, or genuine network reconnect).
    // Bot seats count as taken: a tournament bot may already be driving seat 0.
    const taken = new Set<Seat>([...this.seatByClient.values(), ...this.occupiedBotSeats()]);
    const seat: Seat = taken.has(0) ? 1 : 0;
    this.debug(
      `[AegisRoom] onJoin sessionId=${client.sessionId} seat=${seat} takenSeats=[${[...taken].join(",")}] totalClients=${this.clients.length} allSessionIds=[${this.clients.map((c) => c.sessionId).join(", ")}]`,
    );
    this.seatClient(client, seat, options);
    this.guestApproval?.noteSeated(client.sessionId);
    // The match starts once both seats have sent `ready` (GameEngineHooks.onBothReady),
    // not on join — starting on join races the client's asset loading against the
    // mulligan window. Arm a fallback so a stuck/never-readying client can't hang the
    // room forever.
    this.armReadyTimeoutIfSeated();
  }

  private seatClient(client: Client, seat: Seat, options: AegisJoinOptions): void {
    // A real reconnection is handled by allowReconnection() in onLeave. If a
    // staged PlayerState remains in a now-free seat, this is a replacement
    // player and their own identity/deck must replace the departed player's.
    const existing = this.state.players[seat];
    if (existing && existing.sessionId !== client.sessionId) {
      this.debug(
        `[AegisRoom] onJoin sessionId=${client.sessionId} seat=${seat} → replacing departed player ${existing.sessionId}`,
      );
    }
    this.withBatch(() => {
      this.engine.seatPlayer(seat, client.sessionId, options);
      this.state.players[seat]!.equippedRankedTier = this.equippedRankedTierByClient.get(client.sessionId) ?? "";
    });
    this.seatByClient.set(client.sessionId, seat);
    this.recordReplaySeat(seat, options.deck, {
      betaBattleMode: options.betaBattleMode,
      unlimited: options.unlimited,
      format: options.format,
      banlistCards: options.banlistCards,
    });
    // Per-client visibility: hide hidden zones from the other seat.
    this.assignView(client, seat);
    if (this.replayFinished) this.sendReplayDownload(client);
    const accountId = this.accountByClient.get(client.sessionId);
    if (this.tournamentGameId && accountId) this.tournamentSeatHolders[seat] = { accountId };
  }

  private startScenarioNow(): void {
    if (!this.scenarioFixture) throw new Error("No room fixture configured");
    if (this.matchStartRequested) return;
    this.matchStartRequested = true;
    this.readyTimeout?.clear();
    this.readyTimeout = undefined;
    const fixture = bindScenarioDecks(this.scenarioFixture, [this.engine.stagedDecks[0]!, this.engine.stagedDecks[1]!]);
    this.recordReplayInput({ kind: "startScenarioFixture", fixture });
    this.withBatch(() => this.engine.startScenarioFixture(fixture));
  }

  getQuickMatchAccountId(): string | undefined {
    if (
      this.isPrivate ||
      this.isBotRoom ||
      this.isRankedRoom ||
      this.isTournamentRoom ||
      this.matchStartRequested ||
      this.state.gameMode === GameMode.MANUAL.value
    ) {
      return undefined;
    }
    return this.deckOwnerBySeat.get(0);
  }

  /** Idempotent: only the first caller (ready-gate or timeout) actually starts the match. */
  private startMatchNow(): void {
    if (this.matchStartRequested || this.rankedStartPending || this.guestApproval?.blocksMatchStart()) return;
    if (this.rankedPairId) {
      this.rankedStartPending = true;
      void new RankedStore(this.accounts())
        .markPlaying(this.rankedPairId, this.roomId)
        .then((started) => {
          if (!started) {
            void this.disconnect();
            return;
          }
          this.rankedRoundClock = new RankedRoundClock(Date.now());
          this.state.rankedDeadlineAt = this.rankedRoundClock.getDeadline();
          this.state.rankedRemainingSeconds = 48 * 60;
          this.startAuthorizedMatch();
        })
        .catch((error: unknown) => {
          this.debugError("[ranked] failed to start reserved game", error);
          void this.disconnect();
        });
      return;
    }
    this.startAuthorizedMatch();
  }

  private startAuthorizedMatch(): void {
    if (this.matchStartRequested) return;
    this.matchStartRequested = true;
    if (
      !this.isPrivate &&
      !this.isBotRoom &&
      !this.isRankedRoom &&
      !this.isTournamentRoom &&
      this.state.gameMode !== GameMode.MANUAL.value &&
      !this.casualSeries?.continuation &&
      matchMaker.presence
    ) {
      const first = this.deckOwnerBySeat.get(0);
      const second = this.deckOwnerBySeat.get(1);
      if (first && second && first !== second) {
        void new QuickMatchPreference({ presence: matchMaker.presence })
          .recordOpponents([first, second])
          .catch((error: unknown) => this.debugError("[AegisRoom] failed to record quick match opponents", error));
      }
    }
    this.readyTimeout?.clear();
    this.readyTimeout = undefined;
    // A started match never takes a new player, even if a reconnect left the room unlocked.
    void this.lock()
      .then(async () => {
        // Keep the two-player reservation boundary until the match is locked. Raising
        // capacity while waiting would matchmake a third player into the same room.
        if (!this.isBotRoom && !this.isRankedRoom) {
          await this.setMatchmaking({ maxClients: 22 });
        }
        await this.listLiveMatchWhenBothPlayersConsent();
      })
      .catch((error: unknown) => this.debugError("[AegisRoom] failed to open observer capacity", error));
    // Advertise that the game is genuinely under way, so a scheduler can tell a room that never
    // started apart from one that started and stopped reporting.
    if (this.tournamentGameId)
      void this.series()
        .markGamePlaying(this.tournamentGameId, this.roomId)
        .catch((error: unknown) => this.debugError("[AegisRoom] failed to mark tournament game playing", error));
    this.recordReplayInput({ kind: "startMatch" });
    this.withBatch(() => this.engine.startMatch());
    this.publishActiveMatches();
  }

  override async onLeave(client: Client, code?: number): Promise<void> {
    const consented = code === CloseCode.CONSENTED || this.guestApproval?.wasDeclined(client.sessionId) === true;
    if (this.spectatorClients.has(client.sessionId)) {
      try {
        if (!consented && code !== SPECTATOR_ACCESS_REVOKED_CLOSE_CODE && !this.state.gameOver) {
          const reconnected = await this.allowReconnection(client, this.RECONNECT_GRACE_SECONDS);
          const viewerId = this.spectatorIdentities.get(client.sessionId)?.id;
          if (
            await canSpectatePlayers({
              accounts: this.accounts(),
              ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
              viewerId,
            })
          ) {
            this.assignView(reconnected, undefined);
            return;
          }
          await reconnected.leave(SPECTATOR_ACCESS_REVOKED_CLOSE_CODE);
        }
      } catch {
        // Spectator expiry has no effect on either player or the match clock.
      }
      this.spectatorClients.delete(client.sessionId);
      this.spectatorIdentities.delete(client.sessionId);
      this.syncSpectatorRoster();
      this.refreshLiveListing();
      this.spectatorNumbers.delete(client.sessionId);
      this.spectatorJoinNames.delete(client.sessionId);
      this.lastChatAtBySender.delete(client.sessionId);
      if (client.view) {
        client.view.dispose();
        this.issuedViews.delete(client.view);
      }
      return;
    }
    const seat = this.seatByClient.get(client.sessionId);
    const accountId = this.accountByClient.get(client.sessionId);
    const countsAsDodge =
      this.isRankedRoom && this.matchStartRequested && !this.state.gameOver && accountId !== undefined;
    this.debug(
      `[AegisRoom] onLeave sessionId=${client.sessionId} seat=${seat} consented=${consented} totalClients=${this.clients.length}`,
    );
    if (seat === undefined) {
      const seriesSeat = this.seriesSeatByClient.get(client.sessionId);
      if (seriesSeat !== undefined && this.seriesArrivals.get(seriesSeat)?.client === client) {
        this.seriesArrivals.delete(seriesSeat);
        this.seriesSeatByClient.delete(client.sessionId);
        this.seriesEarlyReady.delete(client.sessionId);
        this.casualSeries?.departed(seriesSeat, false);
      }
      this.accountByClient.delete(client.sessionId);
      this.liveAvatarUrlByClient.delete(client.sessionId);
      this.equippedRankedTierByClient.delete(client.sessionId);
      this.rankedByClient.delete(client.sessionId);
      this.chainPacingClients.delete(client.sessionId);
      return;
    }

    // A consented leave (tab closed, surrender) is a real departure.
    if (consented) {
      if (!this.matchStartRequested) {
        this.readyTimeout?.clear();
        this.readyTimeout = undefined;
        // A reconnect into a full room keeps the explicit lock, which Colyseus never lifts on its own.
        await this.unlock();
      } else {
        await this.lock();
      }
      this.seatByClient.delete(client.sessionId);
      this.concede(seat);
      this.settleGuestApprovalDeparture(client.sessionId);
      this.releaseActiveMatch(accountId);
      if (countsAsDodge && accountId) await this.accounts().recordRankedDodge(this.roomId, accountId);
      this.accountByClient.delete(client.sessionId);
      this.liveAvatarUrlByClient.delete(client.sessionId);
      this.equippedRankedTierByClient.delete(client.sessionId);
      this.rankedByClient.delete(client.sessionId);
      this.chainPacingClients.delete(client.sessionId);
      return;
    }

    // Unexpected drop: mark the seat disconnected (so the opponent sees it) and
    // hold it open for a grace period. The client keeps its seat mapping so a
    // reconnect via token resumes here without going through onJoin.
    this.readyTimeout?.clear();
    this.readyTimeout = undefined;
    await this.lock();
    this.syncMatchClock();
    this.recordReplayInput({ kind: "disconnect", seat, final: false });
    this.withBatch(() => this.engine.handleDisconnect(seat, false));
    this.syncMatchClock();
    this.reportableDropBySeat.delete(seat);
    const drop =
      code === SEAT_TRANSFERRED_CLOSE_CODE
        ? Promise.resolve(undefined)
        : this.recordConnectionDrop({ seat, accountId, closeCode: code });
    try {
      const reconnectedClient = await this.holdSeatForReconnect(client);
      this.resolveConnectionDrop(drop, ConnectionDropOutcome.RECONNECTED.value);
      this.reportableDropBySeat.set(seat, drop);
      this.debug(`[AegisRoom] reconnected sessionId=${client.sessionId} seat=${seat}`);
      this.syncMatchClock();
      this.recordReplayInput({ kind: "reconnect", seat });
      this.withBatch(() => this.engine.handleReconnect(seat));
      this.syncMatchClock();
      this.matchClock?.resetPresentation(seat, performance.now());
      this.syncMatchClock();
      if (!this.matchStartRequested) {
        // Unlocking a full room lists it in matchmaking, where every join fails with "already full".
        if (this.seatByClient.size + this.occupiedBotSeats().length < 2) await this.unlock();
        if (this.seatByClient.size + this.occupiedBotSeats().length === 2)
          this.readyTimeout = this.clock.setTimeout(() => this.startMatchNow(), this.READY_TIMEOUT_SECONDS * 1000);
      }
      // Colyseus hands the reconnected socket a NEW Client carrying the old view. That view
      // missed every card that reached the hand while the seat was offline, so the fresh view
      // must go on the new Client; assigning it to `client` left the socket on the stale one.
      this.assignView(reconnectedClient, seat);
      this.resendOpenPrompts(reconnectedClient, seat);
      if (this.replayFinished) this.sendReplayDownload(reconnectedClient);
      this.casualSeries?.resendSeat(seat);
    } catch {
      // Grace elapsed (or room disposed) without a reconnect: resolve as a real
      // departure — the opponent wins an in-progress match.
      this.debug(`[AegisRoom] reconnect grace elapsed sessionId=${client.sessionId} seat=${seat}`);
      this.resolveConnectionDrop(drop, ConnectionDropOutcome.EXPIRED.value);
      this.seatByClient.delete(client.sessionId);
      this.readyTimeout?.clear();
      this.readyTimeout = undefined;
      this.concede(seat);
      this.settleGuestApprovalDeparture(client.sessionId);
      this.releaseActiveMatch(accountId);
      if (countsAsDodge && accountId) await this.accounts().recordRankedDodge(this.roomId, accountId);
      this.accountByClient.delete(client.sessionId);
      this.liveAvatarUrlByClient.delete(client.sessionId);
      this.equippedRankedTierByClient.delete(client.sessionId);
      this.rankedByClient.delete(client.sessionId);
      this.chainPacingClients.delete(client.sessionId);
      if (!this.matchStartRequested) await this.unlock();
    }
  }

  private async holdSeatForReconnect(client: Client): Promise<Client> {
    const token = client.reconnectionToken;
    const unacknowledged = client as Client & { _enqueuedMessages?: unknown[] };
    const tokenBeforeLastReconnect =
      unacknowledged._enqueuedMessages === undefined ? undefined : this.tokenBeforeLastReconnect.get(client.sessionId);
    delete unacknowledged._enqueuedMessages;
    const reconnection = this.allowReconnection(client, "manual");
    const pending = this.getPendingReconnections();
    if (tokenBeforeLastReconnect) pending[tokenBeforeLastReconnect] = pending[token];
    const graceMs = this.RECONNECT_GRACE_SECONDS * 1000;
    const hold: HeldReconnection = {
      tokens: tokenBeforeLastReconnect ? [token, tokenBeforeLastReconnect] : [token],
      deadline: {
        expiresAt: this.clock.currentTime + graceMs,
        timer: this.clock.setTimeout(() => hold.deadline.expire(), graceMs),
        expire: () => {
          for (const held of hold.tokens) this.reconnectDeadlines.delete(held);
          reconnection.reject(new Error("reconnect grace elapsed"));
        },
      },
    };
    for (const held of hold.tokens) this.reconnectDeadlines.set(held, hold.deadline);
    this.heldReconnections.set(client.sessionId, hold);
    const transfer = this.pendingSeatTransfers.get(client.sessionId);
    if (transfer) {
      this.pendingSeatTransfers.delete(client.sessionId);
      transfer.resolve(this.rotateHeldReconnection(hold));
    }
    try {
      const reconnected = await reconnection;
      this.tokenBeforeLastReconnect.set(client.sessionId, hold.tokens[0]!);
      return reconnected;
    } finally {
      this.heldReconnections.delete(client.sessionId);
      hold.deadline.timer.clear();
      for (const held of hold.tokens) {
        this.reconnectDeadlines.delete(held);
        if (held !== token) delete pending[held];
      }
    }
  }

  private getPendingReconnections(): Record<string, unknown> {
    return (this as unknown as { _reconnections: Record<string, unknown> })._reconnections;
  }

  private rotateHeldReconnection(hold: HeldReconnection): string {
    const pending = this.getPendingReconnections();
    const reservation = pending[hold.tokens[0]!];
    const token = randomBytes(24).toString("base64url");
    for (const held of hold.tokens) {
      delete pending[held];
      this.reconnectDeadlines.delete(held);
    }
    pending[token] = reservation;
    this.reconnectDeadlines.set(token, hold.deadline);
    hold.tokens = [token];
    return token;
  }

  findAccountSeat(accountId: string): ActiveMatch | null {
    const sessionId = this.findTransferableSession(accountId);
    const seat = sessionId === undefined ? undefined : this.seatByClient.get(sessionId);
    if (sessionId === undefined || seat === undefined) {
      return null;
    }
    const hold = this.heldReconnections.get(sessionId);
    if (!hold) {
      return { roomId: this.roomId, seat };
    }
    return {
      roomId: this.roomId,
      seat,
      reconnectGraceMs: Math.max(0, hold.deadline.expiresAt - this.clock.currentTime),
    };
  }

  async transferAccountSeat(accountId: string): Promise<ActiveMatchClaim | null> {
    const sessionId = this.findTransferableSession(accountId);
    const seat = sessionId === undefined ? undefined : this.seatByClient.get(sessionId);
    if (sessionId === undefined || seat === undefined) {
      return null;
    }
    const token = await this.prepareSeatTransfer(sessionId);
    if (!token || this.seatByClient.get(sessionId) !== seat) {
      return null;
    }
    return { roomId: this.roomId, seat, reconnectionToken: `${this.roomId}:${token}` };
  }

  private findTransferableSession(accountId: string): string | undefined {
    if (typeof accountId !== "string" || !accountId || !this.matchStartRequested || this.state.gameOver) {
      return undefined;
    }
    const owned = [...this.seatByClient.keys()].filter(
      (sessionId) => this.accountByClient.get(sessionId) === accountId,
    );
    return owned.length === 1 ? owned[0] : undefined;
  }

  private prepareSeatTransfer(sessionId: string): Promise<string | undefined> {
    const hold = this.heldReconnections.get(sessionId);
    if (hold) {
      return Promise.resolve(this.rotateHeldReconnection(hold));
    }
    const pendingTransfer = this.pendingSeatTransfers.get(sessionId);
    if (pendingTransfer) {
      return pendingTransfer.promise;
    }
    const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
    if (!client) {
      return Promise.resolve(undefined);
    }
    let resolve!: (token: string | undefined) => void;
    const promise = new Promise<string | undefined>((done) => {
      resolve = done;
    });
    const timeout = this.clock.setTimeout(() => {
      if (this.pendingSeatTransfers.get(sessionId)?.promise === promise) {
        this.pendingSeatTransfers.delete(sessionId);
      }
      resolve(undefined);
    }, SEAT_TRANSFER_TIMEOUT_MS);
    void promise.then(() => timeout.clear());
    this.pendingSeatTransfers.set(sessionId, { promise, resolve });
    this.disconnectForSeatTransfer(client);
    return promise;
  }

  private disconnectForSeatTransfer(client: Client): void {
    const socket = client.ref as (Client["ref"] & { onleave?: (...args: unknown[]) => void }) | undefined;
    socket?.removeAllListeners("message");
    if (socket?.onleave) {
      socket.removeListener("close", socket.onleave);
    }
    client.leave(SEAT_TRANSFERRED_CLOSE_CODE);
    const room = this as unknown as { _onLeave: (client: Client, code: number) => Promise<void> };
    void room._onLeave(client, SEAT_TRANSFERRED_CLOSE_CODE);
  }

  private publishActiveMatches(): void {
    if (!this.matchStartRequested || this.state.gameOver) {
      return;
    }
    for (const sessionId of this.seatByClient.keys()) {
      const accountId = this.accountByClient.get(sessionId);
      if (!accountId) {
        continue;
      }
      this.publishedActiveMatchAccounts.add(accountId);
      void this.activeMatches()
        .publish({ accountId, roomId: this.roomId })
        .catch((error: unknown) => this.debugError("[AegisRoom] failed to publish active match", error));
    }
  }

  private releaseActiveMatch(accountId: string | undefined): void {
    if (!accountId || !this.publishedActiveMatchAccounts.delete(accountId)) {
      return;
    }
    void this.activeMatches()
      .release({ accountId, roomId: this.roomId })
      .catch((error: unknown) => this.debugError("[AegisRoom] failed to release active match", error));
  }

  private releaseActiveMatches(): void {
    for (const accountId of [...this.publishedActiveMatchAccounts]) {
      this.releaseActiveMatch(accountId);
    }
  }

  override checkReconnectionToken(reconnectionToken: string): string {
    const sessionId = super.checkReconnectionToken(reconnectionToken);
    const deadline = this.reconnectDeadlines.get(reconnectionToken);
    const claimMs = this.RECONNECT_CLAIM_SECONDS * 1000;
    if (sessionId && deadline && deadline.expiresAt - this.clock.currentTime < claimMs) {
      deadline.timer.clear();
      deadline.expiresAt = this.clock.currentTime + claimMs;
      deadline.timer = this.clock.setTimeout(deadline.expire, claimMs);
    }
    return sessionId;
  }

  /**
   * A seat is gone for good. In a match that is a concession; in a series it can also forfeit the
   * rest of the series, which is why the departure is marked while the concession runs.
   */
  private concede(seat: Seat): void {
    this.departingSeat = seat;
    try {
      this.withBatch(() => {
        this.recordReplayInput({ kind: "clearReady", seat });
        this.engine.clearReady(seat);
        this.recordReplayInput({ kind: "disconnect", seat, final: true });
        this.engine.handleDisconnect(seat, true);
      });
    } finally {
      this.departingSeat = undefined;
    }
    // A planned hop to the next game is not a departure from the series.
    if (!this.casualSeries?.hopping) this.casualSeries?.departed(seat, this.matchStartRequested);
    this.rematchOffer?.close();
  }

  /**
   * Seat a bot as seat 1 and start the match. The room must have exactly one
   * human player already seated. Idempotent: a second call is a no-op.
   */
  private resolveSeriesDeckChoice(choice: unknown): SeriesSeatDeck | undefined {
    if (typeof choice !== "object" || choice === null) {
      return undefined;
    }
    const { mainDeck, eggDeck, mainDeckArts, eggDeckArts, deckId, deckName, community } =
      choice as Partial<SeriesDeckChoice>;
    const deck = { mainDeck, eggDeck, mainDeckArts, eggDeckArts } as SeatJoinOptions["deck"];
    if (
      !this.isLegalRoomDeck(deck) ||
      !isOptionalCardList(mainDeckArts) ||
      !isOptionalCardList(eggDeckArts) ||
      (deckId !== undefined && (typeof deckId !== "string" || deckId.length > 128)) ||
      typeof deckName !== "string" ||
      deckName.length > 200
    ) {
      return undefined;
    }
    return {
      deck: {
        mainDeck: [...deck.mainDeck],
        eggDeck: [...deck.eggDeck],
        mainDeckArts: mainDeckArts?.slice(),
        eggDeckArts: eggDeckArts?.slice(),
      },
      deckId,
      deckName,
      community: validCommunityAttribution(community),
    };
  }

  private isLegalRoomDeck(deck: SeatJoinOptions["deck"]): boolean {
    return (
      Array.isArray(deck.mainDeck) &&
      Array.isArray(deck.eggDeck) &&
      deck.mainDeck.length === 50 &&
      deck.eggDeck.length <= 5 &&
      deck.mainDeck.every((id) => typeof id === "string") &&
      deck.eggDeck.every((id) => typeof id === "string") &&
      validateDecklist(deck, {
        betaBattleMode: this.isBetaBattleRoom,
        unlimited: this.isUnlimitedRoom,
        format: this.state.format as DeckFormat,
      }).ok
    );
  }

  requestBot({
    reconnectionToken,
    botDeckId,
    botDifficulty,
    botStyle,
  }: {
    reconnectionToken: string;
    botDeckId?: string;
    botDifficulty?: BotDifficulty;
    botStyle?: BotStyle;
  }): number {
    if (
      (botDifficulty !== undefined && !isBotDifficulty(botDifficulty)) ||
      (botStyle !== undefined && !isBotStyle(botStyle))
    ) {
      return 400;
    }
    const player = this.clients.find(
      (client) =>
        client.reconnectionToken &&
        `${this.roomId}:${client.reconnectionToken}` === reconnectionToken &&
        this.seatByClient.has(client.sessionId),
    );
    if (!player) return 403;
    return this.addBot({ botDeckId, botDifficulty, botStyle }) ? 200 : 409;
  }

  private assignBotExperimentArm(): BotExperimentRecord | undefined {
    const experiment = getActiveBotExperiment();
    if (experiment === undefined || this.devScenario || this.storyBattleId) {
      return undefined;
    }
    return { botExperiment: experiment.id, botArm: assignBotArm({ experiment, matchId: this.state.matchLogId }) };
  }

  private createPracticeBotOptions(
    deck: DefaultBotDeck,
    experimentRecord: BotExperimentRecord | undefined,
    style: BotStyle,
  ): BotOptions | undefined {
    if (experimentRecord === undefined) {
      return undefined;
    }
    return createBotArmOptions({
      arm: experimentRecord.botArm,
      style,
      engine: this.engine,
      seat: this.BOT_SEAT,
      deck,
      onFallback: () => {
        experimentRecord.botArmFallback = true;
        this.debug("bot.experiment.fallback", {
          botExperiment: experimentRecord.botExperiment,
          botArm: experimentRecord.botArm,
          turn: this.state.turnCount,
        });
      },
    });
  }

  addBot(input: { botDeckId?: string; botDifficulty?: BotDifficulty; botStyle?: BotStyle } | string = {}): boolean {
    const {
      botDeckId,
      botDifficulty: requestedDifficulty = BotDifficulty.STANDARD.value,
      botStyle,
    } = typeof input === "string" ? { botDeckId: input } : input;
    // Ordinary casual rooms remain accepted during the expand/contract rollout so
    // a tab with the previous web bundle can still start its bot match. New clients
    // create an isolated bot room and therefore never enter the casual queue.
    // Tournament rooms stay refused here, and that refusal is what `POST /bot/join` inherits. A
    // tournament bot is seated only through seatTournamentBot(), against an authorization no HTTP
    // caller can obtain.
    if (
      this.state.gameMode === GameMode.MANUAL.value ||
      this.isRankedRoom ||
      this.isTournamentRoom ||
      this.isPrivate ||
      this.clients.length !== 1
    )
      return false;

    // Reloads and reconnections can repeat /bot/join for the same match.
    // Acknowledge the existing bot without replacing it or restarting the engine.
    if (this.bots[this.BOT_SEAT] !== undefined) return true;

    // Resolve the deck before anything is mutated: an unplayable preset degrades to the
    // random pool inside playableBotDeck, and any remaining failure must leave the room
    // exactly as it was rather than half-seated.
    let deck;
    try {
      deck = this.customBotDeck ?? playableBotDeck(botDeckId, this.state.format as DeckFormat);
    } catch (error) {
      logError("[AegisRoom] addBot could not resolve a legal bot deck", error);
      return false;
    }

    const storyDifficulty = this.storyBattleId ? getStoryBattleDifficulty({ battleId: this.storyBattleId }) : undefined;
    const botDifficulty = storyDifficulty?.botDifficulty ?? requestedDifficulty;
    const requestedStyle = storyDifficulty ? undefined : botStyle;
    const style = storyDifficulty?.botStyle ?? requestedStyle ?? defaultStyleForDeck({ deck });
    const humanDeck = this.engine.stagedDecks[0];
    const storyPersona =
      this.storyBattleId && this.scenarioFixture
        ? getStoryBotPersona({ battleId: this.storyBattleId, fixture: this.scenarioFixture })
        : undefined;
    const persona = storyPersona ?? botPersonaForDeck({ deckId: botDeckId, deck });
    const modelOptions =
      this.scenarioFixture === undefined && humanDeck !== undefined
        ? (evolvedBotOptions({
            engine: this.engine,
            seat: this.BOT_SEAT,
            seed: this.engine.hooks.seed,
            decks: [humanDeck, deck],
          }) ??
          trainedBotOptions({
            engine: this.engine,
            seat: this.BOT_SEAT,
            decks: [humanDeck, deck],
          }))
        : undefined;
    const scenarioPolicy = createFixtureBotPolicy(this.scenarioFixture?.presentation?.opponent);
    const experimentRecord =
      scenarioPolicy === undefined && modelOptions === undefined && botDifficulty === BotDifficulty.STANDARD.value
        ? this.assignBotExperimentArm()
        : undefined;
    const baseBotOptions: BotOptions | undefined =
      scenarioPolicy === undefined
        ? (modelOptions ??
          this.createPracticeBotOptions(deck, experimentRecord, style) ??
          createLevelBotOptions({
            difficulty: botDifficulty,
            style,
            engine: this.engine,
            seat: this.BOT_SEAT,
            deck,
            seed: this.engine.hooks.seed + this.BOT_SEAT * 7919,
          }))
        : { policy: scenarioPolicy };
    const clientPacesChains = this.clients.some((client) => this.chainPacingClients.has(client.sessionId));
    const botOptions: BotOptions | undefined = clientPacesChains
      ? { ...baseBotOptions, clientPacesChains }
      : baseBotOptions;
    this.bots[this.BOT_SEAT] = new BotPlayer(
      this.BOT_SEAT,
      this.state,
      (intent) => {
        const result = this.applyLoggedIntent(this.BOT_SEAT, intent);
        // After each bot action, rebuild every human client's StateView so that
        // CardInstances moved from the bot's private hand into public positions
        // (battleArea, breeding) are recognised as newly-visible by @colyseus/schema
        // and included in the next patch with their full state.
        this.rebuildClientViews();
        return result;
      },
      botOptions,
    );
    this.botLevelSettings[this.BOT_SEAT] =
      scenarioPolicy === undefined && modelOptions === undefined ? { difficulty: botDifficulty, style } : undefined;

    let botDisplayName = persona.displayName;
    if (this.soloBattle) {
      botDisplayName = this.soloBattle.opponentName;
    }
    this.debug("bot.seated", {
      seat: this.BOT_SEAT,
      deck,
      clientPacesChains,
      botDifficulty,
      botStyle: style,
      ...(experimentRecord ? { botExperiment: experimentRecord.botExperiment, botArm: experimentRecord.botArm } : {}),
    });
    try {
      this.withBatch(() => {
        this.engine.seatPlayer(this.BOT_SEAT, "bot", {
          displayName: botDisplayName,
          deck,
          betaBattleMode: this.isBetaBattleRoom,
          unlimited: this.isUnlimitedRoom,
          format: this.state.format as DeckFormat,
        });
        this.state.players[this.BOT_SEAT]!.botPersonaId = persona.id;
      });
      this.recordReplaySeat(
        this.BOT_SEAT,
        deck,
        {
          betaBattleMode: this.isBetaBattleRoom,
          unlimited: this.isUnlimitedRoom,
          format: this.state.format as DeckFormat,
        },
        true,
      );
    } catch (error) {
      // Seating is the last thing that can reject the deck. Releasing the bot slot keeps
      // the room retryable — the idempotence check above would otherwise report a bot that
      // was never seated, leaving the player waiting on an opponent that cannot arrive.
      this.bots[this.BOT_SEAT]?.dispose();
      this.bots[this.BOT_SEAT] = undefined;
      logError("[AegisRoom] addBot failed to seat the bot", error);
      return false;
    }
    this.botExperimentRecord = experimentRecord;

    // The bot never sends its own `ready` intent (it isn't a Colyseus client, so it
    // has no seatByClient entry for applyIntent to route through) — starting the
    // match directly here is the bot seat's stand-in for readiness.
    // Legacy bot joins can promote a waiting casual room to practice mode.
    if (this.scenarioFixture?.presentation?.timed !== true) {
      this.state.matchTimer = false;
      this.state.timerActiveSeat = -1;
      this.matchClockInterval?.clear();
    }
    if (this.scenarioFixture !== undefined) this.startScenarioNow();
    else this.startMatchNow();
    return true;
  }

  /**
   * Bring every connected client's StateView up to date with the current state.
   *
   * Refreshes each client's EXISTING view in place (`GameEngine.refreshStateView`)
   * rather than replacing it with a fresh one. Replacing it wholesale — the prior
   * behavior — loses the view's memory of which cards it had already made visible,
   * so a card that just left a `@view`-tagged zone (e.g. played from hand) is no
   * longer visible to the freshly-built view at the exact moment its removal needs
   * encoding, and the encoder silently drops the delete: the client's copy of the
   * hand keeps the card forever, permanently out of sync with the (correct)
   * server state. `onJoin`/reconnect still build a fresh view because those send a
   * full snapshot rather than a delta, so there is nothing to lose there.
   */
  private rebuildClientViews(): void {
    for (const client of this.clients) {
      const seat = this.seatByClient.get(client.sessionId);
      if (seat === undefined && !this.spectatorClients.has(client.sessionId)) continue;
      if (client.view) {
        // View-only, like every call in here: not a replay input.
        this.engine.refreshStateView(client.view, seat);
      } else {
        this.assignView(client, seat);
      }
    }
  }

  /**
   * The mutation seam's VisibilityPort: fan one card arrival out to every connected client's
   * view. Installed on the engine in `onCreate`.
   *
   * This is what replaced walking every private zone before every patch. `StateView.add`
   * force-queues an ADD for every field of the object it is given, so the old per-patch walk
   * made each patch re-encode the entire state for both seats — the client then spent all of
   * its main thread in the schema decoder. Exposing a card once, when it actually arrives,
   * carries the same information at a fraction of the bytes.
   */
  private readonly exposeCardToClients: VisibilityPort = (ownerSeat, zone, card) => {
    for (const client of this.clients) {
      const viewerSeat = this.seatByClient.get(client.sessionId);
      if (client.view === undefined || (viewerSeat === undefined && !this.spectatorClients.has(client.sessionId)))
        continue;
      this.engine.exposeCardToView(client.view, viewerSeat, ownerSeat, zone, card);
    }
  };

  /**
   * Refresh the public per-zone count mirrors before every state broadcast. The
   * hidden zones (deck/hand/security) are redacted per seat, so only these counts
   * convey their sizes to the opponent; recomputing here keeps them in lockstep with
   * the arrays after any mutation an intent caused (API-CONTRACT "Visibility";
   * ARCHITECTURE.md section 6). Colyseus calls this once per patch.
   */
  override onBeforePatch(): void {
    // Colyseus starts its patch timer before onCreate, which can await a private-code lookup
    // or reject before the engine exists. There is nothing to synchronize until it is ready.
    if (!this.engine) return;
    // Not a replay input: the counts are derived from the zone arrays, and the replay recomputes them.
    this.engine.syncCounts();
    this.engine.flushHandAffordances();
    // Refresh every view before the patch is encoded, not only after the three events that
    // happen to name a move. A StateView must still recognise a card as visible at the moment
    // its removal is encoded, or the encoder drops the delete and the client's copy of the
    // hand keeps the card forever (see rebuildClientViews). Any hand-emptying path whose
    // event is not `cardPlayed`/`cardsMoved`/`digivolved` — a cost paid mid-effect, a card
    // placed under a permanent by a watcher — used to strand exactly that way, so each such
    // move left one more phantom copy in the player's own hand. Refreshing per patch closes
    // the whole class: `unlockInto` is add-only and idempotent, so this is safe to repeat.
    this.rebuildClientViews();
  }

  /**
   * After each patch, each view forgets the cards whose move out of its sight that patch
   * carried (into a deck, or into the opponent's hand or face-down security). Otherwise a
   * later change to such a card, such as a deck reveal, is encoded for a refId the client
   * already dropped. Colyseus has no after-patch hook, and its patch timer calls this method.
   */
  override broadcastPatch(): boolean {
    const hasChanges = super.broadcastPatch();
    if (!this.engine) return hasChanges;
    for (const client of this.clients) {
      if (client.view === undefined) continue;
      // View-only bookkeeping, not a replay input.
      this.engine.forgetWithheldCards(client.view, this.seatByClient.get(client.sessionId));
    }
    return hasChanges;
  }

  /**
   * Run one entry into the engine as a single batch of events.
   *
   * Every path from this room into `GameEngine` that can emit goes through here, so the
   * batch boundary is the rules boundary rather than the patch tick. A nested entry — a bot
   * acting from a settled action while the batch that settled it is still open — reuses the
   * open batch, because it is part of the same moment for the player watching.
   */
  private withBatch<T>(run: () => T, recipient?: Client): T {
    const opened = this.currentBatch ?? this.openBatch(recipient);
    this.batchDepth += 1;
    try {
      return withMatchLog(this.state.matchLogId, this.roomId, run);
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.currentBatch === opened) this.closeBatch();
    }
  }

  private openBatch(recipient?: Client): OpenBatch {
    this.batchSeq += 1;
    this.currentBatch = {
      id: `batch-${this.batchSeq}`,
      emitted: 0,
      lastSeq: 0,
      recipient,
      events: [],
      presentationMs: [0, 0],
    };
    return this.currentBatch;
  }

  /**
   * Put the envelope on an event and count it into the open batch.
   *
   * An event emitted with no batch open — the tail of an asynchronous resolution, which
   * continues after the intent that started it has returned — gets a batch of its own,
   * closed once the synchronous burst it belongs to has finished emitting.
   */
  private stamp(event: ServerEvent): SequencedServerEvent {
    const batch = this.currentBatch ?? this.openImplicitBatch();
    this.eventSeq += 1;
    batch.emitted += 1;
    for (const seat of [0, 1] as const)
      batch.presentationMs[seat] += eventAnimationMs(event, seat, this.animationSpeed[seat]);
    batch.lastSeq = this.eventSeq;
    const stamped = { ...event, seq: this.eventSeq, batch: batch.id, stateVersion: this.state.stateVersion };
    if (!batch.recipient && this.replayRecording) batch.events.push(stamped);
    this.debug("engine.event", stamped);
    return stamped;
  }

  private openImplicitBatch(): OpenBatch {
    const batch = this.openBatch();
    queueMicrotask(() => {
      // An explicit entry that started inside this batch owns the close instead.
      if (this.batchDepth === 0 && this.currentBatch === batch) this.closeBatch();
    });
    return batch;
  }

  /**
   * End the open batch. A batch that emitted nothing (a rejected intent, a join) is closed
   * silently: there is nothing for a client to group.
   *
   * The close is broadcast with `afterNextPatch`, so it reaches clients only after the state
   * patch carrying the batch's mutations — the client narrating the batch then knows which
   * board it is narrating over. That patch is sent right here rather than on the next tick:
   * batches resolved within one tick (a whole turn start, an effect's chain) would otherwise
   * share one patch, the client would never see their revisions, and the board could only
   * jump to the last one while the narration was still reading out the first. A batch
   * belonging to one client is sent directly: it changed no shared state, so there is no
   * patch to wait for.
   */
  private closeBatch(): void {
    const batch = this.currentBatch;
    this.currentBatch = undefined;
    if (!batch || batch.emitted === 0) return;
    if (!batch.recipient) {
      this.atReplaySite("batchClose", () => this.syncMatchClock());
      this.state.stateVersion += 1;
      this.matchClock?.presentBatch(performance.now(), batch.presentationMs);
    }
    const closed: ServerEvent = {
      kind: "batchClosed",
      batch: batch.id,
      stateVersion: this.state.stateVersion,
      lastSeq: batch.lastSeq,
    };
    if (batch.recipient) {
      batch.recipient.send(EVENT_CHANNEL, this.stampClose(closed, batch));
      return;
    }
    if (this.replayRecording && !this.replayFinished) {
      this.engine.flushHandAffordances();
      this.replayRecording.capture(this.state, batch.events);
      if (this.state.gameOver) {
        this.replayFinished = true;
        for (const client of this.clients) this.sendReplayDownload(client);
      }
    }
    this.broadcast(EVENT_CHANNEL, this.stampClose(closed, batch), { afterNextPatch: true });
    this.atReplaySite("batchClose", () => this.broadcastPatch());
  }

  private async sendOpponentDeck(client: Client): Promise<void> {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat === undefined || this.spectatorClients.has(client.sessionId) || !this.state.gameOver) {
      return;
    }
    const opponentSeat = seat === 0 ? 1 : 0;
    const deck = this.initialDeckBySeat.get(opponentSeat);
    if (!deck) {
      return;
    }
    const owner = this.deckOwnerBySeat.get(opponentSeat);
    if (owner && (await this.accounts().preferences(owner)).shareDeckAfterMatch === false) {
      return;
    }
    if (this.clients.includes(client)) {
      client.send(OPPONENT_DECK_CHANNEL, structuredClone({ ...deck, deckId: null }));
    }
  }

  private replayMode(): ReplaySummary["mode"] {
    if (this.state.gameMode === GameMode.MANUAL.value) {
      return GameMode.MANUAL.value;
    }
    if (this.isTournamentRoom) return "tournament";
    if (this.isRankedRoom) return "ranked";
    if (this.isBotRoom) return "bot";
    if (this.isPrivate) return "private";
    if (this.isUnlimitedRoom) return "unlimited";
    return this.isBetaBattleRoom ? "beta" : "casual";
  }

  private sendReplayDownload(client: Client): void {
    if (this.spectatorClients.has(client.sessionId)) {
      void this.sendSpectatorReplay(client).catch((error: unknown) =>
        this.debugError("spectator replay failed", error),
      );
      return;
    }
    const seat = this.seatByClient.get(client.sessionId);
    if (
      seat === undefined ||
      this.spectatorClients.has(client.sessionId) ||
      !this.state.gameOver ||
      !this.replayFinished
    )
      return;
    if (!this.replayDownloads.has(seat)) {
      this.replayDownloads.set(seat, this.buildParticipantReplayDownload(seat));
    }
    // Snapshot the account before I/O: onLeave clears accountByClient synchronously.
    const owner = this.accountByClient.get(client.sessionId);
    void this.replayDownloads
      .get(seat)!
      .then(async (message) => {
        if (message.kind !== "ready" || !owner) return message;
        const indexId = await this.replayIndex(seat, owner, message);
        return indexId ? { ...message, indexId } : message;
      })
      .then((message) => {
        if (this.clients.includes(client)) client.send(REPLAY_CHANNEL, message);
      })
      .catch((error: unknown) => this.debugError("[AegisRoom] failed to export replay", error));
  }

  private async buildParticipantReplayDownload(seat: Seat): Promise<ReplayDownloadMessage> {
    const snapshots = structuredClone(this.initialDeckBySeat);
    const sharedSeats = await Promise.all(
      ([0, 1] as const).map(async (ownerSeat) => {
        const owner = this.deckOwnerBySeat.get(ownerSeat);
        if (ownerSeat === seat || !owner) {
          return true;
        }
        try {
          return (await this.accounts().preferences(owner)).shareDeckAfterMatch !== false;
        } catch {
          return false;
        }
      }),
    );
    const decks = buildReplayDecks({ decks: snapshots, sharedSeats, viewerSeat: seat });
    const file = this.replayRecording?.participantFile(this.replayMode(), seat, Date.now(), decks);
    return file ? replayDownload(file, seat) : { kind: "unavailable", reason: "recording_limit" };
  }

  private async sendSpectatorReplay(client: Client): Promise<void> {
    const owner = this.spectatorIdentities.get(client.sessionId)?.id;
    if (!this.state.gameOver || !this.replayFinished || !this.replayRecording) {
      return;
    }
    if (
      !(await canSpectatePlayers({
        accounts: this.accounts(),
        ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
        viewerId: owner,
      }))
    ) {
      return;
    }
    const preferences: AccountPreferences[] = await Promise.all(
      ([0, 1] as const).map(async (seat): Promise<AccountPreferences> => {
        const id = this.deckOwnerBySeat.get(seat);
        return id ? this.accounts().preferences(id) : {};
      }),
    );
    const hiddenIdentities = preferences.map((entry) => entry.hideIdentityFromSpectators === true);
    const sharedSeats = preferences.map(
      (entry, seat) => entry.shareDeckAfterMatch !== false && !hiddenIdentities[seat],
    );
    const key = [...hiddenIdentities, ...sharedSeats].join(":");
    let pending = this.spectatorReplayDownloads.get(key);
    if (!pending) {
      const file = this.replayRecording.spectatorFile({
        mode: this.replayMode(),
        hiddenIdentities,
        decks: buildReplayDecks({ decks: this.initialDeckBySeat, sharedSeats }),
      });
      if (!file) {
        if (this.clients.includes(client)) {
          client.send(REPLAY_CHANNEL, { kind: "unavailable", reason: "recording_limit" });
        }
        return;
      }
      pending = replayDownload(file, SPECTATOR_REPLAY_SEAT);
      this.spectatorReplayDownloads.set(key, pending);
    }
    const message = await pending;
    if (
      message.kind !== "ready" ||
      !(await canSpectatePlayers({
        accounts: this.accounts(),
        ownerIds: [this.deckOwnerBySeat.get(0), this.deckOwnerBySeat.get(1)],
        viewerId: owner,
      }))
    ) {
      return;
    }
    const indexId = owner ? await this.replayIndex(SPECTATOR_REPLAY_SEAT, owner, message) : undefined;
    if (this.clients.includes(client)) {
      client.send(REPLAY_CHANNEL, { ...message, ...(indexId ? { indexId } : {}) });
    }
  }

  protected replays(): Pick<ReplayLibrary, "record"> {
    return replayLibrary;
  }

  /** A failed index write still delivers the file; the player can download it or save it to Drive as a guest would. */
  private replayIndex(
    seat: Seat | -1,
    owner: string,
    message: Extract<ReplayDownloadMessage, { kind: "ready" }>,
  ): Promise<string | undefined> {
    const key = `${seat}:${owner}`;
    let pending = this.replayIndexes.get(key);
    if (!pending) {
      pending = this.replays()
        .record(owner, message, {
          format: this.state.format as DeckFormat,
          playerAccountIds: [this.deckOwnerBySeat.get(0) ?? null, this.deckOwnerBySeat.get(1) ?? null],
        })
        .catch((error: unknown) => {
          this.replayIndexes.delete(key);
          this.debugError("[AegisRoom] failed to index replay", error);
          return undefined;
        });
      this.replayIndexes.set(key, pending);
    }
    return pending;
  }

  /** The close is part of the batch it ends, so it takes the next `seq` and that batch's id. */
  private stampClose(event: ServerEvent, batch: OpenBatch): SequencedServerEvent {
    this.eventSeq += 1;
    const stamped = { ...event, seq: this.eventSeq, batch: batch.id, stateVersion: this.state.stateVersion };
    this.debug("engine.event", stamped);
    return stamped;
  }

  /**
   * Hand a resumed client everything still open on it: the pending decision, the open combat
   * prompt, and the security check it may have reconnected into. Their richer channel messages
   * were sent while this socket was down and are never redelivered.
   */
  private resendOpenPrompts(client: Client, seat: Seat): void {
    const pending = this.state.pendingDecision;
    const request = this.pendingDecisionRequest;
    if (pending && pending.seat === seat && request?.decisionId === pending.decisionId) {
      client.send(DECISION_CHANNEL, { ...request, stateVersion: this.state.stateVersion });
    }
    // Not gated on the seat: a check is a scene both sides watch, and the attacker's client
    // holds its own view of it open just as the defender's does.
    const reveal = this.openSecurityReveal;
    if (reveal) this.withBatch(() => client.send(EVENT_CHANNEL, this.stamp(reveal)), client);
    const window = this.state.combatWindow;
    if (!window || window.seat !== seat) return;
    const event = combatWindowEvent(window);
    if (event) this.withBatch(() => client.send(EVENT_CHANNEL, this.stamp(event)), client);
  }

  /**
   * Keep the answer-timeout armed for exactly the combat window that is open. Driven off the
   * mirrored state rather than off individual event kinds, so every way a window closes — an
   * answer, an attack that ended early, the match ending — disarms it.
   */
  private syncCombatWindowTimeout(): void {
    const window = this.state.combatWindow;
    const key = window && !this.state.gameOver ? combatWindowKey(window) : undefined;
    if (key === this.combatWindowTimeoutKey) return;
    this.combatWindowTimeout?.clear();
    this.combatWindowTimeout = undefined;
    this.combatWindowTimeoutKey = key;
    if (key === undefined) return;
    let fired = false;
    this.combatWindowTimeout = this.clock.setTimeout(() => {
      if (fired) return;
      fired = true;
      this.combatWindowTimeout = undefined;
      this.combatWindowTimeoutKey = undefined;
      if (!this.state.gameOver)
        this.withBatch(() => {
          this.recordReplayInput({ kind: "expireCombatWindow" });
          this.engine.expireCombatWindow();
        });
    }, this.COMBAT_WINDOW_TIMEOUT_SECONDS * 1000);
  }

  /**
   * Keep a full-state encode failure inside this room. Colyseus sends a joining or
   * reconnecting client its full state from the raw socket message handler, so a throw there
   * is an uncaughtException, and the process handler exits — dropping every room on it.
   *
   * `sendFullState` is private in the Colyseus typings, hence the instance-level wrap. The
   * retry rebuilds the seat's view, which re-runs the detached-card repair; a state that still
   * cannot be encoded closes this room only.
   */
  private guardFullStateSync(): void {
    const room = this as unknown as { sendFullState(client: Client): void };
    const sendFullState = room.sendFullState.bind(this);
    room.sendFullState = (client) => {
      try {
        sendFullState(client);
        return;
      } catch (error) {
        this.debugError(`[AegisRoom] full state sync failed sessionId=${client.sessionId}; rebuilding view`, error);
      }
      try {
        const seat = this.seatByClient.get(client.sessionId);
        if (seat !== undefined || this.spectatorClients.has(client.sessionId)) this.assignView(client, seat);
        sendFullState(client);
      } catch (error) {
        this.debugError(`[AegisRoom] full state sync failed again sessionId=${client.sessionId}; closing room`, error);
        void this.disconnect(CloseCode.WITH_ERROR).catch((disconnectError: unknown) =>
          this.debugError("[AegisRoom] failed to close room after full state sync failure", disconnectError),
        );
      }
    };
  }

  private nextReplaySeq(): number {
    this.replaySeq += 1;
    return this.replaySeq;
  }

  /**
   * Log an engine input the room issues itself, before it is applied, so `extractReplay` can feed
   * it back in order. Intents are recorded by `applyLoggedIntent` instead.
   */
  private recordReplayInput(input: ReplayRoomInput): void {
    this.invalidateRollbackRequest();
    this.rollbackHistory?.append({
      ...input,
      ...this.rollbackPlacement(),
      ...(this.replaySite ? { site: this.replaySite } : {}),
    });
    this.debug("replay.input", {
      replaySeq: this.nextReplaySeq(),
      stateVersion: this.state.stateVersion,
      engineEvents: this.engineEvents,
      ...(this.replaySite ? { site: this.replaySite } : {}),
      ...input,
    } satisfies ReplayInputLine);
  }

  /**
   * Run room code that can reach the engine synchronously from inside the engine's own flow. A
   * `broadcastPatch` ticks the room clock, so any due room timer fires inside it.
   */
  private atReplaySite<T>(site: ReplaySite, run: () => T): T {
    const outer = this.replaySite;
    this.replaySite = site;
    try {
      return run();
    } finally {
      this.replaySite = outer;
    }
  }

  /** Log the deck a seat was just given; `player.join` names the session but not the seat. */
  private recordReplaySeat(seat: Seat, deck: ReplayDeck, deckRules: ReplayDeckRules, bot?: true): void {
    const player = this.state.players[seat];
    const snapshot = player && this.deckByClient.get(player.sessionId);
    this.deckStartedAtBySeat.set(seat, Date.now());
    this.initialDeckBySeat.set(
      seat,
      structuredClone(
        snapshot ?? {
          deckId: null,
          deckName: player?.displayName ?? "Opponent",
          format: this.state.format as DeckFormat,
          ...deck,
        },
      ),
    );
    const owner = player && this.accountByClient.get(player.sessionId);
    if (owner) {
      this.deckOwnerBySeat.set(seat, owner);
      if (!this.spectatorPrivacySubscriptions.has(owner)) {
        const receive = (event: SocialEvent) => {
          if (event.kind === "friendsChanged") {
            void this.publishSocialPresence().catch(() => undefined);
          }
        };
        this.spectatorPrivacySubscriptions.set(owner, receive);
        void this.presence?.subscribe(`social:account:${owner}`, receive);
      }
      void this.publishSocialPresence().catch(() => undefined);
    } else {
      this.deckOwnerBySeat.delete(seat);
    }
    this.rollbackHistory?.append({
      kind: "seat",
      seat,
      deck,
      deckRules,
      ...(bot ? { bot } : {}),
      ...this.rollbackPlacement(),
    });
    this.debug("replay.seat", {
      replaySeq: this.nextReplaySeq(),
      seat,
      deck: {
        mainDeck: [...deck.mainDeck],
        eggDeck: [...deck.eggDeck],
        ...(deck.mainDeckArts ? { mainDeckArts: [...deck.mainDeckArts] } : {}),
        ...(deck.eggDeckArts ? { eggDeckArts: [...deck.eggDeckArts] } : {}),
      },
      deckRules: {
        ...(deckRules.betaBattleMode !== undefined ? { betaBattleMode: deckRules.betaBattleMode } : {}),
        ...(deckRules.unlimited !== undefined ? { unlimited: deckRules.unlimited } : {}),
        ...(deckRules.format !== undefined ? { format: deckRules.format } : {}),
        ...(deckRules.banlistCards !== undefined ? { banlistCards: deckRules.banlistCards } : {}),
      },
      ...(bot ? { bot } : {}),
      stateVersion: this.state.stateVersion,
      engineEvents: this.engineEvents,
    } satisfies ReplaySeatLine);
  }

  private debug(...data: unknown[]): void {
    withMatchLog(this.state.matchLogId, this.roomId, () => log(...data));
  }

  /** Spectators and unseated clients have no clock; an unknown speed is ignored. */
  private handleAnimationSpeed(client: Client, payload: unknown): void {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat === undefined) return;
    const speed = (payload as { speed?: unknown } | null)?.speed;
    if (isEffectSpeed(speed)) this.animationSpeed[seat] = speed;
  }

  private handlePresentationReport(client: Client, payload: unknown): void {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat === undefined) return;
    const report = parsePresentationReport(payload);
    if (!report) return;
    for (const [botSeat, bot] of this.bots.entries()) if (botSeat !== seat) bot?.onOpponentPresentation(report);
    if (!report.failed && !report.cancelled) return;
    const now = Date.now();
    let window = this.presentationLogWindows.get(seat);
    if (!window || now - window.start >= 1000) {
      window = { start: now, count: 0 };
      this.presentationLogWindows.set(seat, window);
    }
    if (++window.count > 500) return;
    this.debug("client.animation", {
      seat,
      sessionId: client.sessionId,
      serverStateVersion: this.state.stateVersion,
      ...report,
    });
  }

  /**
   * Players and spectators may chat; anyone else is ignored. Messages inside the sender's
   * cooldown are dropped without a reply, and blocked words are masked before anyone, the
   * match log included, sees the text.
   */
  /**
   * Inactivity costs the match to the player the game is waiting on, as leaving would. With no
   * player connected, or when the deployment's drain deadline passes, the room closes without a
   * result: nothing is recorded, and the tournament scheduler voids an unfinished Tournament Game.
   */
  private enforceMatchLimits(): void {
    if (!this.matchStartRequested) return;
    const now = Date.now();
    this.drainingSince = canCreateRoom() ? undefined : (this.drainingSince ?? now);
    if (this.drainingSince !== undefined && now - this.drainingSince >= DRAINING_MATCH_LIMIT_MS) {
      this.expireMatch("draining");
      return;
    }
    if (this.state.gameOver) {
      this.gameOverAt ??= now;
      if (now - this.gameOverAt >= FINISHED_MATCH_LIMIT_MS) this.expireMatch("finished");
      return;
    }
    this.lastPlayerActionAt ??= now;
    if (now - this.lastPlayerActionAt < MATCH_INACTIVITY_LIMIT_MS) return;
    const awaitedSeat = this.state.pendingDecision?.seat ?? this.state.turnSeat;
    const playerConnected = this.clients.some((client) => this.seatByClient.has(client.sessionId));
    if (playerConnected && this.bots[awaitedSeat] === undefined) {
      log(`[MATCH_LIMIT] ${JSON.stringify({ roomId: this.roomId, outcome: "inactive_concede", seat: awaitedSeat })}`);
      this.concede(awaitedSeat);
      return;
    }
    this.expireMatch("inactive");
  }

  private expireMatch(reason: "inactive" | "draining" | "finished"): void {
    log(`[MATCH_LIMIT] ${JSON.stringify({ roomId: this.roomId, outcome: "expired", reason })}`);
    this.matchLimitInterval?.clear();
    void this.disconnect(MATCH_EXPIRED_CLOSE_CODE).catch((error: unknown) =>
      this.debugError("[AegisRoom] failed to close an expired match", error),
    );
  }

  private admitClientMessage(client: Client): boolean {
    if (this.allowClientMessage(client.sessionId)) return true;
    if (!this.allowDroppedClientMessage(client.sessionId)) {
      log(`[MESSAGE_FLOOD] ${JSON.stringify({ roomId: this.roomId, sessionId: client.sessionId })}`);
      client.leave(MESSAGE_FLOOD_CLOSE_CODE);
    }
    return false;
  }

  private handleChat(client: Client, payload: unknown): void {
    const sender = this.chatSender(client);
    if (!sender) return;
    const parsed = parseChatMessage(payload);
    if (!parsed) return;
    const message: ChatMessage =
      parsed.kind === "text" ? { kind: "text", text: maskBlockedWords(parsed.text) } : parsed;
    // A player's cooldown follows the seat, so a reconnect cannot reset it.
    const cooldownKey = sender.kind === "player" ? `seat:${sender.seat}` : client.sessionId;
    const now = Date.now();
    const lastChatAt = this.lastChatAtBySender.get(cooldownKey);
    if (lastChatAt !== undefined && now - lastChatAt < CHAT_COOLDOWN_MS) return;
    this.lastChatAtBySender.set(cooldownKey, now);
    this.debug("client.chat", { sender, sessionId: client.sessionId, ...message });
    const broadcast: ChatBroadcast = { sender, message };
    for (const recipient of this.clients) {
      const receivesPlayerChat = this.seatByClient.has(recipient.sessionId);
      const receivesSpectatorChat = this.spectatorClients.has(recipient.sessionId) && !receivesPlayerChat;
      if ((sender.kind === "player" && receivesPlayerChat) || (sender.kind === "spectator" && receivesSpectatorChat)) {
        recipient.send(CHAT_CHANNEL, broadcast);
      }
    }
  }

  private speakBotLines(event: ServerEvent): void {
    if (this.isTournamentRoom) return;
    if (event.kind === "matchStarted") this.spokenBotLines.clear();
    const isBoss = this.storyBattleId
      ? getStoryBattleDifficulty({ battleId: this.storyBattleId })?.value === StoryDifficulty.BOSS.value
      : false;
    for (const seat of [0, 1] as const) {
      if (!this.bots[seat] || !this.state.players[seat]?.botPersonaId) continue;
      const spoken = getBotLine({
        event,
        botSeat: seat,
        securityCounts: [this.state.players[0]?.security.length ?? 0, this.state.players[1]?.security.length ?? 0],
        turnCount: this.state.turnCount,
        isBoss,
      });
      if (!spoken || this.spokenBotLines.has(spoken.key)) continue;
      const cooldownKey = `seat:${seat}`;
      const now = Date.now();
      const lastChatAt = this.lastChatAtBySender.get(cooldownKey);
      if (spoken.line.isRepeatable && lastChatAt !== undefined && now - lastChatAt < CHAT_COOLDOWN_MS) continue;
      this.spokenBotLines.add(spoken.key);
      this.lastChatAtBySender.set(cooldownKey, now);
      const cardName = spoken.cardId ? (getCardDefinition(spoken.cardId)?.nameEn ?? "") : "";
      const message: ChatMessage = {
        kind: "botLine",
        line: spoken.line.value,
        text: spoken.line.text.replace("{card}", cardName),
        ...(spoken.cardId ? { cardId: spoken.cardId } : {}),
      };
      this.debug("bot.chat", { seat, ...message });
      const broadcast: ChatBroadcast = { sender: { kind: "player", seat }, message };
      for (const recipient of this.clients) {
        if (this.seatByClient.has(recipient.sessionId)) recipient.send(CHAT_CHANNEL, broadcast);
      }
    }
  }

  private chatSender(client: Client): ChatSender | undefined {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat !== undefined) return { kind: "player", seat };
    if (!this.spectatorClients.has(client.sessionId)) return;
    let number = this.spectatorNumbers.get(client.sessionId);
    if (number === undefined) {
      number = ++this.spectatorsNumbered;
      this.spectatorNumbers.set(client.sessionId, number);
    }
    const name = this.spectatorChatName(client.sessionId);
    return { kind: "spectator", sessionId: client.sessionId, number, ...(name ? { name } : {}) };
  }

  /** The spectator's join name, cleaned, or nothing when it is empty, offensive or a player's. */
  private spectatorChatName(sessionId: string): string | undefined {
    const name = Array.from(normalizeChatText(this.spectatorJoinNames.get(sessionId) ?? ""))
      .slice(0, SPECTATOR_NAME_MAX_LENGTH)
      .join("")
      .trim();
    const folded = name.toLocaleLowerCase();
    if (!name || hasBlockedWord(name)) return;
    if (this.state.players.some((player) => player?.displayName.trim().toLocaleLowerCase() === folded)) return;
    return name;
  }

  private recordConnectionDrop({ seat, accountId, closeCode }: ConnectionDropParams): Promise<number | undefined> {
    const store = this.connectionDrops();
    if (!store) {
      return Promise.resolve(undefined);
    }
    return store
      .recordDrop({
        roomId: this.roomId,
        matchId: this.state.matchLogId,
        accountId,
        displayName: this.state.players[seat]?.displayName ?? "",
        seat,
        closeCode,
        droppedAt: Date.now(),
      })
      .catch((error: unknown) => {
        this.debugError("[AegisRoom] failed to record connection drop", error);
        return undefined;
      });
  }

  private resolveConnectionDrop(drop: Promise<number | undefined>, outcome: ResolvedConnectionDropOutcome): void {
    const resolvedAt = Date.now();
    void drop
      .then((id) => (id === undefined ? undefined : this.connectionDrops()?.resolveDrop({ id, outcome, resolvedAt })))
      .catch((error: unknown) => this.debugError("[AegisRoom] failed to resolve connection drop", error));
  }

  private handleConnectionReport(client: Client, payload: unknown): void {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat === undefined) {
      return;
    }
    const drop = this.reportableDropBySeat.get(seat);
    this.reportableDropBySeat.delete(seat);
    const report = parseConnectionReport(payload);
    if (!drop || !report) {
      return;
    }
    void drop
      .then((id) => (id === undefined ? undefined : this.connectionDrops()?.recordClientReport({ id, report })))
      .catch((error: unknown) => this.debugError("[AegisRoom] failed to record connection report", error));
  }

  private debugError(...data: unknown[]): void {
    withMatchLog(this.state.matchLogId, this.roomId, () => logError(...data));
  }

  private getInactivityInputKey(seat: Seat | undefined): string | undefined {
    if (seat === undefined) {
      return undefined;
    }
    if (this.state.pendingDecision) {
      return `decision:${this.state.pendingDecision.decisionId}`;
    }
    if (this.state.combatWindow) {
      return `combat:${combatWindowKey(this.state.combatWindow)}`;
    }
    return `${seat}:${this.state.turnCount}:${this.state.phase}`;
  }

  private syncMatchClock(): void {
    if (this.rankedRoundClock && !this.state.gameOver) {
      const now = Date.now();
      if (this.rankedPairId && now - this.rankedHeartbeatAt >= 15_000) {
        this.rankedHeartbeatAt = now;
        void new RankedStore(this.accounts())
          .heartbeat(this.rankedPairId, this.roomId, now)
          .catch((error: unknown) => this.debugError("[ranked] heartbeat failed", error));
      }
      const safe = this.engine.inputSeat !== undefined && !this.state.pendingDecision && !this.state.combatWindow;
      if (this.rankedRoundClock.shouldDraw({ now, turn: this.state.turnCount, safe })) {
        this.recordReplayInput({ kind: "expireRankedRound" });
        this.withBatch(() => this.engine.win.declareDraw("timeout"));
      }
      this.state.rankedOvertimeTurn = this.rankedRoundClock.getOvertimeTurn() ?? -1;
      const deadline = this.state.rankedDeadlineAt + (this.state.rankedOvertimeTurn >= 0 ? 6 * 60_000 : 0);
      this.state.rankedRemainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
    }
    const seat = this.matchStartRequested ? this.engine.inputSeat : undefined;
    const inputKey = this.getInactivityInputKey(seat);
    const expired = this.matchClock?.update(performance.now(), seat, this.clockMode(seat), inputKey);
    if (expired !== undefined && !this.state.gameOver) {
      if (expired.clock === "mulligan") {
        this.recordReplayInput({ kind: "expireMulliganWindow", seat: expired.seat });
        this.withBatch(() => this.engine.applyIntent(expired.seat, { type: "mulligan", keep: true }));
      } else {
        this.recordReplayInput({ kind: "expireMatchTimer", seat: expired.seat });
        this.withBatch(() => this.engine.expireMatchTimer(expired.seat));
      }
    }
    if (this.state.gameOver) {
      this.matchClockInterval?.clear();
      if (this.accountByClient.size && (getRankedConfig().enabled || this.rankedPairId)) {
        void this.accounts()
          .pool.query("DELETE FROM account_active_rooms WHERE room_id=$1", [this.roomId])
          .catch((error: unknown) => this.debugError("[rooms] finished account release failed", error));
      }
    }
  }

  /**
   * A seat never loses time waiting on an opponent who dropped. The dropped seat's own
   * clock keeps running, so leaving costs the leaver, not the player left behind.
   */
  private clockMode(seat: Seat | undefined): ClockMode {
    if (seat === undefined) return "match";
    if (this.state.players[1 - seat]?.connected === false) return "frozen";
    return this.state.pendingDecision?.kind === "mulligan" ? "mulligan" : "match";
  }

  private applyLoggedIntent(seat: Seat, intent: Intent) {
    return withMatchLog(this.state.matchLogId, this.roomId, () => {
      this.syncMatchClock();
      if (this.state.rollbackBusy || this.rollbackPending)
        return { ok: false as const, reason: "wrong-phase" as const };
      const actionIndex = this.rollbackHistory?.inputs.length;
      const recorded: ReplayInput = { kind: "intent", seat, intent, ...this.rollbackPlacement() };
      this.rollbackHistory?.append(recorded, this.engine);
      const started = performance.now();
      const replaySeq = this.nextReplaySeq();
      log("intent.received", {
        seat,
        intent,
        stateVersion: this.state.stateVersion,
        replaySeq,
        engineEvents: this.engineEvents,
      });
      try {
        const inputSeat = this.engine.inputSeat;
        const result = this.withBatch(() => this.engine.applyIntent(seat, intent));
        if (actionIndex !== undefined) {
          const entry = this.rollbackHistory?.inputs[actionIndex];
          if (entry?.kind === "intent") {
            entry.ok = result.ok;
            if (!result.ok) entry.reason = result.reason;
          }
          if (
            result.ok &&
            this.state.turnCount > 0 &&
            intent.type !== "ready" &&
            intent.type !== "mulligan" &&
            intent.type !== "surrender"
          )
            this.rollbackHistory?.acceptAction(actionIndex);
        }
        if (
          result.ok &&
          seat === inputSeat &&
          intent.type !== "ready" &&
          intent.type !== "mulligan" &&
          intent.type !== "surrender"
        ) {
          this.matchClock?.resetInactivity();
        }
        this.refreshRollbackAvailability();
        this.atReplaySite("afterIntent", () => this.syncMatchClock());
        log("intent.result", {
          seat,
          type: intent.type,
          result,
          durationMs: performance.now() - started,
          stateVersion: this.state.stateVersion,
          replaySeq,
        });
        return result;
      } catch (error) {
        logError("intent.failed", { seat, intent, replaySeq }, error);
        throw error;
      }
    });
  }

  private guardedEngineHooks(): GameEngineHooks {
    const generation = this.engineGeneration;
    const current = () => generation === this.engineGeneration;
    return {
      ...this.engineHooks,
      deferHandAffordances: true,
      emit: (event) => {
        if (current()) this.engineHooks.emit(event);
      },
      requestDecision: (seat, request) => {
        if (current()) this.engineHooks.requestDecision(seat, request);
      },
      beforeTurn: (turn) => {
        if (current()) return this.engineHooks.beforeTurn?.(turn);
      },
      onBothReady: () => {
        if (current()) this.engineHooks.onBothReady?.();
      },
      onActionSettled: (seat, type) => {
        if (current()) this.engineHooks.onActionSettled?.(seat, type);
      },
    };
  }

  private guardedVisibilityPort(): VisibilityPort {
    const generation = this.engineGeneration;
    return (ownerSeat, zone, card) => {
      if (generation === this.engineGeneration) this.exposeCardToClients(ownerSeat, zone, card);
    };
  }

  private rollbackPlacement() {
    return {
      stateVersion: this.state.stateVersion - (this.rollbackHistory?.versionOffset ?? 0),
      engineEvents: this.engineEvents,
    };
  }

  private invalidateRollbackRequest(): void {
    this.rollbackPending = undefined;
    this.state.rollbackRequestId = "";
    this.state.rollbackRequesterSeat = -1;
    this.state.rollbackKind = "";
  }

  private refreshRollbackAvailability(): void {
    const enabled = this.state.allowRollback && !this.state.gameOver && this.state.turnCount > 0;
    const action = enabled ? this.rollbackHistory?.target(RollbackKind.ACTION.value, this.state.turnCount) : undefined;
    const turn = enabled ? this.rollbackHistory?.target(RollbackKind.TURN.value, this.state.turnCount) : undefined;
    this.state.undoActionSeat = action ? (this.rollbackHistory?.targetSeat(action) ?? -1) : -1;
    this.state.rollbackTurnSeat = turn ? (this.rollbackHistory?.targetSeat(turn) ?? -1) : -1;
    this.state.canUndoAction = this.state.undoActionSeat !== -1;
    this.state.canRollbackTurn = this.state.rollbackTurnSeat !== -1;
    if (this.state.gameOver) this.invalidateRollbackRequest();
  }

  private async handleRollback(client: Client, payload: unknown): Promise<void> {
    const seat = this.seatByClient.get(client.sessionId);
    if (
      seat === undefined ||
      !this.state.allowRollback ||
      this.isRankedRoom ||
      this.isTournamentRoom ||
      this.state.gameOver ||
      this.state.rollbackBusy ||
      !this.rollbackHistory ||
      typeof payload !== "object" ||
      payload === null
    )
      return;
    const message = payload as Record<string, unknown>;
    if (message.revision !== this.state.rollbackRevision || this.state.players.some((player) => !player.connected))
      return;
    if (message.type === "cancel") {
      if (this.rollbackPending?.seat === seat && this.rollbackPending.id === message.requestId)
        this.invalidateRollbackRequest();
      return;
    }
    if (message.type === "respond") {
      const pending = this.rollbackPending;
      if (!pending || pending.id !== message.requestId || pending.seat === seat || typeof message.accept !== "boolean")
        return;
      if (!message.accept) {
        this.invalidateRollbackRequest();
        return;
      }
      await this.performRollback(pending.target);
      return;
    }
    if (message.type !== "request" || this.rollbackPending) return;
    const kind = message.kind;
    if (kind !== RollbackKind.ACTION.value && kind !== RollbackKind.TURN.value) return;
    const target = this.rollbackHistory.target(kind, this.state.turnCount);
    if (!target || this.rollbackHistory.targetSeat(target) !== seat) return;
    const opponent = (1 - seat) as Seat;
    if (this.bots[opponent]) {
      await this.performRollback(target);
      return;
    }
    this.rollbackPending = { id: `rollback-${++this.rollbackSequence}`, seat, target };
    this.state.rollbackRequestId = this.rollbackPending.id;
    this.state.rollbackRequesterSeat = seat;
    this.state.rollbackKind = kind;
  }

  private async performRollback(target: { index: number; turn?: number }): Promise<void> {
    const history = this.rollbackHistory;
    if (!history) return;
    this.state.rollbackBusy = true;
    this.invalidateRollbackRequest();
    const generation = this.engineGeneration;
    const source = this.engine;
    try {
      const rebuilt = await history.rebuild(target);
      if (generation !== this.engineGeneration || source.state.gameOver) {
        rebuilt.state.gameOver = true;
        rebuilt.engine.decisions.cancel();
        return;
      }
      const previous = this.state;
      const version = previous.stateVersion + 1;
      history.commit(target, rebuilt.state, version);
      history.versionOffset += rebuilt.resumeBatchOffset;
      this.engineGeneration += 1;
      for (const bot of this.bots) bot?.dispose();
      source.state.gameOver = true;
      source.decisions.cancel();
      source.combat.cancel();
      source.mainPhase.abort();
      source.breeding.abort();
      this.combatWindowTimeout?.clear();
      this.combatWindowTimeout = undefined;
      this.combatWindowTimeoutKey = undefined;
      this.openSecurityReveal = undefined;
      const restored = rebuilt.state;
      restored.matchId = previous.matchId;
      restored.matchLogId = previous.matchLogId;
      restored.roomCode = previous.roomCode;
      restored.spectatorCode = previous.spectatorCode;
      restored.series.assign(previous.series.toJSON());
      restored.allowRollback = true;
      restored.rollbackRevision = previous.rollbackRevision + 1;
      for (const seat of [0, 1] as const) {
        const identity = previous.players[seat]!;
        const player = restored.players[seat]!;
        player.sessionId = identity.sessionId;
        player.displayName = identity.displayName;
        player.avatarId = identity.avatarId;
        player.equippedRankedTier = identity.equippedRankedTier;
        player.botPersonaId = identity.botPersonaId;
        player.hideIdentityFromSpectators = identity.hideIdentityFromSpectators;
        player.spectatorNamesJson = identity.spectatorNamesJson;
        player.anonymousSpectatorCount = identity.anonymousSpectatorCount;
        player.connected = identity.connected;
      }
      restored.stateVersion = version;
      this.engine = rebuilt.engine;
      this.setState(restored);
      this.engineEvents = rebuilt.engineEvents;
      this.matchClock?.rebindAfterRollback(restored, previous, performance.now());
      this.pendingDecisionRequest = rebuilt.pendingRequest;
      this.engine.installVisibility(this.guardedVisibilityPort());
      for (const client of this.clients) {
        const seat = this.seatByClient.get(client.sessionId);
        if (seat !== undefined || this.spectatorClients.has(client.sessionId)) this.assignView(client, seat);
      }
      for (const seat of [0, 1] as const) this.bots[seat] = this.bots[seat]?.restartAfterRollback(restored);
      this.debug("replay.rollback", {
        replaySeq: this.nextReplaySeq(),
        index: target.index,
        versionOffset: history.versionOffset,
      });
      this.replayRecording?.capture(restored, []);
      this.broadcast(ROLLBACK_RESET_CHANNEL, { revision: restored.rollbackRevision });
      this.engine.syncCounts();
      for (const client of this.clients) {
        if (typeof client.raw === "function") {
          const room = this as unknown as { sendFullState(client: Client): void };
          room.sendFullState(client);
        }
      }
      this.broadcastPatch();
      rebuilt.activate(this.guardedEngineHooks());
      this.refreshRollbackAvailability();
      if (rebuilt.pendingRequest) this.requestDecision(rebuilt.pendingRequest.seat, rebuilt.pendingRequest);
      const windowEvent = restored.combatWindow ? combatWindowEvent(restored.combatWindow) : undefined;
      if (windowEvent) for (const bot of this.bots) bot?.onEvent(windowEvent);
      for (const bot of this.bots) bot?.resumeAfterRollback();
      this.syncCombatWindowTimeout();
    } catch (error) {
      this.debugError("[AegisRoom] rollback reconstruction refused", error);
      this.broadcast(ROLLBACK_CHANNEL, { type: "failed" });
    } finally {
      this.state.rollbackBusy = false;
      this.refreshRollbackAvailability();
    }
  }

  private handleIntent(client: Client, intent: Intent): void {
    const seat = this.seatByClient.get(client.sessionId);
    if (seat === undefined) {
      if (intent.type === "ready" && this.seriesSeatByClient.has(client.sessionId))
        this.seriesEarlyReady.add(client.sessionId);
      return;
    }
    if (intent.type === "ready" && this.guestApproval?.deferReady(client.sessionId)) {
      return;
    }
    const decisionId =
      intent.type === "respondDecision"
        ? intent.decisionId
        : intent.type === "mulligan"
          ? this.state.pendingDecision?.decisionId
          : undefined;
    const result = this.applyLoggedIntent(seat, intent);
    if (result.ok) this.lastPlayerActionAt = Date.now();
    if (!result.ok) {
      // A refusal is the offending client's alone, so it travels in its own batch rather
      // than in the (empty) batch of the intent it refused.
      this.withBatch(
        () =>
          client.send(
            EVENT_CHANNEL,
            this.stamp({
              kind: "actionRejected",
              intent: intent.type,
              reason: result.reason,
              ...(decisionId ? { decisionId } : {}),
            }),
          ),
        client,
      );
    }
  }

  /**
   * The revision the board will be at when the decision is asked. A decision is raised
   * inside the batch that produced it and `stateVersion` is bumped when that batch closes,
   * so an open broadcast batch means the answer belongs to the next revision.
   */
  private decisionStateVersion(): number {
    const open = this.currentBatch;
    return this.state.stateVersion + (open && !open.recipient ? 1 : 0);
  }

  private requestDecision(seat: Seat, req: DecisionRequest): void {
    this.debug("decision.requested", { seat, request: req });
    this.pendingDecisionRequest = req;
    if (req.kind !== "mulligan") this.matchClock?.grantDecisionBonus(seat);
    const bot = this.bots[seat];
    if (bot !== undefined) {
      this.debug(`[AegisRoom] requestDecision seat=${seat} kind=${req.kind} → bot`);
      bot.onDecisionRequested(req);
      return;
    }
    const client = this.clients.find((c) => this.seatByClient.get(c.sessionId) === seat);
    const handSize = this.state.players[seat]?.hand?.length ?? "?";
    if (!client) {
      this.debug(
        `[AegisRoom] requestDecision seat=${seat} kind=${req.kind} id=${req.decisionId} → NOT FOUND. clients=[${this.clients.map((c) => `${c.sessionId}(→seat${this.seatByClient.get(c.sessionId) ?? "?"})`).join(", ")}] seatByClientKeys=[${[...this.seatByClient.entries()].map(([sid, s]) => `${sid}→${s}`).join(", ")}]`,
      );
    } else {
      this.debug(
        `[AegisRoom] requestDecision seat=${seat} kind=${req.kind} id=${req.decisionId} → client ${client.sessionId} (handSize=${handSize})`,
      );
    }
    // Publish the matching pendingDecision before its richer unicast request.
    // Otherwise an older scheduled state patch can arrive after DECISION_CHANNEL,
    // and useRoom correctly treats that stale `pendingDecision = undefined` as the
    // decision having closed, making a real modal disappear before it can be used.
    this.atReplaySite("decisionRequest", () => this.broadcastPatch());
    // The engine awaits the matching "respondDecision" intent (correlated by decisionId).
    client?.send(DECISION_CHANNEL, { ...req, stateVersion: this.decisionStateVersion() });
  }
}

function isOptionalCardList(value: unknown): value is string[] | undefined {
  return (
    value === undefined || (Array.isArray(value) && value.length <= 60 && value.every((id) => typeof id === "string"))
  );
}

function validCommunityAttribution(value: AegisJoinOptions["community"]): AegisJoinOptions["community"] {
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length > 64 ||
    typeof value.author?.id !== "string" ||
    value.author.id.length > 64 ||
    typeof value.author.displayName !== "string" ||
    value.author.displayName.length > 100
  )
    return undefined;
  return { id: value.id, author: { id: value.author.id, displayName: value.author.displayName } };
}
