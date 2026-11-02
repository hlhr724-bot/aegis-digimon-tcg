import { hasDistinctRepresentatives } from "./hasDistinctRepresentatives.js";

// "With different XX" (Comprehensive Rules 4-24, Rule Manual "With different XX").
//
// A multicolor card does NOT occupy every one of its colors. Rule 4-24-2: when a card
// carries several instances of the referenced information, the differing portions may be
// referenced separately, so each chosen card only needs ONE color that no other chosen
// card is using. The manual's own example: two cards that are both red/blue satisfy
// "cards with different colors" — one is read as red, the other as blue.
//
// So a selection is legal exactly when a system of distinct representatives exists: an
// assignment of one distinct color to every chosen card. That is bipartite matching
// (cards ↔ colors), not pairwise-disjoint color sets.

/**
 * True when every color set can be assigned a distinct color (Kuhn's matching).
 * A card with no colors can never be assigned one, so it fails the requirement.
 */
export function canAssignDistinctColors(colorSets: readonly (readonly string[])[]): boolean {
  return hasDistinctRepresentatives(colorSets);
}

/**
 * Greedily keep the picks, in order, that preserve a valid distinct-color assignment.
 * Used server-side to sanitize a submitted selection.
 */
export function filterToDistinctColors<T>(items: readonly T[], colorsOf: (item: T) => readonly string[]): T[] {
  const kept: T[] = [];
  const keptColors: (readonly string[])[] = [];
  for (const item of items) {
    const colors = colorsOf(item);
    keptColors.push(colors);
    if (canAssignDistinctColors(keptColors)) {
      kept.push(item);
    } else {
      keptColors.pop();
    }
  }
  return kept;
}
