import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { isTokenDefinition } from "@aegis/shared/cards/tokens";
import { CardKind, type Seat } from "@aegis/shared/schema/enums";
import type { CardSpec, PermanentSpec, ScenarioFixture, ScenarioOpponent, SeatSpec } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

type Params = {
  name: string;
  memory?: number;
  turnSeat?: Seat;
  player: SeatSpec;
  opponent?: SeatSpec;
  opponentPolicy?: ScenarioOpponent;
  opening?: readonly [readonly string[], readonly string[]];
};

function getCardId(card: CardSpec): string {
  return typeof card === "string" ? card : card.card;
}

function getPermanentCards(permanent: PermanentSpec | string): string[] {
  if (typeof permanent === "string") {
    return [permanent];
  }
  return [
    permanent.top ? getCardId(permanent.top) : permanent.card,
    ...(permanent.under ?? []).map(getCardId),
    ...(permanent.linked ?? []).map(getCardId),
  ];
}

function isMainDeckCard(cardId: string): boolean {
  const definition = requireCardDefinition(cardId);
  return !definition.kinds.includes(CardKind.DigiEgg) && !isTokenDefinition(definition);
}

type SeatParams = { board: SeatSpec; seat: Seat; opening: readonly string[] };

function buildSeat({ board, seat, opening }: SeatParams): SeatSpec {
  const security = Array.isArray(board.security) ? board.security.map(getCardId) : [];
  if (typeof board.security === "number") {
    throw new Error("Guided battles require identifiable security cards");
  }
  const placed = [
    ...(board.hand ?? []).map(getCardId),
    ...(board.trash ?? []).map(getCardId),
    ...(board.delayZone ?? []).map(getCardId),
    ...security,
    ...(board.battleArea ?? []).flatMap(getPermanentCards),
    ...(board.breeding ? getPermanentCards(board.breeding) : []),
  ].filter(isMainDeckCard);
  const deckOpening = [...(board.deck ?? []).map(getCardId), ...opening];
  const required = new Map<string, number>();
  for (const cardId of [...placed, ...deckOpening]) {
    required.set(cardId, (required.get(cardId) ?? 0) + 1);
  }
  for (const [cardId, count] of required) {
    if (count > 4 || !isMainDeckCard(cardId)) {
      throw new Error(`Invalid guided battle deck entry: ${cardId} (${count})`);
    }
  }
  const base = seat === 0 ? tutorialRedDeckCounts : tutorialBlueDeckCounts;
  let total = [...required.values()].reduce((sum, count) => sum + count, 0);
  for (const [cardId] of base) {
    const existing = required.get(cardId) ?? 0;
    const added = Math.max(0, Math.min(4 - existing, 50 - total));
    required.set(cardId, existing + added);
    total += added;
  }
  const counts = [...required].filter(([, count]) => count > 0);
  if (counts.reduce((sum, [, count]) => sum + count, 0) !== 50) {
    throw new Error("Guided battle decks must contain exactly 50 cards");
  }
  const deck = buildStoryDrawPile({ counts, placed, opening: deckOpening });
  return {
    ...board,
    deck: [...(board.deck ?? []), ...opening, ...deck.slice(deckOpening.length)],
  };
}

export function buildKeywordDrillFixture({
  name,
  memory = 3,
  turnSeat = 0,
  player,
  opponent = {},
  opponentPolicy,
  opening = [[], []],
}: Params): ScenarioFixture {
  return {
    name,
    memory,
    turnSeat,
    turnCount: 4,
    isFirstPlayersFirstTurn: false,
    presentation: {
      timed: false,
      opponent: opponentPolicy ?? { endBreeding: true, fallbackMain: "end" },
    },
    board: {
      0: buildSeat({ board: player, seat: 0, opening: opening[0] }),
      1: buildSeat({ board: opponent, seat: 1, opening: opening[1] }),
    },
  };
}
