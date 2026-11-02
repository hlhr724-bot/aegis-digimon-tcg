import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import type { LogEntry } from "@/game/log/LogEntry";
import { groupLogEntries } from "@/game/log/groupLogEntries";
import { flattenRecentLogEntries } from "@/game/log/flattenRecentLogEntries";

const entries: LogEntry[] = [
  { id: "1", text: "Start", kind: "sys", turnCount: 1, turnSeat: 0, phase: Phase.Active },
  { id: "2", text: "Play", kind: "you", turnCount: 1, turnSeat: 0, phase: Phase.Main },
  { id: "3", text: "Effect", kind: "you", turnCount: 1, turnSeat: 0, phase: Phase.Main },
  { id: "4", text: "Next", kind: "opp", turnCount: 2, turnSeat: 1, phase: Phase.Active },
];

describe("chronological match history grouping", () => {
  it("keeps turns and consecutive phases in event order", () => {
    const turns = groupLogEntries({ entries });
    expect(turns).toHaveLength(2);
    expect(turns[0]?.phases.map((phase) => phase.entries.map((entry) => entry.id))).toEqual([["1"], ["2", "3"]]);
    expect(turns[1]?.turnSeat).toBe(1);
    expect(turns[1]?.phases[0]?.entries).toEqual([entries[3]]);
  });

  it("keeps the ticker newest first without changing history", () => {
    expect(flattenRecentLogEntries({ entries, limit: 2 }).map((entry) => entry.id)).toEqual(["4", "3"]);
    expect(entries.map((entry) => entry.id)).toEqual(["1", "2", "3", "4"]);
    expect(flattenRecentLogEntries({ entries, limit: 0 })).toEqual([]);
  });
});
