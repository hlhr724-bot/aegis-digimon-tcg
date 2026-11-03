import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { createLogCursor } from "@/game/log/createLogCursor";
import { appendLogEvent } from "@/game/log/appendLogEvent";
import { flushPendingLogMemory } from "@/game/log/flushPendingLogMemory";
import { translator } from "@/i18n/translator";
import { LogEffectRole } from "@/game/log/LogEffectRole";

const t = translator("en");
const seatNames = { 0: "Alice", 1: "Bob" };

function appendEvents(events: ServerEvent[]) {
  const cursor = createLogCursor();
  events.forEach((event, index) =>
    appendLogEvent({
      cursor,
      event: { ...event, seq: index + 1, batch: "batch", stateVersion: 1 },
      viewerSeat: 0,
      seatNames,
      t,
    }),
  );
  flushPendingLogMemory({ cursor, seatNames, t });
  return cursor;
}

describe("incremental memory narration", () => {
  it("deduplicates paid memory and attaches it to the action", () => {
    const cursor = appendEvents([
      { kind: "memoryChanged", from: 3, to: -2, reason: "payCost" },
      { kind: "memoryChanged", from: 3, to: -2, reason: "playCard" },
      { kind: "cardsMoved", instanceIds: ["played"], from: "hand", to: "battleArea" },
      { kind: "cardPlayed", seat: 0, cardId: "ST1-03" },
    ]);
    expect(cursor.entries).toHaveLength(1);
    expect(cursor.entries[0]?.memory).toEqual({ delta: -5, after: -2 });
  });

  it("signs costs from the non-turn actor's side", () => {
    const cursor = appendEvents([
      { kind: "memoryChanged", from: -3, to: 1, reason: "payCost" },
      { kind: "digivolved", seat: 1, permanentId: "defender", cardId: "ST1-03", mechanic: "normal" },
    ]);
    expect(cursor.entries[0]?.memory).toEqual({ delta: -4, after: -1 });
  });

  it("keeps an intervening gain separate and silences pass-turn resets", () => {
    const cursor = appendEvents([
      { kind: "memoryChanged", from: 0, to: 3, reason: "overflow" },
      { kind: "blockWindowOpened", attackerPermanentId: "attacker", eligibleBlockerIds: [] },
      { kind: "memoryChanged", from: 3, to: -3, reason: "passTurn" },
    ]);
    expect(cursor.entries[0]?.text).toBe("Memory for Alice: 0 → 3");
    expect(cursor.entries).toHaveLength(2);
  });

  it("deduplicates sequence numbers and flushes memory at batch boundaries", () => {
    const cursor = createLogCursor();
    const event = {
      kind: "memoryChanged",
      from: 0,
      to: 2,
      reason: "effect",
      seq: 1,
      batch: "first",
      stateVersion: 1,
    } as const;
    appendLogEvent({ cursor, event, viewerSeat: 0, seatNames, t });
    appendLogEvent({ cursor, event, viewerSeat: 0, seatNames, t });
    appendLogEvent({
      cursor,
      event: { kind: "cardPlayed", seat: 0, cardId: "ST1-03", seq: 2, batch: "second", stateVersion: 2 },
      viewerSeat: 0,
      seatNames,
      t,
    });
    expect(cursor.entries).toHaveLength(2);
    expect(cursor.entries[1]?.memory).toBeUndefined();
  });

  it("normalizes the active-phase counter before the server increment", () => {
    const cursor = appendEvents([
      { kind: "phaseChanged", phase: "Active", turnSeat: 1, turnCount: 1 },
      { kind: "cardPlayed", seat: 1, cardId: "ST1-03" },
    ]);
    expect(cursor.entries[0]?.turnCount).toBe(2);
    expect(cursor.entries[0]?.turnSeat).toBe(1);
  });
});

describe("activated effect details", () => {
  it("names the timing that fired a clause printed under several timings", () => {
    const cursor = appendEvents([
      {
        kind: "effectTriggered",
        seat: 1,
        sourceCardId: "BT20-042",
        effectKey: "BT20-042/ir-7-0",
        description:
          "[On Play] [When Digivolving] Suspend 1 of your opponent's Digimon or Tamers. Then, 1 of their Digimon or Tamers can't unsuspend until the end of their turn.",
        timing: "WhenDigivolving",
        printedTiming: "WhenDigivolving",
      },
    ]);
    expect(cursor.entries[0]?.effect).toEqual({
      cardId: "BT20-042",
      timing: "WhenDigivolving",
      timingLabel: "[When Digivolving]",
      isInherited: false,
      clause:
        "[On Play] [When Digivolving] Suspend 1 of your opponent's Digimon or Tamers. Then, 1 of their Digimon or Tamers can't unsuspend until the end of their turn.",
    });
  });

  it("prefers the printed timing over the watcher event and marks inherited clauses", () => {
    const cursor = appendEvents([
      {
        kind: "effectTriggered",
        seat: 1,
        sourceCardId: "EX13-021",
        effectKey: "EX13-021/ir-35-2",
        description:
          "[All Turns] [Once Per Turn] When this Digimon with [Dracomon] or [Examon] in its text suspends, it may unsuspend.",
        timing: "whenSuspended",
        printedTiming: "AllTurns",
        isInherited: true,
      },
    ]);
    expect(cursor.entries[0]?.effect).toMatchObject({
      timingLabel: "[All Turns]",
      isInherited: true,
    });
  });

  it("leaves resolution lines without effect details", () => {
    const cursor = appendEvents([
      { kind: "effectResolved", seat: 0, sourceCardId: "BT20-042", effectKey: "BT20-042/ir-7-0", description: "" },
    ]);
    expect(cursor.entries[0]?.effect).toBeUndefined();
  });
});

describe("effect narration roles", () => {
  it("marks the triggered effect as the source and its outcomes as results within the batch", () => {
    const cursor = appendEvents([
      { kind: "cardPlayed", seat: 0, cardId: "BT1-029" },
      { kind: "effectTriggered", seat: 0, sourceCardId: "BT1-029", effectKey: "onPlay", description: "Draw 1" },
      { kind: "cardPlayed", seat: 0, cardId: "ST1-03" },
    ]);
    expect(cursor.entries.map((entry) => entry.effectRole)).toEqual([
      undefined,
      LogEffectRole.SOURCE.value,
      LogEffectRole.RESULT.value,
    ]);
  });
});
