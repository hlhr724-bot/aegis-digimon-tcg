import type { ServerEvent } from "@aegis/shared/protocol/events";
import type { Seat } from "@aegis/shared/schema/enums";

export type SeatStyleMetrics = {
  turns: number;
  securityAttacks: number;
  securityAttacksPerTurn: number;
  memoryPassed: number;
  memoryPassedPerTurn: number;
  blocksDeclared: number;
};

type Params = { events: readonly ServerEvent[] };

export function measureStyleEvents({ events }: Params) {
  const seats: [SeatStyleMetrics, SeatStyleMetrics] = [createSeatMetrics(), createSeatMetrics()];
  const turns = new Set<string>();
  let memory = 0;
  let attackerSeat: Seat | undefined;
  let previousTurnSeat: Seat | undefined;
  for (const event of events) {
    if (event.kind === "phaseChanged") {
      if (previousTurnSeat !== undefined && previousTurnSeat !== event.turnSeat) {
        memory = -memory;
      }
      previousTurnSeat = event.turnSeat;
      if (event.turnCount > 0) {
        const key = `${event.turnCount}:${event.turnSeat}`;
        if (!turns.has(key)) {
          turns.add(key);
          seats[event.turnSeat].turns += 1;
        }
      }
    } else if (event.kind === "memoryChanged") {
      memory = event.to;
    } else if (event.kind === "turnEnded") {
      seats[event.endingSeat].memoryPassed += Math.max(0, -memory);
    } else if (event.kind === "attackDeclared") {
      attackerSeat = event.seat;
      if (!event.redirected && event.target.kind === "player") {
        seats[event.seat].securityAttacks += 1;
      }
    } else if (event.kind === "blocked") {
      if (attackerSeat === undefined) {
        throw new Error("Style metrics require the attack declaration before a block");
      }
      seats[1 - attackerSeat]!.blocksDeclared += 1;
    }
  }
  for (const seat of seats) {
    if (seat.turns > 0) {
      seat.securityAttacksPerTurn = seat.securityAttacks / seat.turns;
      seat.memoryPassedPerTurn = seat.memoryPassed / seat.turns;
    }
  }
  return { gameLengthTurns: turns.size, seats };
}

function createSeatMetrics(): SeatStyleMetrics {
  return {
    turns: 0,
    securityAttacks: 0,
    securityAttacksPerTurn: 0,
    memoryPassed: 0,
    memoryPassedPerTurn: 0,
    blocksDeclared: 0,
  };
}
