// Tournament program contracts shared by server and client.
// Frozen before wave-1 fan-out; extend additively — parallel worktrees depend
// on these shapes not changing underneath them.

import type { TournamentRoundStartMode } from "#shared/tournaments/TournamentRoundStartMode";
import type { BotStyle } from "#shared/bot/BotStyle";
import type { TournamentCategory } from "#shared/tournaments/TournamentCategory";
import type { DeckFormat } from "#shared/deckFormat";
import type { TournamentClockSettings } from "#shared/tournaments/TournamentClockSettings";
import type { TournamentSpectatorPolicy } from "#shared/tournaments/TournamentSpectatorPolicy";

export type TournamentStructure = "swiss" | "single_elimination";

export type TournamentStatus = "draft" | "registration" | "check_in" | "running" | "finished" | "cancelled";
export type PhaseKind = "swiss" | "top_cut" | "single_elimination";
export type PhaseStatus = "scheduled" | "running" | "frozen" | "finished";
export type RoundStatus = "scheduled" | "published" | "resolving" | "closed";
export type MatchStatus = "scheduled" | "awaiting_players" | "playing" | "overtime" | "resolved";
export type GameStatus = "allocated" | "room_claimed" | "playing" | "finished" | "voided";
export type RegistrationStatus = "registered" | "checked_in" | "active" | "dropped" | "disqualified";
export type ParticipantKind = "human" | "bot";

// Which banlist governs deck legality in this tournament. Resolved to a
// concrete card list (via banlistAsOf) and FROZEN on the tournament at
// creation; later official banlist updates never change a created event.
// - none: no restrictions (casual / aegis_custom only)
// - current: banlist in force on the creation date
// - as_of_set: banlist in force on the given collection's release date
export type BanlistPolicy = { mode: "none" } | { mode: "current" } | { mode: "as_of_set"; setId: string };

export type TournamentBanlistCard = {
  cardId: string;
  status: "restricted" | "banned" | "banned_pair";
  allowedCopies: number;
  // For banned_pair: the partner card ids in force at the frozen date. The
  // snapshot must be self-contained — deck validation reads THIS, never the
  // live banlist table, so later pair additions cannot retroactively change
  // an already-created event.
  pairPartnerIds?: readonly string[];
};

export type CreateTournamentInput = {
  roundStartMode?: TournamentRoundStartMode;
  category?: TournamentCategory;
  format?: DeckFormat;
  password?: string;
  clocks?: TournamentClockSettings;
  name: string;
  description?: string;
  structure: TournamentStructure;
  topCut: boolean;
  bestOf: 1 | 3;
  startsAt: number;
  maxPlayers: number;
  allowBots: boolean;
  randomBotStyles?: boolean;
  banlist: BanlistPolicy;
};

export type SwissTimeoutPolicy = "draw" | "double_loss" | "extra_turns_then_draw";
export type EliminationTimeoutPolicy = "extra_turns_then_state_tiebreak";

export type TournamentRules = {
  match: {
    winsRequired: 1 | 2;
    swissDurationMs: number | null;
    topCutDurationMs: number | null;
    finalDurationMs: number | null;
    overtimeMs: number;
  };
  attendance: {
    joinGraceMs: number;
    gameLossAtMs: number | null;
    matchLossAtMs: number;
  };
  timeout: {
    swiss: SwissTimeoutPolicy;
    elimination: EliminationTimeoutPolicy;
    // Extra turns granted at time (manual §5.2: turn 0 + N). Optional for
    // additive compatibility; presets MUST populate them — downstream code
    // must read these, never hardcode 3/5.
    swissExtraTurns?: number;
    eliminationExtraTurns?: number;
    // Ordered state-tiebreak criteria for elimination timeout (manual §5.2:
    // more security, more deck cards, more Digimon in battle area, ...).
    stateTiebreakers?: readonly string[];
  };
  standings: {
    winPoints: number;
    drawPoints: number;
    lossPoints: number;
    byePoints: number;
    tiebreakers: readonly string[];
    // Floor applied to opponent win rates before averaging (manual §5.4:
    // rates below 0.33 count as 0.33). Presets MUST populate; standings code
    // must read this, never hardcode 0.33.
    winRateFloor?: number;
  };
};

