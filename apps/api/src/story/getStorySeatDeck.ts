import type { CardSpec, PermanentSpec, ScenarioFixture } from "#api/engine/scenario/types";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { isTokenDefinition } from "@aegis/shared/cards/tokens";

type Params = { fixture: ScenarioFixture; seat: 0 | 1 };

function getCardId(spec: CardSpec | PermanentSpec): string {
  return typeof spec === "string" ? spec : spec.card;
}

export function getStorySeatDeck({ fixture, seat }: Params): { mainDeck: string[]; eggDeck: string[] } {
  const board = fixture.board[seat];
  if (!board) {
    throw new Error("Missing story seat");
  }
  const cards = [
    ...(board.deck ?? []),
    ...(board.hand ?? []),
    ...(board.trash ?? []),
    ...(board.delayZone ?? []),
    ...(Array.isArray(board.security) ? board.security : []),
  ].map(getCardId);
  for (const permanent of [...(board.battleArea ?? []), ...(board.breeding ? [board.breeding] : [])]) {
    cards.push(getCardId(permanent));
    if (typeof permanent !== "string") {
      cards.push(...(permanent.under ?? []).map(getCardId), ...(permanent.linked ?? []).map(getCardId));
    }
  }
  const eggDeck = (board.eggDeck ?? []).map(getCardId);
  const mainDeck: string[] = [];
  for (const card of cards) {
    const definition = getCardDefinition(card);
    if (definition && isTokenDefinition(definition)) {
      continue;
    }
    if (definition?.level === 2) {
      eggDeck.push(card);
    } else {
      mainDeck.push(card);
    }
  }
  return { mainDeck, eggDeck };
}
