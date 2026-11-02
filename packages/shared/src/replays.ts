import type { DeckStatsWindow } from "#shared/decks/DeckStatsWindow";
import type { ReplayDecks } from "#shared/replays/ReplayDeck";
import type { DeckPerformanceRecord } from "#shared/decks/DeckPerformanceRecord";
import type { DeckHistoryDetails } from "#shared/decks/DeckHistoryDetails";
import type { ReplayViewerSeat } from "#shared/replays/ReplayViewerSeat";
import type { ReplayVisibility } from "#shared/replays/ReplayVisibility";
import { GameMode } from "#shared/manual/GameMode";
import type { GameState } from "./schema/GameState.js";
import type { Seat } from "./schema/enums.js";
import type { SequencedServerEvent } from "./protocol/events.js";
import type { DigimonWorldAvatarId } from "./account/avatars.js";

export const REPLAY_CHANNEL = "replay";
export const REPLAY_FORMAT_VERSION = 1;
export const MAX_REPLAY_BYTES = 32 * 1024 * 1024;
/** Default and largest page of `GET /account/replays`. */
export const REPLAY_PAGE_SIZE = 20;
export const MAX_REPLAY_PAGE_SIZE = 50;

/**
 * One entry of the player's replay index. The file itself lives only in the player's Google
 * Drive (`driveFileId`); the server keeps the metadata so every device can list the library.
 */
export interface SavedReplay {
  id: string;
  matchId: string;
  summary: ReplaySummary;
  viewerSeat: ReplayViewerSeat;
  bytes: number;
  savedAt: number;
  driveFileId: string;
  visibility: ReplayVisibility;
}

export interface ReplayLibraryPage {
  replays: SavedReplay[];
  /** Present while older saved replays remain. */
  nextCursor?: string;
  /** The server can serve public replays from Drive; without it the share control is hidden. */
  sharing: boolean;
  friendsSharing?: boolean;
}

/** `GET /replays/:id`: the owner reads the file from Drive with their own token; others use the proxy. */
export interface SharedReplay extends SavedReplay {
  owned: boolean;
}

/** Finished matches kept per account. Matches with a saved replay stay even beyond it. */
export const MATCH_HISTORY_LIMIT = 100;
/** Default and largest page of `GET /account/matches`. */
export const MATCH_PAGE_SIZE = 25;
export const MAX_MATCH_PAGE_SIZE = 50;
export const MATCH_RESULTS = ["win", "loss", "draw"] as const;
export const MATCH_MODES = [
  "casual",
  "private",
  "ranked",
  "bot",
  "tournament",
  "unlimited",
  "beta",
  GameMode.MANUAL.value,
] as const satisfies readonly ReplaySummary["mode"][];
/** Longest opponent search `GET /account/matches` accepts, the longest display name. */
export const MATCH_OPPONENT_SEARCH_MAX = 32;
/** Optional narrowing of the history; an absent field matches everything. */
export interface MatchHistoryFilter {
  result?: (typeof MATCH_RESULTS)[number];
  mode?: ReplaySummary["mode"];
  opponent?: string;
  deckId?: string;
  deckWindow?: DeckStatsWindow;
}

/** One finished match from the account's point of view. */
export interface MatchHistoryRecord {
  canAddOpponent?: boolean;
  deckName?: string;
  id: string;
  mode: ReplaySummary["mode"];
  opponentName: string;
  opponentKind: "human" | "bot";
  opponentAvatarId?: DigimonWorldAvatarId;
  result: (typeof MATCH_RESULTS)[number];
  reason: string;
  finishedAt: number;
}

export interface MatchHistoryEntry extends MatchHistoryRecord {
  hasOpponentDeck?: boolean;
  hasOwnDeck?: boolean;
  replay: SavedReplay | null;
}

/** Human opponents in retained history, scoped by mode/opponent and ignoring result/pagination. */
export type MatchWinRate = Pick<MatchHistorySummary, "matches" | "wins" | "losses" | "draws">;

/** `GET /account/matches`: one numbered page; `total` counts the matches the filter selects. */
export interface MatchHistoryPage {
  winRate: MatchWinRate;
  decks?: Array<{ id: string; name: string }>;
  deckDetails?: DeckHistoryDetails;
  deckRecords?: DeckPerformanceRecord[];
  recentDeckResults?: Array<MatchHistoryRecord["result"]>;
  deckStats?: { total: MatchWinRate; sinceChange: MatchWinRate | null };
  matches: MatchHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  /** The server can serve public replays from Drive; without it the share control is hidden. */
  sharing: boolean;
  friendsSharing?: boolean;
}

/** Totals over the kept match history, for the profile header. */
export interface MatchHistorySummary {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  replaysSaved: number;
}

/** Plain serialized state; consumers read fields and never call Schema methods. */
export interface ReplayFrame {
  atMs: number;
  state: GameState;
  events: SequencedServerEvent[];
}

export interface ReplaySummary {
  deckIcons?: [string | null, string | null];
  id: string;
  players: [string, string];
  mode: "casual" | "private" | "ranked" | "bot" | "tournament" | "unlimited" | "beta" | typeof GameMode.MANUAL.value;
  startedAt: number;
  finishedAt: number;
  winnerSeat: number;
  frameCount: number;
}

/** Completed participant recording; visibleHandSeats declares the hands included in the file. */
export interface MatchReplay extends ReplaySummary {
  decks?: ReplayDecks;
  format: "aegis-replay";
  version: typeof REPLAY_FORMAT_VERSION;
  frames: ReplayFrame[];
  viewerSeat: ReplayViewerSeat;
  visibleHandSeats: Seat[];
}

export type ReplayDownloadMessage =
  | {
      kind: "ready";
      summary: ReplaySummary;
      viewerSeat: ReplayViewerSeat;
      indexId?: string;
      /** gzip-compressed UTF-8 JSON, base64 encoded for the Colyseus channel. */
      data: string;
    }
  | { kind: "unavailable"; reason: "recording_limit" };
