import { COMMUNITY_MATCHUP_LIMITS } from "@aegis/shared/deckSimulation/COMMUNITY_MATCHUP_LIMITS";
import { isDeckFormat, type DeckFormat } from "@aegis/shared/deckFormat";
import { MATCHUP_GAME_COUNTS } from "@aegis/shared/deckSimulation/MATCHUP_GAME_COUNTS";
import { validateDecklist } from "#api/engine/deckValidation";
import type { Decklist } from "#api/engine/setup";
import { isUuid } from "#api/community/CommunityDeckStore";
import type { MatchupOpponentSpec } from "#api/deckSimulation/MatchupOpponentSpec";
import type { MatchupRequestDraft } from "#api/deckSimulation/MatchupRequestDraft";
import { MatchupRequestError } from "#api/deckSimulation/MatchupRequestError";

const MAX_NAME_LENGTH = 80;
const MAX_DECK_ID_LENGTH = 64;

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
  if (!validateDecklist(deck, { format, betaBattleMode: true }).ok) throw new MatchupRequestError(code);
  return deck;
}

function parseCommunityIds(input: unknown): readonly string[] | undefined {
  if (input === undefined) return undefined;
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > COMMUNITY_MATCHUP_LIMITS.maxOpponents ||
    !input.every((id) => typeof id === "string" && isUuid(id)) ||
    new Set(input).size !== input.length
  ) {
    throw new MatchupRequestError("invalid_opponent");
  }
  return [...input] as string[];
}

function parseOpponent(input: unknown, format: DeckFormat | undefined): MatchupOpponentSpec {
  if (typeof input !== "object" || input === null) throw new MatchupRequestError("invalid_opponent");
  const value = input as Record<string, unknown>;
  if (value.mirror === true) return { kind: "mirror" };
  if (typeof value.famousDeckId === "string") return { kind: "famous", famousDeckId: value.famousDeckId };
  if (typeof value.community === "object" && value.community !== null) {
    return { kind: "community", deckIds: parseCommunityIds((value.community as Record<string, unknown>).deckIds) };
  }
  const name = typeof value.name === "string" ? value.name.trim().slice(0, MAX_NAME_LENGTH) : "";
  return { kind: "list", name, deck: parseDecklist(value.deck, "invalid_opponent", format) };
}

export function parseMatchupRequest(input: unknown): MatchupRequestDraft {
  if (typeof input !== "object" || input === null) throw new MatchupRequestError("invalid_request");
  const value = input as Record<string, unknown>;
  if (value.format !== undefined && !isDeckFormat(value.format)) throw new MatchupRequestError("invalid_format");
  const format = value.format as DeckFormat | undefined;
  const opponent = parseOpponent(value.opponent, format);
  const allowedGames: readonly number[] =
    opponent.kind === "community" ? COMMUNITY_MATCHUP_LIMITS.gamesPerOpponent : MATCHUP_GAME_COUNTS;
  if (typeof value.games !== "number" || !allowedGames.includes(value.games)) {
    throw new MatchupRequestError("invalid_games");
  }
  if (
    value.deckId !== undefined &&
    (typeof value.deckId !== "string" || value.deckId.length === 0 || value.deckId.length > MAX_DECK_ID_LENGTH)
  ) {
    throw new MatchupRequestError("invalid_request");
  }
  return {
    deck: parseDecklist(value.deck, "invalid_deck", format),
    format,
    gamesPerOpponent: value.games,
    opponent,
    ...(value.deckId === undefined ? {} : { deckId: value.deckId }),
  };
}
