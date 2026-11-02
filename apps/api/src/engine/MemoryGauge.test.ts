import { describe, it, expect } from "vitest";
import { GameState, PlayerState, type ServerEvent, type Seat } from "@aegis/shared";
import { MemoryGauge, MEMORY_MAX, MEMORY_MIN, PASS_TURN_MEMORY, DEFAULT_TURN_END_MIN_MEMORY } from "./MemoryGauge.js";

/** Minimal GameState with both seats present and a chosen turn player. */
function makeState(turnSeat: Seat = 0, memory = 0): GameState {
  const state = new GameState();
  state.turnSeat = turnSeat;
  state.memory = memory;
  for (const seat of [0, 1] as const) {
    const player = new PlayerState();
    player.seat = seat;
    state.players[seat] = player;
  }
  return state;
}

/** Gauge plus a captured list of emitted memoryChanged events. */
function makeGauge(turnSeat: Seat = 0, memory = 0) {
  const state = makeState(turnSeat, memory);
  const events: Array<{ from: number; to: number; reason: string }> = [];
  const emit = (event: ServerEvent) => {
    if (event.kind === "memoryChanged") {
      events.push({ from: event.from, to: event.to, reason: event.reason });
    }
  };
  return { state, gauge: new MemoryGauge(state, emit), events };
}

describe("MemoryGauge: turn-relative storage and perspective", () => {
  it("memoryFor returns +memory for the turn player and -memory for the opponent", () => {
    const { gauge } = makeGauge(0, 4);
    expect(gauge.value).toBe(4);
    expect(gauge.memoryFor(0)).toBe(4); // turn player
    expect(gauge.memoryFor(1)).toBe(-4); // opponent
  });

  it("respects which seat is the turn player", () => {
    const { gauge } = makeGauge(1, 4);
    expect(gauge.memoryFor(1)).toBe(4);
    expect(gauge.memoryFor(0)).toBe(-4);
  });
});

describe("MemoryGauge.gainMemory (turn-player AddMemory)", () => {
  it("adds in the turn player's favour and emits a memoryChanged", () => {
    const { gauge, events } = makeGauge(0, 0);
    gauge.gainMemory(3);
    expect(gauge.value).toBe(3);
    expect(events).toEqual([{ from: 0, to: 3, reason: "gainMemory" }]);
  });

  it("a negative amount hands memory toward the opponent", () => {
    const { gauge } = makeGauge(0, 2);
    gauge.gainMemory(-5);
    expect(gauge.value).toBe(-3);
    expect(gauge.memoryFor(1)).toBe(3); // opponent now ahead by 3
  });

  it("clamps at +10 and does not emit when the value is unchanged", () => {
    const { gauge, events } = makeGauge(0, 9);
    gauge.gainMemory(5); // would be 14
    expect(gauge.value).toBe(MEMORY_MAX);
    gauge.gainMemory(1); // already at ceiling -> no change, no event
    expect(gauge.value).toBe(MEMORY_MAX);
    expect(events).toEqual([{ from: 9, to: 10, reason: "gainMemory" }]);
  });

  it("amount === 0 is a no-op (source short-circuit)", () => {
    const { gauge, events } = makeGauge(0, 4);
    gauge.gainMemory(0);
    expect(gauge.value).toBe(4);
    expect(events).toHaveLength(0);
  });

  it("does not gain past the ceiling for the acting seat (CanAddMemory)", () => {
    const { gauge, events } = makeGauge(0, MEMORY_MAX);
    expect(gauge.canGainMemory(0)).toBe(false);
    gauge.gainMemory(2);
    expect(gauge.value).toBe(MEMORY_MAX);
    expect(events).toHaveLength(0);
  });
});

describe("MemoryGauge.addMemoryForSeat (per-seat AddMemory)", () => {
  it("adds for the opponent by lowering the turn-relative store", () => {
    const { gauge } = makeGauge(0, 0);
    gauge.addMemoryForSeat(1, 3); // opponent gains 3
    expect(gauge.memoryFor(1)).toBe(3);
    expect(gauge.value).toBe(-3);
  });

  it("adds for the turn player by raising the store", () => {
    const { gauge } = makeGauge(0, 1);
    gauge.addMemoryForSeat(0, 2);
    expect(gauge.value).toBe(3);
  });

  it("honours the per-seat ceiling independently", () => {
    const { gauge } = makeGauge(0, -10); // opponent is at +10 (their ceiling)
    expect(gauge.memoryFor(1)).toBe(MEMORY_MAX);
    expect(gauge.canGainMemory(1)).toBe(false);
    gauge.addMemoryForSeat(1, 5); // opponent cannot gain past +10
    expect(gauge.value).toBe(MEMORY_MIN);
  });
});

