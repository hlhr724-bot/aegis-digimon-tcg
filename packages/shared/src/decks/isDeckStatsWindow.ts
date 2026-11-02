import { DeckStatsWindow } from "#shared/decks/DeckStatsWindow";

export function isDeckStatsWindow(value: unknown): value is DeckStatsWindow {
  return typeof value === "string" && Object.values(DeckStatsWindow).some((entry) => entry.value === value);
}
