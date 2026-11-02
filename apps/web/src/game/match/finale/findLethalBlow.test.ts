import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@aegis/shared/protocol/events";
import { findLethalBlow } from "@/game/match/finale/findLethalBlow";
import type { ServerBatch } from "@/net/serverBatches";

function buildBatch(id: string, events: readonly ServerEvent[]): ServerBatch {
  return {
    id,
    stateVersion: 1,
    events: events.map((event, seq) => ({ ...event, seq, batch: id, stateVersion: 1 })),
  };
}

const LETHAL_ATTACK: ServerEvent = {
  kind: "attackDeclared",
  seat: 0,
  attackerPermanentId: "attacker",
  attackerCardId: "BT1-010",
  attackerArtId: "BT1-010_P1",
  target: { kind: "player" },
};

const SECURITY_WIN: ServerEvent = { kind: "gameOver", result: { outcome: "win", winnerSeat: 0 }, reason: "security" };

describe("findLethalBlow", () => {
  it("names the winner and the attacker of the blow that emptied the security stack", () => {
    const blow = findLethalBlow({ batches: [buildBatch("a", [LETHAL_ATTACK, SECURITY_WIN])] });

    expect(blow).toEqual({
      key: "a",
      winnerSeat: 0,
      attacker: { permanentId: "attacker", cardId: "BT1-010", artId: "BT1-010_P1" },
    });
  });

  it("finds the attack in an earlier batch of the same turn", () => {
    const blow = findLethalBlow({ batches: [buildBatch("a", [LETHAL_ATTACK]), buildBatch("b", [SECURITY_WIN])] });

    expect(blow?.key).toBe("b");
    expect(blow?.attacker?.permanentId).toBe("attacker");
  });

  it("ignores an attack from an earlier turn", () => {
    const turnEnded: ServerEvent = { kind: "turnEnded", endingSeat: 0, nextSeat: 1, turnCount: 3 };
    const blow = findLethalBlow({
      batches: [buildBatch("a", [LETHAL_ATTACK, turnEnded]), buildBatch("b", [SECURITY_WIN])],
    });

    expect(blow?.attacker).toBeUndefined();
  });

  it("plays no finale for a match that ended any other way", () => {
    const deckOut: ServerEvent = { kind: "gameOver", result: { outcome: "win", winnerSeat: 1 }, reason: "deckOut" };
    const draw: ServerEvent = { kind: "gameOver", result: { outcome: "draw" }, reason: "security" };

    expect(findLethalBlow({ batches: [buildBatch("a", [deckOut])] })).toBeUndefined();
    expect(findLethalBlow({ batches: [buildBatch("a", [draw])] })).toBeUndefined();
    expect(findLethalBlow({ batches: [buildBatch("a", [LETHAL_ATTACK])] })).toBeUndefined();
  });
});
