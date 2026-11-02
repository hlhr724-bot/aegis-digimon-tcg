import type { LiveMatchPlayerPreview } from "#shared/protocol/LiveMatchPlayerPreview";
import type { GameMode } from "#shared/manual/GameMode";
import type { DeckFormat } from "../deckFormat.js";

export const LIVE_MATCH_SPECTATOR_LIMIT = 20;
export const LIVE_MATCH_PAGE_SIZE = 10;
export const LIVE_MATCH_MAX_PAGE_SIZE = 50;

export type LiveMatch = {
  gameMode?: GameMode;
  spectatorCode: string;
  players: string[];
  playerPreviews?: LiveMatchPlayerPreview[];
  format: DeckFormat;
  startedAt: number;
  spectators: number;
};

export type LiveMatchPage = {
  matches: LiveMatch[];
  total: number;
};
