import { describe, expect, it } from "vitest";
import { rankCircuitStandings } from "#api/tournaments/circuits/rankCircuitStandings";
import { scoreCircuitPlacement } from "#api/tournaments/circuits/scoreCircuitPlacement";
import { DEFAULT_CIRCUIT_SETTINGS } from "@aegis/shared/tournaments/circuits/DEFAULT_CIRCUIT_SETTINGS";

const scoring = {
  pointsTable: DEFAULT_CIRCUIT_SETTINGS.pointsTable,
  participationPoints: DEFAULT_CIRCUIT_SETTINGS.participationPoints,
};

describe("scoreCircuitPlacement", () => {
  it("adds the first matching tier to the participation points", () => {
    expect(scoreCircuitPlacement({ ...scoring, placement: 1 })).toBe(26);
    expect(scoreCircuitPlacement({ ...scoring, placement: 3 })).toBe(13);
    expect(scoreCircuitPlacement({ ...scoring, placement: 8 })).toBe(9);
  });

  it("gives only participation points outside the table or without a placement", () => {
    expect(scoreCircuitPlacement({ ...scoring, placement: 9 })).toBe(1);
    expect(scoreCircuitPlacement({ ...scoring, placement: null })).toBe(1);
  });
});

describe("rankCircuitStandings", () => {
  it("orders by points, then best placement, and shares a position on a full tie", () => {
    const ranked = rankCircuitStandings([
      {
        accountId: "c",
        displayName: "Cleo",
        points: 20,
        events: 2,
        bestPlacement: 2,
      },
      {
        accountId: "a",
        displayName: "Ana",
        points: 30,
        events: 3,
        bestPlacement: 1,
      },
      {
        accountId: "d",
        displayName: "Duda",
        points: 20,
        events: 1,
        bestPlacement: 2,
      },
      {
        accountId: "b",
        displayName: "Bia",
        points: 20,
        events: 4,
        bestPlacement: 1,
      },
    ]);
    expect(ranked.map(({ accountId, position }) => [accountId, position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 3],
    ]);
  });
});
