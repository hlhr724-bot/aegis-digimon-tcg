import { describe, expect, it } from "vitest";
import { matchupOwnerPath } from "#api/deckSimulation/matchupOwnerPath";

describe("matchupOwnerPath", () => {
  it("returns the gateway path that reaches this exact API process", () => {
    expect(matchupOwnerPath({ AEGIS_PROCESS_PATH: "api/red/p1" })).toBe("api/red/p1");
    expect(matchupOwnerPath({ AEGIS_PROCESS_PATH: "/api/g-0123456789ab/p3/" })).toBe("api/g-0123456789ab/p3");
    expect(matchupOwnerPath({ AEGIS_PROCESS_PATH: "p2" })).toBe("p2");
  });

  it("returns nothing in single-process mode or for a path the gateway would not route", () => {
    expect(matchupOwnerPath({})).toBeUndefined();
    expect(matchupOwnerPath({ AEGIS_PROCESS_PATH: "api/red/p9" })).toBeUndefined();
    expect(matchupOwnerPath({ AEGIS_PROCESS_PATH: "https://evil.example/p1" })).toBeUndefined();
  });
});
