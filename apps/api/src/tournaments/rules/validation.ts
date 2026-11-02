import { isDeckFormat } from "@aegis/shared/deckFormat";
import { isTournamentClockSettings } from "@aegis/shared/tournaments/isTournamentClockSettings";
import type { BanlistPolicy, CreateTournamentInput, TournamentBanlistCard, TournamentRules } from "@aegis/shared";
import { banlistDateForSet, normalizeBanlistPolicy, resolveBanlistPolicy } from "./banlistPolicy.js";
import { buildTournamentRules } from "#api/tournaments/rules/buildTournamentRules";

export type TournamentValidationCode =
  | "name_too_short"
  | "name_too_long"
  | "description_too_long"
  | "clock_settings_invalid"
  | "password_invalid"
  | "format_invalid"
  | "structure_invalid"
  | "best_of_invalid"
  | "top_cut_requires_swiss"
  | "banlist_mode_unknown"
  | "banlist_set_unknown"
  | "max_players_out_of_range"
  | "starts_at_invalid"
  | "starts_at_in_past";

export type TournamentValidationError = {
  code: TournamentValidationCode;
  field: keyof CreateTournamentInput;
  detail?: string;
};

export type ValidatedTournament = {
  input: CreateTournamentInput;
  rules: TournamentRules;
  banlistCards: TournamentBanlistCard[];
};

export type ValidationResult =
  | { ok: true; value: ValidatedTournament }
  | { ok: false; errors: TournamentValidationError[] };

export const MIN_TOURNAMENT_NAME_LENGTH = 3;
export const MAX_TOURNAMENT_NAME_LENGTH = 80;
export const MIN_TOURNAMENT_PLAYERS = 2;
export const MAX_TOURNAMENT_PLAYERS = 1024;

export const STARTS_AT_PAST_TOLERANCE_MS = 5 * 60_000;

export function validateCreateTournament(input: CreateTournamentInput, createdAt: number): ValidationResult {
  const errors: TournamentValidationError[] = [];
  if (input.format !== undefined && !isDeckFormat(input.format)) {
    errors.push({ code: "format_invalid", field: "format" });
  }
  if (input.password !== undefined && (typeof input.password !== "string" || input.password.length > 128)) {
    errors.push({ code: "password_invalid", field: "password" });
  }
  if (input.clocks !== undefined && !isTournamentClockSettings(input.clocks)) {
    errors.push({ code: "clock_settings_invalid", field: "clocks" });
  }
  const name = input.name.trim();
  const description = input.description?.trim() ?? "";
  if (description.length > 1000) {
    errors.push({ code: "description_too_long", field: "description" });
  }
  if (name.length < MIN_TOURNAMENT_NAME_LENGTH) errors.push({ code: "name_too_short", field: "name" });
  if (name.length > MAX_TOURNAMENT_NAME_LENGTH) errors.push({ code: "name_too_long", field: "name" });

  if (
    !Number.isInteger(input.maxPlayers) ||
    input.maxPlayers < MIN_TOURNAMENT_PLAYERS ||
    input.maxPlayers > MAX_TOURNAMENT_PLAYERS
  ) {
    errors.push({ code: "max_players_out_of_range", field: "maxPlayers" });
  }
  if (!Number.isFinite(input.startsAt) || input.startsAt <= 0) {
    errors.push({ code: "starts_at_invalid", field: "startsAt" });
  } else if (input.startsAt < createdAt - STARTS_AT_PAST_TOLERANCE_MS) {
    errors.push({ code: "starts_at_in_past", field: "startsAt" });
  }

  if (input.structure === "single_elimination" && input.topCut) {
    errors.push({ code: "top_cut_requires_swiss", field: "topCut" });
  }

  if (input.structure !== "swiss" && input.structure !== "single_elimination") {
    errors.push({ code: "structure_invalid", field: "structure" });
  }
  if (input.bestOf !== 1 && input.bestOf !== 3) {
    errors.push({ code: "best_of_invalid", field: "bestOf" });
  }
  errors.push(...banlistErrors(input.banlist));

  if (errors.length > 0) return { ok: false, errors };
  const banlist = normalizeBanlistPolicy(input.banlist);
  const rules = buildTournamentRules({ bestOf: input.bestOf });
  if (input.clocks) {
    rules.match.swissDurationMs = input.clocks.roundMinutes * 60_000;
    rules.match.topCutDurationMs = input.clocks.eliminationMinutes * 60_000;
    rules.match.finalDurationMs = input.clocks.finalMinutes === null ? null : input.clocks.finalMinutes * 60_000;
    rules.match.overtimeMs = input.clocks.overtimeMinutes * 60_000;
  }
  return {
    ok: true,
    value: {
      input: { ...input, name, description, banlist },
      rules,
      banlistCards: resolveBanlistPolicy(banlist, createdAt),
    },
  };
}

function banlistErrors(policy: BanlistPolicy): TournamentValidationError[] {
  switch (policy.mode) {
    case "none":
    case "current":
      return [];
    case "as_of_set":
      return banlistDateForSet(policy.setId) === undefined
        ? [{ code: "banlist_set_unknown", field: "banlist", detail: policy.setId }]
        : [];
    default:
      return [{ code: "banlist_mode_unknown", field: "banlist", detail: JSON.stringify(policy) }];
  }
}
