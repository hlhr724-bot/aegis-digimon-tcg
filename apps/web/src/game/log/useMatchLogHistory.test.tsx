import { Phase } from "@aegis/shared/schema/enums";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SequencedServerEvent, ServerEvent } from "@aegis/shared/protocol/events";
import { useMatchLogHistory } from "@/game/log/useMatchLogHistory";
import { translator } from "@/i18n/translator";

const defaults = {
  resetKey: 0,
  viewerSeat: 0 as const,
  seatNames: { 0: "Alice", 1: "Bob" },
  instanceIndex: new Map<string, string>(),
  t: translator("en"),
};

function getEvents(count: number): SequencedServerEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    kind: "cardPlayed",
    seat: 0,
    cardId: "ST1-03",
    seq: index + 1,
    batch: `batch-${index}`,
    stateVersion: index + 1,
  }));
}

afterEach(() => cleanup());

describe("whole-match client history", () => {
  it("keeps entries after they leave the 100-event cue window", () => {
    const events = getEvents(150);
    const { result, rerender } = renderHook((incoming) => useMatchLogHistory({ ...defaults, events: incoming }), {
      initialProps: events.slice(0, 100),
    });
    rerender(events.slice(50));
    expect(result.current.entries).toHaveLength(150);
    expect(result.current.entries[0]?.seq).toBe(1);
    expect(result.current.recent[0]?.seq).toBe(150);
    expect(result.current.recent).toHaveLength(30);
  });

  it("clears retained history on a rollback key", () => {
    const events = getEvents(100);
    const { result, rerender } = renderHook((props) => useMatchLogHistory({ ...defaults, ...props }), {
      initialProps: { events, resetKey: 0 },
    });
    rerender({ events: [], resetKey: 1 });
    expect(result.current.entries).toEqual([]);
    rerender({ events: events.slice(0, 2), resetKey: 1 });
    expect(result.current.entries).toHaveLength(2);
  });

  it("rebuilds when replay seeking moves backwards", () => {
    const events = getEvents(30);
    const { result, rerender } = renderHook((incoming) => useMatchLogHistory({ ...defaults, events: incoming }), {
      initialProps: events,
    });
    rerender(events.slice(0, 4));
    expect(result.current.entries).toHaveLength(4);
    expect(result.current.recent[0]?.seq).toBe(4);
  });

  it("backfills a skipped rolling window from retained batches", () => {
    const events = getEvents(250);
    const batches = [{ id: "all", events, stateVersion: 1 }];
    const { result, rerender } = renderHook(
      (incoming) => useMatchLogHistory({ ...defaults, events: incoming, batches }),
      { initialProps: events.slice(0, 20) },
    );
    rerender(events.slice(150));
    expect(result.current.entries).toHaveLength(250);
    expect(new Set(result.current.entries.map((entry) => entry.seq)).size).toBe(250);
  });

  it("rebuilds retained entries when the perspective changes", () => {
    const events = getEvents(150);
    const { result, rerender } = renderHook(
      (props: { events: SequencedServerEvent[]; viewerSeat: 0 | 1 }) => useMatchLogHistory({ ...defaults, ...props }),
      { initialProps: { events: events.slice(0, 100), viewerSeat: 0 } },
    );
    rerender({ events: events.slice(50), viewerSeat: 1 });
    expect(result.current.entries).toHaveLength(150);
    expect(result.current.entries.every((entry) => entry.kind === "opp")).toBe(true);
  });

  it("tracks fabricated unsequenced events with an index watermark", () => {
    const events: ServerEvent[] = [{ kind: "cardPlayed", seat: 0, cardId: "ST1-03" }];
    const { result, rerender } = renderHook((incoming) => useMatchLogHistory({ ...defaults, events: incoming }), {
      initialProps: events,
    });
    rerender([...events, ...events]);
    expect(result.current.entries).toHaveLength(2);
    rerender(events);
    expect(result.current.entries).toHaveLength(1);
  });
  it("seeds late joins from synchronized state and preserves that seed on relabel", () => {
    const events: SequencedServerEvent[] = [
      { kind: "memoryChanged", from: 3, to: -2, reason: "payCost", seq: 101, batch: "joined", stateVersion: 10 },
      { kind: "cardPlayed", seat: 1, cardId: "ST1-03", seq: 102, batch: "joined", stateVersion: 10 },
    ];
    const { result, rerender } = renderHook(
      (props: { viewerSeat: 0 | 1; turnCount: number }) =>
        useMatchLogHistory({
          ...defaults,
          events,
          viewerSeat: props.viewerSeat,
          initialTurn: { turnCount: props.turnCount, turnSeat: 1, phase: Phase.Main },
        }),
      { initialProps: { viewerSeat: 0, turnCount: 6 } },
    );
    expect(result.current.entries[0]).toMatchObject({
      turnCount: 6,
      turnSeat: 1,
      phase: Phase.Main,
      memory: { delta: -5, after: -2 },
    });
    rerender({ viewerSeat: 1, turnCount: 8 });
    expect(result.current.entries[0]).toMatchObject({ turnCount: 6, turnSeat: 1, memory: { delta: -5, after: -2 } });
  });

  it("retains grouped output when only the live instance index changes", () => {
    const events = getEvents(120);
    const { result, rerender } = renderHook(
      (instanceIndex) => useMatchLogHistory({ ...defaults, events, instanceIndex }),
      { initialProps: new Map<string, string>() },
    );
    const before = result.current;
    rerender(new Map([["new-permanent", "ST1-03"]]));
    expect(result.current).toBe(before);
  });
});
