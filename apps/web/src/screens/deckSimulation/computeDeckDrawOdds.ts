import { CardKind, getCardDefinition } from "@aegis/shared";
import { goldfishTurnCurve } from "@aegis/shared/decks/goldfish/goldfishTurnCurve";
import { OPENING_HAND_SIZE } from "@aegis/shared/rules/OPENING_HAND_SIZE";
import { SECURITY_STACK_SIZE } from "@aegis/shared/rules/SECURITY_STACK_SIZE";
import { total, type CountMap } from "@/screens/deckCounts";

export const DRAW_ODDS_LAST_TURN = 6;
export const MAX_KEY_CARDS = 4;
const DEFAULT_MAX_COPIES = 4;
const ROOKIE_LEVEL = 3;

export type DeckDrawOddsRowKind = "card" | "combo" | "rookies";

export interface DeckDrawOddsRow {
  key: string;
  kind: DeckDrawOddsRowKind;
  cardId?: string;
  copies: number;
  curve: number[];
  curveWithOneMore?: number[];
}

interface ComputeDeckDrawOddsParams {
  main: CountMap;
  keyCardIds: readonly string[];
  goingFirst: boolean;
  mulligan: boolean;
}

export function computeDeckDrawOdds({ main, keyCardIds, goingFirst, mulligan }: ComputeDeckDrawOddsParams): {
  deckSize: number;
  rows: DeckDrawOddsRow[];
} {
  const deckSize = total(main);
  if (deckSize < OPENING_HAND_SIZE + SECURITY_STACK_SIZE) {
    return { deckSize, rows: [] };
  }
  const curveFor = (groups: number[]) =>
    goldfishTurnCurve({ deckSize, groups, goingFirst, mulligan, lastTurn: DRAW_ODDS_LAST_TURN });
  const keyCards = keyCardIds
    .filter((cardId) => (main[cardId] ?? 0) > 0)
    .slice(0, MAX_KEY_CARDS)
    .map((cardId) => ({ cardId, copies: main[cardId]! }));
  const rows: DeckDrawOddsRow[] = keyCards.map(({ cardId, copies }) => {
    const maxCopies = getCardDefinition(cardId)?.maxCountInDeck ?? DEFAULT_MAX_COPIES;
    const canAddCopy = copies < maxCopies && keyCards.reduce((sum, card) => sum + card.copies, 0) < deckSize;
    return {
      key: `card:${cardId}`,
      kind: "card",
      cardId,
      copies,
      curve: curveFor([copies]),
      ...(canAddCopy ? { curveWithOneMore: curveFor([copies + 1]) } : {}),
    };
  });
  if (keyCards.length > 1) {
    rows.push({
      key: "combo",
      kind: "combo",
      copies: keyCards.reduce((sum, card) => sum + card.copies, 0),
      curve: curveFor(keyCards.map((card) => card.copies)),
    });
  }
  const rookies = Object.entries(main).reduce((sum, [cardId, count]) => {
    const definition = getCardDefinition(cardId);
    return definition?.level === ROOKIE_LEVEL && definition.kinds.includes(CardKind.Digimon) ? sum + count : sum;
  }, 0);
  if (rookies > 0) {
    rows.push({ key: "rookies", kind: "rookies", copies: rookies, curve: curveFor([rookies]) });
  }
  return { deckSize, rows };
}
