import { isBetaOnlyCard } from "@aegis/shared/cards/cardPool";
import { sharedCardNumberGroups } from "@aegis/shared/cards/sharedCardNumbers";
import { formatCardViolation, type DeckFormat } from "@aegis/shared/deckFormat";
import { getCardDefinition, isDigiEgg, type TournamentBanlistCard } from "@aegis/shared";

/**
 * Deck legality for a competitive event, as a pure function of the deck and the banlist snapshot
 * the tournament froze at creation. It never reads the live banlist — not for copy limits and not
 * for pair topology — because a tournament that started under one banlist must keep judging decks
 * by that banlist for its whole life.
 *
 * The snapshot is the only restriction input: an empty list is the "none" policy and leaves only
 * the deck-building rules (sizes, egg/main separation, printed copy limits) in force.
 */

export const MAIN_DECK_SIZE = 50;
export const EGG_DECK_MAX = 5;

export type CompetitiveDeck = { mainDeck: readonly string[]; eggDeck: readonly string[] };

export type DeckViolation =
  | { kind: "outside_format"; cardId: string }
  | { kind: "unknown_card"; cardId: string }
  | { kind: "main_deck_size"; size: number; required: number }
  | { kind: "egg_deck_size"; size: number; max: number }
  | { kind: "wrong_deck"; cardId: string; belongsIn: "main" | "egg" }
  | { kind: "banned"; cardId: string }
  | { kind: "over_copy_limit"; cardId: string; copies: number; allowed: number }
  | { kind: "banned_pair"; cardId: string; conflictsWith: string };

export type DeckLegality = { legal: boolean; violations: DeckViolation[] };

export function validateCompetitiveDeck(
  deck: CompetitiveDeck,
  banlistCards: readonly TournamentBanlistCard[] = [],
  format: DeckFormat = "standard",
): DeckLegality {
  const restrictions = new Map(banlistCards.map((card) => [card.cardId, card]));
  const violations: DeckViolation[] = [
    ...sizeViolations(deck),
    ...placementViolations(deck),
    ...copyViolations(deck, restrictions),
    ...pairViolations(deck, restrictions),
    ...[...new Set([...deck.mainDeck, ...deck.eggDeck])]
      .filter((cardId) => {
        const card = getCardDefinition(cardId);
        return card && (isBetaOnlyCard(card) || formatCardViolation(cardId, format));
      })
      .map((cardId): DeckViolation => ({ kind: "outside_format", cardId })),
  ];
  return { legal: violations.length === 0, violations };
}

function sizeViolations(deck: CompetitiveDeck): DeckViolation[] {
  const violations: DeckViolation[] = [];
  if (deck.mainDeck.length !== MAIN_DECK_SIZE)
    violations.push({ kind: "main_deck_size", size: deck.mainDeck.length, required: MAIN_DECK_SIZE });
  if (deck.eggDeck.length > EGG_DECK_MAX)
    violations.push({ kind: "egg_deck_size", size: deck.eggDeck.length, max: EGG_DECK_MAX });
  return violations;
}

function placementViolations(deck: CompetitiveDeck): DeckViolation[] {
  const violations: DeckViolation[] = [];
  const seen = new Set<string>();
  const check = (cardId: string, deckPart: "main" | "egg") => {
    if (seen.has(`${deckPart}:${cardId}`)) return;
    seen.add(`${deckPart}:${cardId}`);
    const definition = getCardDefinition(cardId);
    if (!definition) {
      violations.push({ kind: "unknown_card", cardId });
      return;
    }
    const belongsIn = isDigiEgg(definition) ? "egg" : "main";
    if (belongsIn !== deckPart) violations.push({ kind: "wrong_deck", cardId, belongsIn });
  };
  for (const cardId of deck.mainDeck) check(cardId, "main");
  for (const cardId of deck.eggDeck) check(cardId, "egg");
  return violations;
}

/**
 * Copies are counted across both deck halves. A card only ever belongs to one of them, so the
 * combined count is the same number a per-half count would produce for a legal deck — and for an
 * illegal one it is the number the official rule actually caps.
 */
function copyViolations(
  deck: CompetitiveDeck,
  restrictions: ReadonlyMap<string, TournamentBanlistCard>,
): DeckViolation[] {
  const copies = new Map<string, number>();
  for (const cardId of [...deck.mainDeck, ...deck.eggDeck]) copies.set(cardId, (copies.get(cardId) ?? 0) + 1);
  const violations: DeckViolation[] = [];
  for (const [cardId, count] of copies) {
    const definition = getCardDefinition(cardId);
    if (!definition) continue; // already reported as unknown_card
    const allowed = Math.min(definition.maxCountInDeck, snapshotCopyLimit(restrictions.get(cardId)));
    if (count <= allowed) continue;
    if (allowed === 0) violations.push({ kind: "banned", cardId });
    else violations.push({ kind: "over_copy_limit", cardId, copies: count, allowed });
  }
  for (const [, members] of sharedCardNumberGroups([...copies.keys()])) {
    if (members.length < 2) continue;
    const count = members.reduce((total, cardId) => total + (copies.get(cardId) ?? 0), 0);
    const allowed = Math.min(
      ...members.map((cardId) =>
        Math.min(getCardDefinition(cardId)?.maxCountInDeck ?? 4, snapshotCopyLimit(restrictions.get(cardId))),
      ),
    );
    if (count > allowed) {
      violations.push({ kind: "over_copy_limit", cardId: members[0]!, copies: count, allowed });
    }
  }
  return violations;
}

/**
 * Mirrors the shared `effectiveCopyLimit` semantics: a `banned_pair` card is legal at its printed
 * count on its own, so it keeps its printed cap here whatever `allowedCopies` says — its
 * illegality comes only from {@link pairViolations}. Only `banned` zeroes the cap.
 */
function snapshotCopyLimit(restriction: TournamentBanlistCard | undefined): number {
  if (!restriction || restriction.status === "banned_pair") return Number.POSITIVE_INFINITY;
  return restriction.status === "banned" ? 0 : restriction.allowedCopies;
}

/**
 * A `banned_pair` entry carries its own partner list, frozen with the rest of the snapshot, so a
 * pair added to the live banlist after the event was created cannot reach back into it. An entry
 * from before the field existed has no partners and therefore constrains nothing. Both directions
 * are checked, so a snapshot that lists either member — or both — catches the same illegal deck.
 */
function pairViolations(
  deck: CompetitiveDeck,
  restrictions: ReadonlyMap<string, TournamentBanlistCard>,
): DeckViolation[] {
  const present = new Set([...deck.mainDeck, ...deck.eggDeck]);
  const reported = new Set<string>();
  const violations: DeckViolation[] = [];
  for (const [cardId, restriction] of restrictions) {
    if (restriction.status !== "banned_pair" || !present.has(cardId)) continue;
    for (const partner of restriction.pairPartnerIds ?? []) {
      if (!present.has(partner)) continue;
      const key = [cardId, partner].sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      violations.push({ kind: "banned_pair", cardId, conflictsWith: partner });
    }
  }
  return violations;
}
