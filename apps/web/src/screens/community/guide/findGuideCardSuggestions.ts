import { allCards } from "@aegis/shared/cards/registry";
import type { Editor } from "@tiptap/react";

type Params = { editor: Editor };

export function findGuideCardSuggestions({ editor }: Params) {
  const { selection } = editor.state;
  if (!selection.empty) {
    return null;
  }
  const before = selection.$from.parent.textBetween(0, selection.$from.parentOffset, "\n", "\ufffc");
  const query = /(?:^|\s|\()([A-Za-z]{1,3}\d{0,2}-\d{0,3})$/.exec(before)?.[1];
  if (!query) {
    return null;
  }
  const cards = allCards()
    .filter((card) => card.cardId.startsWith(query.toUpperCase()))
    .slice(0, 8);
  return cards.length ? { from: selection.from - query.length, to: selection.from, query, cards } : null;
}
