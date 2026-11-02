import type { ReplayDecks } from "@aegis/shared/replays/ReplayDeck";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import type { Seat } from "@aegis/shared/schema/enums";

type Params = {
  decks: ReadonlyMap<Seat, UsedDeck>;
  sharedSeats: readonly boolean[];
  viewerSeat?: Seat;
};

export function buildReplayDecks({ decks, sharedSeats, viewerSeat }: Params): ReplayDecks {
  return ([0, 1] as const).map((seat) => {
    const deck = decks.get(seat);
    if (!deck || (seat !== viewerSeat && !sharedSeats[seat])) {
      return null;
    }
    return structuredClone({
      deckName: deck.deckName,
      mainDeck: deck.mainDeck,
      eggDeck: deck.eggDeck,
      ...(deck.mainDeckArts ? { mainDeckArts: deck.mainDeckArts } : {}),
      ...(deck.eggDeckArts ? { eggDeckArts: deck.eggDeckArts } : {}),
    });
  }) as ReplayDecks;
}
