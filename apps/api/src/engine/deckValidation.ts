import type { TournamentBanlistCard } from "@aegis/shared/tournaments/index";
import {
  deckFormat,
  formatCopyLimit,
  formatCardViolation,
  formatPairViolations,
  type DeckFormat,
  getCardDefinition,
  isBetaOnlyCard,
  sharedCardNumberGroups,
  CardKind,
} from "@aegis/shared";
import { MAIN_DECK_SIZE, MAX_EGG_DECK_SIZE } from "./testDecks.js";

/**
 * Server-authoritative deck-legality gate (subsystem: deck-and-setup; BLK-05.2 /
 * SYS-05). The client-supplied deck is attacker-controlled input — the server owns
 * 100% of the rules, so an illegal deck must be rejected here, never trusted.
 *
 *   1. every cardId resolves to a known CardDefinition (no fabricated ids),
 *   2. main deck is exactly 50 and the egg deck is at most 5 (the `deck-and-setup`
 *      sizes, shared with `testDecks.assertLegalDeck`),
 *   3. Digi-Eggs may only appear in the egg deck; non-Digi-Eggs may only appear in
 *      the main deck (Comprehensive Rules §1-4),
 *   4. each distinct cardId's total count across the whole deck is within its
 *      default 4, lowered by an active banlist restriction (1 for restricted, 0 for
 *      banned), and printings that share a card number ("[Rule] Card Number: Also
 *      treated as [P-009]", `sharedCardNumberGroups`) share one such budget,
 *   5. no banned pair is present: a banned-pair card is legal alone but may not share
 *      a deck with its partner (`BANNED_PAIRS` in @aegis/shared).
 *   6. a card from a product that has not released yet (`isBetaOnlyCard`) may only be
 *      played in a beta-battle-mode match — see `betaBattleMode` below.
 */
export type DecklistValidation = { ok: true } | { ok: false; reason: string };

interface ReadonlyDecklist {
  readonly mainDeck: readonly string[];
  readonly eggDeck: readonly string[];
}

/**
 * Validate a decklist. `betaBattleMode` gates cards from an announced-but-unreleased
 * product (`isBetaOnlyCard`, e.g. EX13 ahead of its street date): such a card is
 * illegal outside a beta-battle-mode match, so a casual/ranked/tournament deck cannot
 * smuggle in a preview card that has not gone on sale yet.
 */
export function validateDecklist(
  deck: ReadonlyDecklist,
  options?: {
    betaBattleMode?: boolean;
    unlimited?: boolean;
    format?: DeckFormat;
    banlistCards?: readonly TournamentBanlistCard[];
  },
): DecklistValidation {
  const betaBattleMode = options?.betaBattleMode ?? false;
  const format = deckFormat(options?.format, options?.unlimited);
  const frozen =
    options?.banlistCards === undefined
      ? undefined
      : new Map(options.banlistCards.map((entry) => [entry.cardId, entry]));
  const copyLimit = (cardId: string): number => {
    if (!frozen) {
      return formatCopyLimit(cardId, format);
    }
    const printed = getCardDefinition(cardId)?.maxCountInDeck ?? 4;
    const restriction = frozen.get(cardId);
    if (!restriction || restriction.status === "banned_pair") {
      return printed;
    }
    return restriction.status === "banned" ? 0 : Math.min(printed, restriction.allowedCopies);
  };
  for (const cardId of [...deck.mainDeck, ...deck.eggDeck]) {
    const reason = formatCardViolation(cardId, format);
    if (reason) return { ok: false, reason };
  }
  for (const cardId of deck.mainDeck) {
    const def = getCardDefinition(cardId);
    if (def === undefined) {
      return { ok: false, reason: `unknown card: ${cardId}` };
    }
    if (def.kinds.includes(CardKind.DigiEgg)) {
      return { ok: false, reason: `Digi-Egg ${cardId} belongs in the egg deck, not the main deck` };
    }
    if (!betaBattleMode && isBetaOnlyCard(def)) {
      return { ok: false, reason: `${cardId} is not released yet and is only legal in beta battle mode` };
    }
  }

  for (const cardId of deck.eggDeck) {
    const def = getCardDefinition(cardId);
    if (def === undefined) {
      return { ok: false, reason: `unknown card: ${cardId}` };
    }
    if (!def.kinds.includes(CardKind.DigiEgg)) {
      return { ok: false, reason: `non-Digi-Egg ${cardId} cannot go in the egg deck` };
    }
    if (!betaBattleMode && isBetaOnlyCard(def)) {
      return { ok: false, reason: `${cardId} is not released yet and is only legal in beta battle mode` };
    }
  }

  if (deck.mainDeck.length !== MAIN_DECK_SIZE) {
    return {
      ok: false,
      reason: `main deck must be exactly ${MAIN_DECK_SIZE} cards, got ${deck.mainDeck.length}`,
    };
  }
  if (deck.eggDeck.length > MAX_EGG_DECK_SIZE) {
    return {
      ok: false,
      reason: `egg deck must be at most ${MAX_EGG_DECK_SIZE} cards, got ${deck.eggDeck.length}`,
    };
  }

  const allCards = [...deck.mainDeck, ...deck.eggDeck];
  const counts = new Map<string, number>();
  for (const cardId of allCards) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  for (const [cardId, count] of counts) {
    const cap = copyLimit(cardId);
    if (count > cap) {
      return {
        ok: false,
        reason: `too many copies of ${cardId}: ${count} > limit ${cap}`,
      };
    }
  }

  for (const [, members] of sharedCardNumberGroups(allCards)) {
    if (members.length < 2) continue;
    const total = members.reduce((sum, cardId) => sum + (counts.get(cardId) ?? 0), 0);
    const cap = Math.min(...members.map(copyLimit));
    if (total > cap) {
      return {
        ok: false,
        reason: `too many copies of ${members.join(" + ")} (shared card number): ${total} > limit ${cap}`,
      };
    }
  }

  const pairViolation = frozen
    ? [...frozen.values()].flatMap((entry) =>
        entry.status === "banned_pair" && allCards.includes(entry.cardId)
          ? (entry.pairPartnerIds ?? [])
              .filter((partner) => allCards.includes(partner))
              .map((partner) => [entry.cardId, partner] as const)
          : [],
      )[0]
    : formatPairViolations(allCards, format)[0];
  if (pairViolation !== undefined) {
    const [cardId, partnerCardId] = pairViolation;
    return {
      ok: false,
      reason: `${cardId} is banned in decks containing ${partnerCardId}`,
    };
  }

  return { ok: true };
}
