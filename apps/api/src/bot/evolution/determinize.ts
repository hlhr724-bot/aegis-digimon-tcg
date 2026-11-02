import { Zone, type CardInstance, type Seat } from "@aegis/shared";
import type { GameEngine } from "../../engine/GameEngine.js";
import { fillZone } from "../../engine/state/access.js";
import { makeRng, seatSeed, shuffleInPlace } from "../../engine/setup.js";
import { isHiddenSamplingWindow } from "#api/bot/evolution/isHiddenSamplingWindow";

/** Open decklist belief: unknown copies are uniform over unknown hand/deck/security slots.
 * Previously seen copies are NOT pinned to their authoritative hidden location.
 * This approximation discards remembered top-deck/hand information rather than leaking it.
 * Only call at a settled main-phase window or the observer's own block or Counter window,
 * never inside a resolving private selection.
 */
export async function determinize(engine: GameEngine, observer: Seat, seed: number): Promise<void> {
  if (!isHiddenSamplingWindow({ engine, observer }))
    throw new Error("Hidden sampling requires a settled main-phase or own block or Counter window");
  for (const player of engine.state.players) {
    const random = makeRng(seatSeed(seed, player.seat));
    const deck = Array.from(player.deck);
    const hiddenSecurity = Array.from(player.security).filter((card) => !card.faceUp);
    const hiddenHand = player.seat === observer ? [] : Array.from(player.hand).filter((card) => !card.faceUp);
    // Canonical input makes sampling independent of the actual hidden deal/order.
    const pool = [...deck, ...hiddenSecurity, ...hiddenHand].sort((left, right) =>
      left.instanceId.localeCompare(right.instanceId),
    );
    shuffleInPlace(pool, random);
    const sampleDeck = pool.splice(0, deck.length);
    const sampleHand = pool.splice(0, hiddenHand.length);
    let index = 0;
    const sampleSecurity = Array.from(player.security, (card) => (card.faceUp ? card : pool[index++]!));
    for (const card of [...sampleDeck, ...sampleHand, ...pool]) card.faceUp = false;
    // Detach every sampled copy first; never attach one Schema instance to two zones.
    const faceUpSecurity: CardInstance[] = Array.from(player.security).filter((card) => card.faceUp);
    fillZone(player, Zone.Deck, []);
    fillZone(player, Zone.Security, faceUpSecurity);
    const faceUpHand = player.seat === observer ? [] : Array.from(player.hand).filter((card) => card.faceUp);
    if (player.seat !== observer) fillZone(player, Zone.Hand, faceUpHand);
    fillZone(player, Zone.Deck, sampleDeck);
    fillZone(player, Zone.Security, sampleSecurity);
    if (player.seat !== observer) fillZone(player, Zone.Hand, [...faceUpHand, ...sampleHand]);
    const eggs = shuffleInPlace(
      Array.from(player.eggDeck).sort((left, right) => left.instanceId.localeCompare(right.instanceId)),
      random,
    );
    fillZone(player, Zone.EggDeck, eggs);
  }
  // Future shuffles must not use the real game's hidden random stream.
  const streams = [makeRng(seatSeed(seed ^ 0x51a7, 0)), makeRng(seatSeed(seed ^ 0x51a7, 1))];
  engine.rngForSeat = (seat) => streams[seat]!;
  engine.syncCounts();
  await engine.recomputeContinuousEffects();
}