describe("MemoryGauge.setMemoryForSeat", () => {
  it("raises the turn player to the fixed value", () => {
    const { gauge } = makeGauge(0, 0);
    gauge.setMemoryForSeat(0, 3);
    expect(gauge.value).toBe(3);
    expect(gauge.memoryFor(0)).toBe(3);
  });

  it("lowers the seat to the fixed value", () => {
    const { gauge, events } = makeGauge(0, 5);
    gauge.setMemoryForSeat(0, 3);
    expect(gauge.value).toBe(3);
    expect(events).toEqual([{ from: 5, to: 3, reason: "setMemory" }]);
  });

  it("sets the opponent's perspective and stores it negated", () => {
    const { gauge } = makeGauge(0, 0);
    gauge.setMemoryForSeat(1, 3); // opponent set to 3
    expect(gauge.memoryFor(1)).toBe(3);
    expect(gauge.value).toBe(-3);
  });

  it("seatless setMemory sets unconditionally (Primitives form)", () => {
    const { gauge } = makeGauge(0, 5);
    gauge.setMemory(2); // unconditional, unlike setMemoryForSeat
    expect(gauge.value).toBe(2);
  });
});

describe("MemoryGauge cost payment", () => {
  it("maxCostFor is the seat's own memory plus the floor distance", () => {
    const { gauge } = makeGauge(0, 4);
    // turn player at +4 can pay down to -10 => 14
    expect(gauge.maxCostFor(0)).toBe(4 - MEMORY_MIN);
    // opponent at -4 can pay 6 before hitting their floor
    expect(gauge.maxCostFor(1)).toBe(-4 - MEMORY_MIN);
  });

  it("canPay enforces 0..maxCostFor", () => {
    const { gauge } = makeGauge(0, 2);
    expect(gauge.canPay(0, 0)).toBe(true);
    expect(gauge.canPay(0, 12)).toBe(true); // 2 - (-10) = 12
    expect(gauge.canPay(0, 13)).toBe(false);
    expect(gauge.canPay(0, -1)).toBe(false);
  });

  it("paying as the turn player drives the gauge toward the opponent", () => {
    const { gauge, events } = makeGauge(0, 5);
    const after = gauge.pay(0, 3);
    expect(after).toBe(2);
    expect(gauge.value).toBe(2);
    expect(events).toEqual([{ from: 5, to: 2, reason: "payCost" }]);
  });

  it("paying can cross the gauge to the opponent's side", () => {
    const { gauge } = makeGauge(0, 1);
    gauge.pay(0, 4); // 1 -> -3
    expect(gauge.value).toBe(-3);
    expect(gauge.memoryFor(1)).toBe(3);
  });

  it("non-positive cost is a no-op", () => {
    const { gauge, events } = makeGauge(0, 5);
    expect(gauge.pay(0, 0)).toBe(5);
    expect(gauge.pay(0, -2)).toBe(5);
    expect(events).toHaveLength(0);
  });
});

describe("MemoryGauge end-of-turn normalization", () => {
  it("hasCrossedToOpponent is true once the opponent reaches the min memory", () => {
    const crossed = makeGauge(0, -DEFAULT_TURN_END_MIN_MEMORY).gauge;
    expect(crossed.hasCrossedToOpponent()).toBe(true); // opponent at +1

    const notCrossed = makeGauge(0, 0).gauge;
    expect(notCrossed.hasCrossedToOpponent()).toBe(false); // opponent at 0
  });

  it("respects a raised turn-end minimum (effect-driven override is passed in)", () => {
    const { gauge } = makeGauge(0, -1); // opponent at +1
    expect(gauge.hasCrossedToOpponent(1)).toBe(true);
    expect(gauge.hasCrossedToOpponent(2)).toBe(false); // needs +2 with the override
  });

  it("uses the active card override when no explicit minimum is supplied", () => {
    const { gauge } = makeGauge(0, -1); // opponent at +1
    gauge.setTurnEndMinMemory(0, 3);
    expect(gauge.hasCrossedToOpponent()).toBe(false);
    gauge.clearTurnEndMinMemoryOverrides();
    expect(gauge.hasCrossedToOpponent()).toBe(true);
  });

  it("resetForPassedTurn grants +3 in the (already re-framed) turn player's favour", () => {
    const { gauge, events } = makeGauge(0, -2);
    gauge.resetForPassedTurn();
    expect(gauge.value).toBe(PASS_TURN_MEMORY);
    expect(events).toEqual([{ from: -2, to: 3, reason: "passTurn" }]);
  });
});
