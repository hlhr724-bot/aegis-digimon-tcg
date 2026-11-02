# Deck simulation

The deck editor helps players test a deck before they play it. This page describes
what each tool computes, where the work runs, and its limits.

## Draw odds

The **Draw odds** panel sits under the deck statistics in the editor. The player picks
up to four key cards. For each one, the panel shows the chance to have seen at least
one copy in the opening hand and by the start of each of the player's turns 1 to 6.

| Row             | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| One key card    | At least one copy of that card                       |
| All key cards   | At least one copy of every key card at the same time |
| Level 3 Digimon | At least one Level 3 Digimon, the usual first play   |

The numbers are exact, not sampled, so they update instantly while the player edits
counts. Below the table, each key card shows its chance at the selected turn now and
with one more copy in place of another card. Selecting a turn header moves that
comparison. A copy limit hides the comparison.

### Rules the calculation follows

- The opening hand has 5 cards (`OPENING_HAND_SIZE`).
- The next 5 cards become security (`SECURITY_STACK_SIZE`) and are never seen.
- The player going first skips the draw on turn 1. The player going second draws on
  every turn, including turn 1.
- With **Mulligan a hand that misses** on, an opening hand that has none of the row's
  cards is shuffled back and redrawn once. The second hand is always kept.
- The deck size is the current main deck count. A deck under 10 cards shows no table.

Security is placed after the opening hand, so the cards seen by a turn are a uniformly
random subset of the deck. The chance to miss a card with `c` copies after seeing `n`
of `N` cards is `C(N − c, n) / C(N, n)`. Combos use inclusion and exclusion over the
key cards. The mulligan case enumerates every opening hand composition and adds the
draws after it. A shuffled-deck simulation in the shared tests agrees within one
percentage point.

The two hand constants live in `packages/shared/src/rules/`, and the engine setup imports
them, so the panel and the engine cannot drift apart. The calculation is in
`packages/shared/src/decks/goldfish/`. The panel only presents its results, and
`apps/web/src/screens/deckSimulation/computeDeckDrawOdds.ts` turns editor counts into
rows.

### Limits

- Card effects that draw, search or reveal are not counted.
- The panel measures cards seen, not cards that can be played. It does not check memory,
  digivolution lines or colors.
- Key cards are not saved with the deck.
