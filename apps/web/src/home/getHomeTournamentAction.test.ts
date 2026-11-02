import { describe, expect, it } from "vitest";
import { getHomeTournamentAction } from "@/home/getHomeTournamentAction";
import type { TournamentListing } from "@/tournaments/types";

const base = {
  id: "t-1",
  name: "Cup",
  status: "registration",
  structure: "swiss",
  topCutEnabled: false,
  topCutSize: null,
  bestOf: 1,
  allowBots: false,
  startsAt: 10_000,
  maxPlayers: 8,
  registeredCount: 1,
  banlistPolicy: { mode: "none" },
  block: "",
  createdBy: null,
  winnerAccountId: null,
} as TournamentListing;

describe("the home tournament action", () => {
  it("offers sign-up only to players without an entry", () => {
    expect(getHomeTournamentAction({ tournament: base, now: 0 }).labelKey).toBe("home.tournaments.signUp");
  });

  it("never offers sign-up to a player who is already signed up", () => {
    const tournament = {
      ...base,
      myEntry: { status: "registered", checkInOpensAt: 5_000, checkInClosesAt: 9_000 },
    } as TournamentListing;
    expect(getHomeTournamentAction({ tournament, now: 0 })).toEqual({
      labelKey: "tournaments.catalog.view",
      primary: false,
    });
  });

  it("offers check-in while the signed-up player's window is open", () => {
    const tournament = {
      ...base,
      myEntry: { status: "registered", checkInOpensAt: 5_000, checkInClosesAt: 9_000 },
    } as TournamentListing;
    expect(getHomeTournamentAction({ tournament, now: 6_000 })).toEqual({
      labelKey: "tournaments.detail.checkIn",
      primary: true,
    });
  });
});
