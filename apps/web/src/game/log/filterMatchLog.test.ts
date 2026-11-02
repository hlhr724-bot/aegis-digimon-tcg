import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { LogTurnGroup } from "@/game/log/LogEntry";
import { filterMatchLog } from "@/game/log/filterMatchLog";

const turns: LogTurnGroup[] = [
  {
    turnCount: 1,
    turnSeat: 0,
    phases: [
      {
        phase: Phase.Main,
        entries: [
          {
            id: "1",
            text: "Alice played Agumon",
            kind: "you",
            cardIds: ["ST1-03"],
            turnCount: 1,
            turnSeat: 0,
            phase: Phase.Main,
          },
          { id: "2", text: "Bob drew 1", kind: "opp", turnCount: 1, turnSeat: 0, phase: Phase.Main },
        ],
      },
    ],
  },
];

describe("match history search", () => {
  it("preserves the original reference for an empty query", () => {
    expect(filterMatchLog({ turns, query: "  " })).toBe(turns);
  });

  it("matches text and card IDs without case sensitivity", () => {
    for (const query of ["ALICE", "agumon", "st1-03"]) {
      const filtered = filterMatchLog({ turns, query });
      expect(filtered[0]?.phases[0]?.entries.map((entry) => entry.id)).toEqual(["1"]);
    }
    expect(turns[0]?.phases[0]?.entries).toHaveLength(2);
  });

  it("removes empty phases and turns", () => {
    expect(filterMatchLog({ turns, query: "not present" })).toEqual([]);
  });
});
