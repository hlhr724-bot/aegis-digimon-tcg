import type { UsedDeck } from "#shared/decks/UsedDeck";
import type { RematchMode } from "#shared/protocol/RematchMode";

/**
 * Best-of-three messages. Everything both seats may see lives in `GameState.series`; this channel
 * carries only what is one seat's alone (its seat token) and the two things a seat can ask for.
 */
export const SERIES_CHANNEL = "series" as const;

export type SeriesClientMessage =
  | { action: "chooseTurnOrder"; goFirst: boolean }
  | { action: "leave" }
  | { action: "offerRematch"; mode: RematchMode }
  | { action: "answerRematch"; accept: boolean }
  | { action: "chooseSeriesDeck"; deck?: SeriesDeckChoice };

export type SeriesDeckChoice = Omit<UsedDeck, "deckId" | "format"> & { deckId?: string };

/** Unicast. The token is the seat's only claim on its place in the next game's room. */
export interface SeriesSeatMessage {
  kind: "seat";
  seriesId: string;
  seatToken: string;
}
