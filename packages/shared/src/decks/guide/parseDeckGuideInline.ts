import { getCardDefinition } from "#shared/cards/registry";
import type { DeckGuideInline } from "#shared/decks/guide/DeckGuideNode";

type Params = { text: string };

function parseCards(text: string): DeckGuideInline[] {
  const nodes: DeckGuideInline[] = [];
  const pattern = /\b([A-Z]{1,3}\d{0,2}-\d{2,3})(?=\b|_)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const cardId = match[1]!;
    if (!getCardDefinition(cardId)) {
      continue;
    }
    if (match.index > offset) {
      nodes.push({ kind: "text", text: text.slice(offset, match.index) });
    }
    nodes.push({ kind: "card", cardId });
    offset = match.index + cardId.length;
  }
  if (offset < text.length) {
    nodes.push({ kind: "text", text: text.slice(offset) });
  }
  return nodes;
}

function findBoldEnd(text: string, start: number): number {
  for (let index = start; index < text.length - 1; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if (text.startsWith("**", index)) {
      return index;
    }
  }
  return -1;
}

export function parseDeckGuideInline({ text }: Params): DeckGuideInline[] {
  const nodes: DeckGuideInline[] = [];
  let pending = "";
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\" && /[\\*#-]/.test(text[index + 1] ?? "")) {
      pending += text[index + 1];
      index += 1;
      continue;
    }
    if (text.startsWith("**", index)) {
      const end = findBoldEnd(text, index + 2);
      if (end > index + 2) {
        nodes.push(...parseCards(pending));
        pending = "";
        nodes.push({ kind: "bold", children: parseDeckGuideInline({ text: text.slice(index + 2, end) }) });
        index = end + 1;
        continue;
      }
    }
    pending += text[index];
  }
  nodes.push(...parseCards(pending));
  return nodes;
}
