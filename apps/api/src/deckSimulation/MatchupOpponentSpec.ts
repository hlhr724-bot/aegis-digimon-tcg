import type { Decklist } from "#api/engine/setup";

export type MatchupOpponentSpec =
  | { kind: "mirror" }
  | { kind: "famous"; famousDeckId: string }
  | { kind: "list"; name: string; deck: Decklist }
  | { kind: "community"; deckIds: readonly string[] | undefined };
