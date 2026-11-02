/* Translation-key lookups for the server's vocabularies. Every code the API can send maps to a
   key here; an unrecognized one falls back to a generic string plus the raw code, so a server that
   grows a new reason never renders a blank message. */

import type {
  BanlistPolicy,
  MatchStatus,
  PairingReason,
  RegistrationStatus,
  TournamentBanlistCard,
  TournamentStatus,
  TournamentStructure,
} from "@aegis/shared";
import type { TranslationKey, TranslationParams } from "../i18n";
import { banlistCardName as cardName } from "./banlistPreview";
import type { CountdownLevel } from "./hooks";
import {
  PARTICIPANT_FAILURES,
  TOURNAMENT_VALIDATION_CODES,
  type DeckViolation,
  type LegacyTournamentMatch,
  type TournamentWindows,
} from "./types";

export function statusKey(status: TournamentStatus): TranslationKey {
  return `tournaments.status.${status}` as TranslationKey;
}

export function structureKey(structure: TournamentStructure): TranslationKey {
  return structure === "swiss" ? "tournaments.structure.swiss" : "tournaments.structure.singleElimination";
}

export function participantStatusKey(status: RegistrationStatus): TranslationKey {
  return `tournaments.participant.${status}` as TranslationKey;
}

export function restrictionKey(status: TournamentBanlistCard["status"]): TranslationKey {
  if (status === "banned") return "tournaments.restriction.banned";
  return status === "banned_pair" ? "tournaments.restriction.bannedPair" : "tournaments.restriction.restricted";
}

export function matchStatusKey(status: LegacyTournamentMatch["status"]): TranslationKey {
  return `tournaments.match.${status}` as TranslationKey;
}

/** A confrontation's own state, as the series module reports it (`MatchStatus`). */
export function matchStateKey(status: MatchStatus): TranslationKey {
  return `tournaments.matchState.${camelCase(status)}` as TranslationKey;
}

/**
 * What to call a bracket round. The last three rounds have names everybody knows, and a cut deeper
 * than that falls back to "round N" rather than inventing a word for it.
 */
export function topCutRoundKey(round: number, plannedRounds: number | null): TranslationKey {
  if (plannedRounds === null) return "tournaments.topCut.round";
  const fromEnd = plannedRounds - round;
  if (fromEnd === 0) return "tournaments.topCut.final";
  if (fromEnd === 1) return "tournaments.topCut.semifinal";
  if (fromEnd === 2) return "tournaments.topCut.quarterfinal";
  return "tournaments.topCut.round";
}

/**
 * How to explain the pairer's choice, when it is worth explaining.
 *
 * `same_score` is the ordinary case and gets nothing: labelling every normal pairing would bury the
 * two that a player actually needs told — that they were paired DOWN into a lower score group, or
 * into a rematch the field left no way around. A missing reason (a bracket confrontation, a legacy
 * row) is likewise nothing to say.
 */
export function pairingReasonKey(reason: PairingReason | null | undefined): TranslationKey | undefined {
  if (!reason || reason === "same_score") return undefined;
  return `tournaments.pairing.${camelCase(reason)}` as TranslationKey;
}

export function windowKey(key: keyof TournamentWindows): TranslationKey {
  return `tournaments.detail.window.${key}` as TranslationKey;
}

export function banlistModeKey(policy: BanlistPolicy): TranslationKey {
  if (policy.mode === "none") return "tournaments.banlist.none";
  if (policy.mode === "current") return "tournaments.banlist.current";
  return "tournaments.banlist.asOfSet";
}

export function countdownLevelKey(level: CountdownLevel): TranslationKey {
  switch (level) {
    case "expired":
      return "tournaments.countdown.expired";
    case "warning_1m":
      return "tournaments.countdown.warning1";
    case "warning_2m":
      return "tournaments.countdown.warning2";
    case "warning_5m":
      return "tournaments.countdown.warning5";
    case "normal":
      return "tournaments.countdown.normal";
    default:
      return "tournaments.countdown.none";
  }
}

/**
 * Every code that has copy. Derived from the two mirror arrays plus the client-only transport
 * failure, so adding a code to a mirror is enough for it to render.
 */
const REASON_KEYS = new Set<string>([
  ...PARTICIPANT_FAILURES,
  ...TOURNAMENT_VALIDATION_CODES,
  "network_error",
  "tournament_already_started",
  "tournament_limit_reached",
  "check_in_window_inverted",
  "window_timestamp_invalid",
]);

const HTTP_STATUS_REASON_KEYS: Readonly<Record<string, TranslationKey>> = {
  "401": "tournaments.reason.signedOut",
  "403": "tournaments.reason.forbidden",
  "404": "tournaments.reason.notFound",
  "429": "tournaments.reason.tooManyRequests",
};

/** The key for a reason code, or undefined when the server sent one this build does not know. */
export function reasonKey(code: string): TranslationKey | undefined {
  if (REASON_KEYS.has(code)) return `tournaments.reason.${camelCase(code)}` as TranslationKey;
  return HTTP_STATUS_REASON_KEYS[code];
}

/** The key and interpolation params for one deck-legality violation. */
export function violationMessage(
  violation: DeckViolation,
  getCardName: (cardId: string) => string = cardName,
): { key: TranslationKey; params: TranslationParams } {
  const key = `tournaments.violation.${camelCase(violation.kind)}` as TranslationKey;
  switch (violation.kind) {
    case "main_deck_size":
      return { key, params: { size: violation.size, required: violation.required } };
    case "egg_deck_size":
      return { key, params: { size: violation.size, max: violation.max } };
    case "over_copy_limit":
      return {
        key,
        params: { card: getCardName(violation.cardId), copies: violation.copies, allowed: violation.allowed },
      };
    case "banned_pair":
      return { key, params: { card: getCardName(violation.cardId), other: getCardName(violation.conflictsWith) } };
    case "wrong_deck":
      return { key, params: { card: getCardName(violation.cardId), deck: violation.belongsIn } };
    default:
      return { key, params: { card: getCardName(violation.cardId) } };
  }
}

function camelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
