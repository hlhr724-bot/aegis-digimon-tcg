import { describe, expect, it } from "vitest";
import type { ParticipantView, RegistrationStatus, TournamentStatus } from "@aegis/shared";
import { entryActions } from "./entry";
import type { TournamentDetail } from "./types";

function detail(
  status: TournamentStatus,
  participants: ParticipantView[],
  registeredCount = participants.length,
  maxPlayers = 8,
): TournamentDetail {
  return {
    id: "t-1",
    name: "Event",
    status,
    structure: "swiss",
    topCutEnabled: false,
    topCutSize: null,
    bestOf: 3,
    allowBots: false,
    startsAt: 0,
    maxPlayers,
    registeredCount,
    banlistPolicy: { mode: "current" },
    block: "BT10",
    createdBy: null,
    winnerAccountId: null,
    rules: null,
    banlistCards: [],
    matches: [],
    participants,
  };
}

function human(displayName: string, status: RegistrationStatus): ParticipantView {
  return { id: `p-${displayName}-${status}`, kind: "human", displayName, status, seed: null };
}

describe("entryActions", () => {
  it("offers registration only while registration is open and the field has room", () => {
    expect(entryActions({ detail: detail("registration", []), own: undefined, signedIn: true }).register).toBe(true);
    expect(entryActions({ detail: detail("check_in", []), own: undefined, signedIn: true }).register).toBe(false);
    expect(entryActions({ detail: detail("running", []), own: undefined, signedIn: true }).register).toBe(false);
    expect(entryActions({ detail: detail("finished", []), own: undefined, signedIn: true }).register).toBe(false);
    expect(entryActions({ detail: detail("cancelled", []), own: undefined, signedIn: true }).register).toBe(false);
    expect(entryActions({ detail: detail("registration", [], 8, 8), own: undefined, signedIn: true }).register).toBe(
      false,
    );
  });

  it("withdraws registration once the player already holds a seat", () => {
    for (const status of ["registered", "checked_in", "active"] as const) {
      const own = human("Me", status);
      expect(entryActions({ detail: detail("registration", [own]), own, signedIn: true }).register).toBe(false);
    }
    // A dropped player freed their seat, so registering again is offered.
    const dropped = human("Me", "dropped");
    expect(entryActions({ detail: detail("registration", [dropped]), own: dropped, signedIn: true }).register).toBe(
      true,
    );
    const banned = human("Me", "disqualified");
    expect(entryActions({ detail: detail("registration", [banned]), own: banned, signedIn: true }).register).toBe(
      false,
    );
  });

  it("offers check-in only in a check-in state and only to a registered player", () => {
    const registered = human("Me", "registered");
    expect(entryActions({ detail: detail("check_in", [registered]), own: registered, signedIn: true }).checkIn).toBe(
      true,
    );
    expect(entryActions({ detail: detail("running", [registered]), own: registered, signedIn: true }).checkIn).toBe(
      false,
    );

    const already = human("Me", "checked_in");
    expect(entryActions({ detail: detail("check_in", [already]), own: already, signedIn: true }).checkIn).toBe(false);
    const dropped = human("Me", "dropped");
    expect(entryActions({ detail: detail("check_in", [dropped]), own: dropped, signedIn: true }).checkIn).toBe(false);
  });

  it("hides dropping when the account has no registration", () => {
    expect(entryActions({ detail: detail("check_in", []), own: undefined, signedIn: true }).drop).toBe(false);
    expect(entryActions({ detail: detail("registration", []), own: undefined, signedIn: true }).drop).toBe(false);
    expect(entryActions({ detail: detail("running", []), own: undefined, signedIn: true }).drop).toBe(false);
  });

  it("offers dropping only to a player holding a seat in a live event", () => {
    const registered = human("Me", "registered");
    expect(entryActions({ detail: detail("running", [registered]), own: registered, signedIn: true }).drop).toBe(true);
    expect(entryActions({ detail: detail("finished", [registered]), own: registered, signedIn: true }).drop).toBe(
      false,
    );

    const gone = human("Me", "dropped");
    expect(entryActions({ detail: detail("running", [gone]), own: gone, signedIn: true }).drop).toBe(false);
  });

  it("keeps check-in available but hides dropping when the viewer has no account", () => {
    const actions = entryActions({
      detail: detail("check_in", [human("Twin", "registered"), human("Twin", "registered")]),
      own: undefined,
      signedIn: false,
    });
    expect(actions.checkIn).toBe(true);
    expect(actions.drop).toBe(false);
  });

  it("never offers check-in or dropping to a signed-in player who is not signed up", () => {
    for (const status of ["registration", "check_in"] as const) {
      const actions = entryActions({
        detail: detail(status, [human("Someone", "registered")]),
        own: undefined,
        signedIn: true,
      });
      expect(actions.checkIn).toBe(false);
      expect(actions.drop).toBe(false);
    }
  });

  it("trusts the account's own entry when the participant row cannot be matched", () => {
    const registered = {
      ...detail("check_in", []),
      myEntry: { status: "registered" as const, checkInOpensAt: null, checkInClosesAt: null },
    };
    expect(entryActions({ detail: registered, own: undefined, signedIn: true })).toEqual({
      register: false,
      checkIn: true,
      drop: true,
    });
  });
});
