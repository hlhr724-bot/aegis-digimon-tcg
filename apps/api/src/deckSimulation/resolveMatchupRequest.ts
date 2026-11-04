import { VALIDATED_FAMOUS_DECKS } from "@aegis/shared";
import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import type { CommunityMatchupDecks } from "#api/deckSimulation/CommunityMatchupDecks";
import type { MatchupOpponent } from "#api/deckSimulation/MatchupOpponent";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import type { MatchupRequestDraft } from "#api/deckSimulation/MatchupRequestDraft";
import { MatchupRequestError } from "#api/deckSimulation/MatchupRequestError";

type Params = { draft: MatchupRequestDraft; communityDecks: CommunityMatchupDecks };

async function resolveOpponents({ draft, communityDecks }: Params): Promise<MatchupOpponent[]> {
  const { opponent } = draft;
  if (opponent.kind === "mirror") return [{ name: "", deck: draft.deck }];
  if (opponent.kind === "list") return [{ name: opponent.name, deck: opponent.deck }];
  if (opponent.kind === "famous") {
    const famous = VALIDATED_FAMOUS_DECKS.find((entry) => entry.deckId === opponent.famousDeckId);
    if (famous === undefined) throw new MatchupRequestError("invalid_opponent");
    const coverCardId = [...new Set(famous.decklist.mainDeck)].at(-1);
    return [
      {
        name: famous.name,
        deck: { mainDeck: [...famous.decklist.mainDeck], eggDeck: [...famous.decklist.eggDeck] },
        ...(coverCardId === undefined ? {} : { coverCardId }),
        colors: [...famous.colors],
      },
    ];
  }
  const decks = await communityDecks.matchupOpponents({
    format: draft.format,
    deckIds: opponent.deckIds,
    limit: opponent.deckIds?.length ?? COMMUNITY_MATCHUP_LIMITS.defaultOpponents,
  });
  if (decks.length === 0 || (opponent.deckIds !== undefined && decks.length !== opponent.deckIds.length)) {
    throw new MatchupRequestError("invalid_opponent");
  }
  return decks.map((deck) => ({
    name: deck.name,
    deck: { mainDeck: [...deck.mainDeck], eggDeck: [...deck.eggDeck] },
    communityDeckId: deck.id,
    ...(deck.coverCardId === null ? {} : { coverCardId: deck.coverCardId }),
    colors: [...deck.colors],
  }));
}

export async function resolveMatchupRequest(params: Params): Promise<MatchupRequest> {
  return {
    deck: params.draft.deck,
    opponents: await resolveOpponents(params),
    gamesPerOpponent: params.draft.gamesPerOpponent,
    ...(params.draft.deckId === undefined ? {} : { deckId: params.draft.deckId }),
  };
}
