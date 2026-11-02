import { DeckStatsWindow } from "#shared/decks/DeckStatsWindow";

export function getDeckStatsMatchLimit(window: DeckStatsWindow | undefined): number | undefined {
  return Object.values(DeckStatsWindow).find((entry) => entry.value === window)?.matchLimit;
}
