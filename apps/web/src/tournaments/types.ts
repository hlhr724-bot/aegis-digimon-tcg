import type { TournamentOwnDeck } from "@aegis/shared/tournaments/TournamentOwnDeck";
/* Wire shapes for the tournament endpoints, expressed on top of `@aegis/shared`.
   Only the parts the server does NOT yet publish are declared here; everything the
   shared contract already owns is imported, never re-typed. */

import type {
  ParticipantView,
  SeriesScoreView,
  PhaseView,
  StandingsRow,
  TournamentBanlistCard,
  TournamentRules,
  TournamentSummary,
} from "@aegis/shared";

/**
 * The list/detail payload: the shared summary plus the three columns the legacy bracket client
 * still reads. `registrations` is the server's deprecated alias for `registeredCount` and is
 * deliberately absent here so no component can read it.
 */
export type TournamentListing = TournamentSummary & {
  block: string;
  createdBy: string | null;
  winnerAccountId: string | null;
};

/**
 * The pre-program single-elimination bracket row. Match Series (BO3 score, per-game rooms,
 * deadlines) lands in the series slice as `SeriesScoreView`; until then this flat shape is all
 * `GET /tournaments/:id` returns, and the my-match panel renders only what it actually carries.
 *
 * KNOWN LEAK (web follow-up): `round` is the STORED, tournament-wide round number, because this
 * array is a flat dump of `tournament_matches` with no phase on it. A Top Cut's rounds continue the
 * Swiss numbering (migration 009), so a quarterfinal of an event that played four Swiss rounds
 * renders here as "round 5" rather than "quarterfinal". `phases` carries the same confrontations
 * with phase-local round numbers and a phase kind — which is what `TopCutBracket` renders — so the
 * fix is to move `MyMatchPanel` onto `phases` and retire this array, not to renumber it here.
 */
export type LegacyTournamentMatch = {
  id: string;
  round: number;
  position: number;
  player0AccountId: string | null;
  player1AccountId: string | null;
  winnerAccountId: string | null;
  status: "waiting" | "pending" | "finished" | "bye";
};

export type TournamentDetail = TournamentListing & {
  ownDeck?: TournamentOwnDeck | null;
  series?: SeriesScoreView[];
  rules: TournamentRules | null;
  banlistCards: TournamentBanlistCard[];
  matches: LegacyTournamentMatch[];
  participants: ParticipantView[];
  /**
   * Extension points for later slices. The server does not send any of these yet, so every
   * reader must treat them as absent rather than empty: standings arrive with slice 6, phases
   * and rounds with slice 3, `serverNow` with the scheduler in slice 4. Until then the clock
   * offset comes from the response `Date` header (see `serverClock.ts`).
   */
  standings?: StandingsRow[];
  phases?: PhaseView[];
  serverNow?: number;
  windows?: TournamentWindows;
  canSpectate?: boolean;
};

/**
 * Creation reason codes. Mirrors `TournamentValidationCode` in
 * `apps/api/src/tournaments/rules/validation.ts`; the server owns the list and it is not yet in
 * `@aegis/shared`, so an unknown code must still render rather than crash. The runtime array is
 * declared below, next to the participant failures.
 */
export type TournamentValidationCode = (typeof TOURNAMENT_VALIDATION_CODES)[number];

export type TournamentValidationError = {
  code: TournamentValidationCode | (string & {});
  field: string;
  detail?: string;
};

/** Mirrors `DeckViolation` in `apps/api/src/tournaments/participants/deckLegality.ts`. */
export type DeckViolation =
  | { kind: "outside_format"; cardId: string }
  | { kind: "unknown_card"; cardId: string }
  | { kind: "main_deck_size"; size: number; required: number }
  | { kind: "egg_deck_size"; size: number; max: number }
  | { kind: "wrong_deck"; cardId: string; belongsIn: "main" | "egg" }
  | { kind: "banned"; cardId: string }
  | { kind: "over_copy_limit"; cardId: string; copies: number; allowed: number }
  | { kind: "banned_pair"; cardId: string; conflictsWith: string };

/**
 * Mirrors `ParticipantFailure` in `apps/api/src/tournaments/participants/ParticipantStore.ts`.
 * One `as const` array is the single source: the type, the runtime membership test and the
 * translation-key check all derive from it, so a code cannot be added to one and missed by
 * another.
 */
export const PARTICIPANT_FAILURES = [
  "tournament_not_found",
  "registration_closed",
  "tournament_full",
  "already_registered",
  "disqualified",
  "deck_not_found",
  "deck_illegal",
  "not_registered",
  "check_in_not_open",
  "check_in_closed",
  "already_checked_in",
  "already_dropped",
  "incorrect_password",
] as const;

export type ParticipantFailure = (typeof PARTICIPANT_FAILURES)[number];

/** Mirrors `TournamentValidationCode`; same single-source rule as the failures above. */
export const TOURNAMENT_VALIDATION_CODES = [
  "name_too_short",
  "name_too_long",
  "description_too_long",
  "clock_settings_invalid",
  "password_invalid",
  "format_invalid",
  "structure_invalid",
  "best_of_invalid",
  "top_cut_requires_swiss",
  "banlist_mode_unknown",
  "banlist_set_unknown",
  "max_players_out_of_range",
  "starts_at_invalid",
  "starts_at_in_past",
] as const;

export type TournamentWindows = {
  registrationClosesAt: number | null;
  checkInOpensAt: number | null;
  checkInClosesAt: number | null;
};
