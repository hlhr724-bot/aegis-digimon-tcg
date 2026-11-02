import { createHash } from "node:crypto";
import { getCardDefinition } from "@aegis/shared";
import { validateDecklist } from "../../engine/deckValidation.js";
import type { Decklist } from "../../engine/testDecks.js";
import { ALL_META_DECKS } from "../metaDecks/index.js";
import { createBotRandom } from "../rng.js";

/** Random composition, not just random selection of an intact tournament deck. */
export function randomDeck(seed: number): { id: string; deck: Decklist } {
  const random = createBotRandom(seed);
  const sources = ALL_META_DECKS.filter((source) => validateDecklist(source.decklist).ok);
  if (sources.length === 0) throw new Error("No legal source decks for random corpus");
  const source = sources[Math.floor(random.next() * sources.length)]!;
  const deck = { mainDeck: [...source.decklist.mainDeck], eggDeck: [...source.decklist.eggDeck] };
  const pool = [...new Set(sources.flatMap((entry) => entry.decklist.mainDeck))];
  // Preserve the curve and colors, but destroy fixed archetype composition. Every
  // accepted replacement goes through the same banlist/pair/copy gate as a player.
  for (let attempt = 0; attempt < 200; attempt++) {
    const index = Math.floor(random.next() * deck.mainDeck.length);
    const original = deck.mainDeck[index]!;
    const definition = getCardDefinition(original)!;
    const candidates = pool.filter((id) => {
      const card = getCardDefinition(id)!;
      return (
        card.level === definition.level &&
        card.kinds.join() === definition.kinds.join() &&
        card.colors.every((color) => definition.colors.includes(color))
      );
    });
    if (candidates.length === 0) continue;
    deck.mainDeck[index] = candidates[Math.floor(random.next() * candidates.length)]!;
    if (!validateDecklist(deck).ok) deck.mainDeck[index] = original;
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(deck)).digest("hex");
  return { id: `random-${seed}-${fingerprint.slice(0, 16)}`, deck };
}
