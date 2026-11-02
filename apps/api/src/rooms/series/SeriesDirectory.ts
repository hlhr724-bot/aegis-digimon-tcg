import { LocalPresence, type Presence } from "colyseus";
import type { MatchBestOf, Seat } from "@aegis/shared";
import type { SeatJoinOptions } from "../../engine/GameEngine.js";
import type { GameResult } from "./seriesRules.js";

/** What a seat brings to every game of its series. The deck is the one it played game 1 with. */
export interface SeriesSeat {
  token: string;
  /** Trusted account identity captured by the first room, never supplied by a client. */
  accountId?: string;
  displayName: string;
  avatarId?: string;
  deck: SeatJoinOptions["deck"];
  deckId?: string;
  deckName?: string;
  community?: import("@aegis/shared/decks/UsedDeck").UsedDeck["community"];
  presentationPacing?: "current" | "sequential";
}

/**
 * A casual best-of-three between two games. It is written by the room that owns the series'
 * current game and read by the room that opens the next one, which may live on another process
 * of the slot.
 */
export interface SeriesRecord {
  id: string;
  /** Proves a create request came from the previous game's room and not from a client. */
  nonce: string;
  roomName: string;
  bestOf: MatchBestOf;
  allowRollback?: boolean;
  matchTimer: boolean;
  timerStartSeconds: number;
  unlimited?: boolean;
  format?: import("@aegis/shared").DeckFormat;
  /** A private series reopens every game under the same code. */
  roomCode?: string;
  results: GameResult[];
  seats: [SeriesSeat, SeriesSeat];
  /** Who goes first in the game being opened. */
  firstSeat?: Seat;
}

export interface SeriesDirectory {
  save(record: SeriesRecord): Promise<void>;
  load(id: string): Promise<SeriesRecord | undefined>;
  remove(id: string): Promise<void>;
}

/** A forgotten series is never resumed, so its record only has to outlive the gap between games. */
const RECORD_TTL_SECONDS = 2 * 60 * 60;

/**
 * Series records kept in the slot's presence, which is Redis in a cluster and process memory
 * otherwise. Slots never share presence, so a series always continues in the slot it began in.
 */
export function createSeriesDirectory(presence: Presence, keyPrefix = ""): SeriesDirectory {
  const keyOf = (id: string) => `${keyPrefix}series:${id}`;
  return {
    save: async (record) => {
      await presence.setex(keyOf(record.id), JSON.stringify(record), RECORD_TTL_SECONDS);
    },
    load: async (id) => {
      const stored: unknown = await presence.get(keyOf(id));
      return typeof stored === "string" ? (JSON.parse(stored) as SeriesRecord) : undefined;
    },
    remove: async (id) => {
      await presence.del(keyOf(id));
    },
  };
}

let directory: SeriesDirectory = createSeriesDirectory(new LocalPresence());

/** Point every room at the slot's shared presence (called once, at boot). */
export function setSeriesDirectory(next: SeriesDirectory): void {
  directory = next;
}

export function seriesDirectory(): SeriesDirectory {
  return directory;
}
