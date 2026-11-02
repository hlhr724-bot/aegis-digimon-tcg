export type DeckGuideInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: DeckGuideInline[] }
  | { kind: "card"; cardId: string };

export type DeckGuideBlock =
  | { kind: "heading"; children: DeckGuideInline[] }
  | { kind: "paragraph"; children: DeckGuideInline[] }
  | { kind: "list"; items: DeckGuideInline[][] };
