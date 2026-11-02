import type { GameMode } from "@aegis/shared/manual/GameMode";
/**
 * Join payload sent to client.joinOrCreate(ROOM_TYPE, options). Mirrors
 * AegisJoinOptions declared on the server room (API-CONTRACT.md section 1). The
 * web package may not import @aegis/api, so the shape is restated here; both sides
 * must agree on it.
 */
export interface AegisJoinOptions {
  rankedPairId?: string;
  rankedToken?: string;
  rankedRegion?: import("@aegis/shared/ranked/RankedRegion").RankedRegion;
  tournamentGameId?: string;
  tournamentGameToken?: string;
  gameMode?: GameMode;
  storyBattleId?: string;
  storyGuestToken?: string;
  allowRollback?: boolean;
  requireApproval?: boolean;
  spectator?: boolean;
  displayName: string;
  avatarId?: string;
  deck: { mainDeck: string[]; eggDeck: string[]; mainDeckArts?: string[]; eggDeckArts?: string[] }; // arrays of card ids
  deckId?: string;
  deckName?: string;
  community?: import("@aegis/shared/decks/UsedDeck").UsedDeck["community"];
  /** Joins a private room by code, or reopens a finished one under its code. */
  roomCode?: string;
  matchTimer?: boolean;
  timerStartSeconds?: number;
  timerRefillSeconds?: number;
  /** Casual and private rooms play one game or a best-of-three; anything else plays one. */
  bestOf?: 1 | 3;
  /** A later game of a best-of-three: the seat token its series handed this player. */
  seriesToken?: string;
  ranked?: boolean;
  betaBattleMode?: boolean;
  unlimited?: boolean;
  format?: import("@aegis/shared").DeckFormat;
  botDeck?: AegisJoinOptions["deck"];
  authTicket?: string;
  /** How this client paces a chain of triggered effects; a bot opponent follows `sequential` pacing. */
  presentationPacing?: "current" | "sequential";
  /** Dev-only: ask a bot room for a hand-laid board instead of the pre-game procedure. */
  devScenario?: "local-fixture";
}
