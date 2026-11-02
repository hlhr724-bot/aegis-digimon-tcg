type Params = {
  text: string;
  index: number;
};

export function isEmbeddedPrintedTiming({ text, index }: Params): boolean {
  let depth = 0;
  let quote: string | undefined;
  for (const character of text.slice(0, index)) {
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "“" || character === "”" || character === "「") {
      quote = character;
      if (character === "“" || character === "”") {
        quote = "”";
      } else if (character === "「") {
        quote = "」";
      }
    } else if (character === "(" || character === "（") {
      depth++;
    } else if (character === ")" || character === "）") {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0 || quote !== undefined;
}
