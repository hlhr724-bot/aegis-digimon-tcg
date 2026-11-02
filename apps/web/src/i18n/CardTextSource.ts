export const CardTextSource = {
  DICTIONARY: { name: "DICTIONARY", value: "dictionary" },
  CLAUSE: { name: "CLAUSE", value: "clause" },
  CONTEXT: { name: "CONTEXT", value: "context" },
  TOKENS: { name: "TOKENS", value: "tokens" },
  TEMPLATE: { name: "TEMPLATE", value: "template" },
  ORIGINAL: { name: "ORIGINAL", value: "original" },
} as const;

export type CardTextSource = (typeof CardTextSource)[keyof typeof CardTextSource]["value"];
