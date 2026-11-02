import type { CreateTournamentInput } from "@aegis/shared";
import { describe, expect, it } from "vitest";

import { validateCreateTournament, type TournamentValidationCode } from "./validation.js";

const CREATED_AT = Date.parse("2025-06-01T00:00:00Z");

function competitive(overrides: Partial<CreateTournamentInput> = {}): CreateTournamentInput {
  return {
    name: "Regional Qualifier",
    structure: "swiss",
    topCut: true,
    bestOf: 3,
    startsAt: CREATED_AT + 86_400_000,
    maxPlayers: 64,
    allowBots: false,
    banlist: { mode: "current" },
    ...overrides,
  };
}

function community(overrides: Partial<CreateTournamentInput> = {}): CreateTournamentInput {
  return competitive({
    name: "Community Cup",
    structure: "single_elimination",
    topCut: false,
    bestOf: 1,
    banlist: { mode: "none" },
    ...overrides,
  });
}

function codes(input: CreateTournamentInput): TournamentValidationCode[] {
  const result = validateCreateTournament(input, CREATED_AT);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("validateCreateTournament", () => {
  it("accepts the official competitive event and freezes its rules and banlist", () => {
    const result = validateCreateTournament(competitive(), CREATED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rules.match.winsRequired).toBe(2);
    expect(result.value.banlistCards.length).toBeGreaterThan(0);
  });

  it("accepts a best-of-one single-elimination community event with bots and no banlist", () => {
    const result = validateCreateTournament(community({ allowBots: true }), CREATED_AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.banlistCards).toEqual([]);
    expect(result.value.rules.match.finalDurationMs).toBe(25 * 60_000);
  });

  it("accepts a Swiss community event with Top Cut and bots", () => {
    expect(codes(community({ structure: "swiss", topCut: true, allowBots: true }))).toEqual([]);
  });

  it("trims the name it hands back", () => {
    const result = validateCreateTournament(competitive({ name: "  Spaced Cup  " }), CREATED_AT);
    expect(result.ok && result.value.input.name).toBe("Spaced Cup");
  });

  it("rejects Top Cut on a single-elimination event, which is already a bracket", () => {
    expect(codes(community({ topCut: true }))).toContain("top_cut_requires_swiss");
  });

  it("accepts bots in either match format", () => {
    expect(codes(competitive({ allowBots: true }))).toEqual([]);
  });

  it("accepts an unrestricted banlist", () => {
    expect(codes(competitive({ banlist: { mode: "none" } }))).toEqual([]);
  });

  it("accepts both best-of formats", () => {
    expect(codes(competitive({ bestOf: 1 }))).toEqual([]);
    expect(codes(community({ bestOf: 3 }))).toEqual([]);
  });

  it("rejects an as_of_set banlist naming a set with no release date", () => {
    expect(codes(competitive({ banlist: { mode: "as_of_set", setId: "BT999" } }))).toEqual(["banlist_set_unknown"]);
    expect(codes(competitive({ banlist: { mode: "as_of_set", setId: "BT7" } }))).toEqual([]);
  });

  it("rejects an unknown banlist mode", () => {
    const input = competitive({ banlist: { mode: "whenever" } as never });
    expect(codes(input)).toEqual(["banlist_mode_unknown"]);
  });

  it("rejects an out-of-range field size and a name that is too short or too long", () => {
    expect(codes(competitive({ maxPlayers: 1 }))).toEqual(["max_players_out_of_range"]);
    expect(codes(competitive({ maxPlayers: 2048 }))).toEqual(["max_players_out_of_range"]);
    expect(codes(competitive({ maxPlayers: 8.5 }))).toEqual(["max_players_out_of_range"]);
    expect(codes(competitive({ name: "GG" }))).toEqual(["name_too_short"]);
    expect(codes(competitive({ name: "x".repeat(81) }))).toEqual(["name_too_long"]);
  });

  it("rejects a start time that is not a usable instant", () => {
    expect(codes(competitive({ startsAt: Number.NaN }))).toEqual(["starts_at_invalid"]);
    expect(codes(competitive({ startsAt: 0 }))).toEqual(["starts_at_invalid"]);
  });

  it("rejects a start time well in the past but tolerates clock drift around 'now'", () => {
    expect(codes(competitive({ startsAt: CREATED_AT - 3_600_000 }))).toEqual(["starts_at_in_past"]);
    expect(codes(competitive({ startsAt: CREATED_AT - 60_000 }))).toEqual([]);
    expect(codes(competitive({ startsAt: CREATED_AT }))).toEqual([]);
  });

  it("normalizes an as_of_set spelling into the frozen policy", () => {
    const result = validateCreateTournament(
      competitive({ banlist: { mode: "as_of_set", setId: " bt7 " } }),
      CREATED_AT,
    );
    expect(result.ok && result.value.input.banlist).toEqual({ mode: "as_of_set", setId: "BT7" });
  });

  it("reports every independent failure at once rather than stopping at the first", () => {
    expect(codes(competitive({ name: "x", maxPlayers: 0, allowBots: true }))).toEqual(
      expect.arrayContaining(["name_too_short", "max_players_out_of_range"]),
    );
  });

  it("names the offending field on every rejection", () => {
    const result = validateCreateTournament(competitive({ bestOf: 2 as never }), CREATED_AT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toEqual({ code: "best_of_invalid", field: "bestOf" });
  });

  it("freezes a different banlist for as_of_set than for current", () => {
    const asOfSet = validateCreateTournament(competitive({ banlist: { mode: "as_of_set", setId: "BT7" } }), CREATED_AT);
    const current = validateCreateTournament(competitive(), CREATED_AT);
    expect(asOfSet.ok && current.ok).toBe(true);
    if (!asOfSet.ok || !current.ok) return;
    expect(asOfSet.value.banlistCards.length).toBeLessThan(current.value.banlistCards.length);
  });
});
