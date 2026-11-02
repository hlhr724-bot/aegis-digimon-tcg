import type { DeckFormat, DeckRuleMode, HistoricalDeckSet } from "#shared/deckFormat";
import type { TournamentCategory } from "#shared/tournaments/TournamentCategory";
import type { ParticipantKind, PhaseKind, TournamentStructure } from "#shared/tournaments/index";

export type TournamentResultExportCard = { cardId: string; count: number };

export type TournamentResultExportDecklist = {
  mainDeck: TournamentResultExportCard[];
  eggDeck: TournamentResultExportCard[];
};

export type TournamentResultExportEvent = {
  id: string;
  name: string;
  organizerDisplayName: string;
  category: TournamentCategory;
  format: DeckFormat;
  cardPool: HistoricalDeckSet | "all";
  deckRules: DeckRuleMode;
  structure: TournamentStructure;
  bestOf: number;
  topCutSize: number | null;
  scheduledStartAt: number;
  startedAt: number | null;
  finishedAt: number;
};

export type TournamentResultExportParticipant = {
  participantId: string;
  displayName: string;
  accountId: string | null;
  kind: ParticipantKind;
  placement: number | null;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  dropped: boolean;
  disqualified: boolean;
  decklist: TournamentResultExportDecklist | null;
};

export type TournamentResultExportMatchResult = "player1" | "player2" | "draw" | "double_loss" | "bye" | "unresolved";

export type TournamentResultExportMatch = {
  round: number;
  phase: PhaseKind;
  table: number;
  player1ParticipantId: string | null;
  player2ParticipantId: string | null;
  player1GamesWon: number;
  player2GamesWon: number;
  winnerParticipantId: string | null;
  result: TournamentResultExportMatchResult;
  bye: boolean;
};

export type TournamentResultExport = {
  schemaVersion: 1;
  exportedAt: number;
  event: TournamentResultExportEvent;
  participants: TournamentResultExportParticipant[];
  matches: TournamentResultExportMatch[];
};