// Official table (Tournament Rules Manual §3.6). Computed once at check-in
// close and frozen; late entry or drops never resize.
export function swissRoundCount(participants: number): number {
  if (participants <= 8) return 3;
  if (participants <= 16) return 4;
  if (participants <= 32) return 5;
  if (participants <= 64) return 6;
  if (participants <= 128) return 7;
  if (participants <= 256) return 8;
  if (participants <= 512) return 9;
  return 10;
}

export function topCutSize(participants: number): number {
  if (participants <= 8) return 0;
  if (participants <= 16) return 2;
  if (participants <= 32) return 4;
  if (participants <= 128) return 8;
  if (participants <= 512) return 16;
  return 32;
}

export type PairingReason = "same_score" | "pair_down" | "rematch_unavoidable" | "bye_no_prior_bye" | "bye_repeat";

// Immutable ledger entry that standings project from. Every way a match can
// resolve is explicit; standings never read mutable counters.
export type MatchOutcome = "win" | "loss" | "draw" | "bye" | "double_loss" | "no_show_loss" | "concession";

export type LedgerEntry = {
  participantId: string;
  opponentId: string | null;
  opponentKind: ParticipantKind | null;
  roundNumber: number;
  outcome: MatchOutcome;
};

export type StandingsRow = {
  participantId: string;
  rank: number;
  points: number;
  matchWinRate: number;
  opponentMatchWinRate: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
};

export type ParticipantView = {
  id: string;
  kind: ParticipantKind;
  displayName: string;
  status: RegistrationStatus;
  seed: number | null;
  // Null for bots. Lets the client join legacy bracket rows (keyed by
  // account id) to display names.
  accountId?: string | null;
  botStyle?: BotStyle | null;
};

export type TournamentSummary = {
  roundStartMode?: TournamentRoundStartMode;
  category?: TournamentCategory;
  myEntry?: {
    status: RegistrationStatus;
    checkInOpensAt: number | null;
    checkInClosesAt: number | null;
  };
  format?: DeckFormat;
  passwordProtected?: boolean;
  discordAnnounce?: boolean;
  discordUrl?: string | null;
  spectatorPolicy?: TournamentSpectatorPolicy;
  id: string;
  name: string;
  description?: string;
  status: TournamentStatus;
  structure: TournamentStructure;
  topCutEnabled: boolean;
  topCutSize: number | null;
  bestOf: 1 | 3;
  allowBots: boolean;
  randomBotStyles?: boolean;
  startsAt: number;
  maxPlayers: number;
  registeredCount: number;
  banlistPolicy: BanlistPolicy;
  circuitId?: string | null;
};

export type SeriesScoreView = {
  participantIds?: readonly [string | null, string | null];
  winnerSeat?: 0 | 1 | null;
  matchId: string;
  seriesId: string | null;
  status: MatchStatus;
  participant0Id: string | null;
  participant1Id: string | null;
  wins0: number;
  wins1: number;
  currentGameIndex: number | null;
  joinDeadlineAt: number | null;
  seriesDeadlineAt: number | null;
  winnerParticipantId: string | null;
  /**
   * Why the pairer put these two together, when it recorded one. Optional because a match created
   * outside the Swiss pairer — a bracket confrontation, a legacy row — has no pairing decision to
   * explain.
   *
   * Published so a player can see that they were paired DOWN, or into an unavoidable rematch,
   * rather than being left to infer a mistake from an opponent whose record does not match theirs.
   */
  pairingReason?: PairingReason | null;
};

export type RoundView = {
  number: number;
  status: RoundStatus;
  publishedAt: number | null;
  matches: SeriesScoreView[];
};

export type PhaseView = {
  id: string;
  kind: PhaseKind;
  status: PhaseStatus;
  plannedRounds: number | null;
  rounds: RoundView[];
};

export type TournamentView = TournamentSummary & {
  participants: ParticipantView[];
  phases: PhaseView[];
  standings: StandingsRow[];
  rules: TournamentRules | null;
  // Frozen at creation from the resolved BanlistPolicy; what the UI renders
  // as "cards banned/restricted in this event". Empty for mode "none".
  banlistCards: TournamentBanlistCard[];
  serverNow: number;
  canSpectate?: boolean;
};
