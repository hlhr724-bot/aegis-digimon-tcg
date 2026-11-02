import { VALIDATED_FAMOUS_DECKS } from "@aegis/shared";
import { isDeckFormat, type DeckFormat } from "@aegis/shared/deckFormat";
import { MATCHUP_GAME_COUNTS, type MatchupGameCount } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { validateDecklist } from "#api/engine/deckValidation";
import type { Decklist } from "#api/engine/setup";
import type { MatchupRequest } from "#api/deckSimulation/MatchupRequest";
import { MatchupRequestError } from "#api/deckSimulation/MatchupRequestError";

const MAX_NAME_LENGTH = 80;

function parseDecklist(input: unknown, code: string, format: DeckFormat | undefined): Decklist {
  if (typeof input !== "object" || input === null) throw new MatchupRequestError(code);
  const { mainDeck, eggDeck } = input as Record<string, unknown>;
  if (
    !Array.isArray(mainDeck) ||
    !Array.isArray(eggDeck) ||
    mainDeck.length > 60 ||
    eggDeck.length > 10 ||
    !mainDeck.every((card) => typeof card === "string") ||
    !eggDeck.every((card) => typeof card === "string")
  ) {
    throw new MatchupRequestError(code);
  }
  const deck = { mainDeck: [...mainDeck] as string[], eggDeck: [...eggDeck] as string[] };
  if (!validateDecklist(deck, { format }).ok) throw new MatchupRequestError(code);
  return deck;
}

function parseOpponent(
  input: unknown,
  deck: Decklist,
  format: DeckFormat | undefined,
): { opponent: Decklist; opponentName: string } {
  if (typeof input !== "object" || input === null) throw new MatchupRequestError("invalid_opponent");
  const value = input as Record<string, unknown>;
  if (value.mirror === true) return { opponent: deck, opponentName: "" };
  if (typeof value.famousDeckId === "string") {
    const famous = VALIDATED_FAMOUS_DECKS.find((entry) => entry.deckId === value.famousDeckId);
    if (famous === undefined) throw new MatchupRequestError("invalid_opponent");
    return {
      opponent: { mainDeck: [...famous.decklist.mainDeck], eggDeck: [...famous.decklist.eggDeck] },
      opponentName: famous.name,
    };
  }
  const name = typeof value.name === "string" ? value.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  return { opponent: parseDecklist(value.deck, "invalid_opponent", format), opponentName: name };
}

export function parseMatchupRequest(input: unknown): MatchupRequest {
  if (typeof input !== "object" || input === null) throw new MatchupRequestError("invalid_request");
  const value = input as Record<string, unknown>;
  if (!MATCHUP_GAME_COUNTS.includes(value.games as MatchupGameCount)) throw new MatchupRequestError("invalid_games");
  if (value.format !== undefined && !isDeckFormat(value.format)) throw new MatchupRequestError("invalid_format");
  const format = value.format as DeckFormat | undefined;
  const deck = parseDecklist(value.deck, "invalid_deck", format);
  return { deck, ...parseOpponent(value.opponent, deck, format), games: value.games as MatchupGameCount };
}
