import type { GameEngine } from "#api/engine/GameEngine";
import { fillZone } from "#api/engine/state/access";
import { makeRng, seatSeed, shuffleInPlace } from "#api/engine/setup";
import { Zone } from "@aegis/shared/schema/enums";

export async function determinizeBotRoot(engine: GameEngine, seed: number): Promise<void> {
  if (engine.state.pendingDecision !== undefined || engine.state.combatWindow !== undefined) {
    throw new Error("Hidden sampling requires a settled main-phase window");
  }
  for (const player of engine.state.players) {
    const random = makeRng(seatSeed(seed, player.seat));
    const library = shuffleInPlace(
      Array.from(player.deck).sort((left, right) => left.instanceId.localeCompare(right.instanceId)),
      random,
    );
    for (const card of library) {
      card.faceUp = false;
    }
    fillZone(player, Zone.Deck, []);
    fillZone(player, Zone.Deck, library);
  }
  const streams = [makeRng(seatSeed(seed ^ 0x51a7, 0)), makeRng(seatSeed(seed ^ 0x51a7, 1))];
  engine.rngForSeat = (seat) => streams[seat]!;
  engine.syncCounts();
  await engine.recomputeContinuousEffects();
}
