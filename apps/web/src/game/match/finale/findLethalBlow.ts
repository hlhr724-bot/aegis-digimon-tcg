import type { MatchFinale, MatchFinaleAttacker } from "@/game/match/finale/MatchFinale";
import type { ServerBatch } from "@/net/serverBatches";

type Params = {
  batches: readonly ServerBatch[];
};

function findAttacker(batches: readonly ServerBatch[], winnerSeat: number): MatchFinaleAttacker | undefined {
  for (let batchIndex = batches.length - 1; batchIndex >= 0; batchIndex -= 1) {
    const events = batches[batchIndex]!.events;
    for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
      const event = events[eventIndex]!;
      if (event.kind === "turnEnded") {
        return undefined;
      }
      if (event.kind === "attackDeclared" && event.seat === winnerSeat) {
        return { permanentId: event.attackerPermanentId, cardId: event.attackerCardId, artId: event.attackerArtId };
      }
    }
  }
  return undefined;
}

export function findLethalBlow({ batches }: Params): MatchFinale | undefined {
  for (let batchIndex = batches.length - 1; batchIndex >= 0; batchIndex -= 1) {
    const batch = batches[batchIndex]!;
    for (const event of batch.events) {
      if (event.kind !== "gameOver") {
        continue;
      }
      if (event.reason !== "security" || event.result.outcome !== "win") {
        return undefined;
      }
      const winnerSeat = event.result.winnerSeat;
      return {
        key: batch.id,
        winnerSeat,
        attacker: findAttacker(batches.slice(0, batchIndex + 1), winnerSeat),
      };
    }
  }
  return undefined;
}
