const entities: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function normalizePrintedTextKey(text: string): string {
  return text
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/gi, (entity) => entities[entity.toLowerCase()] ?? entity)
    .replace(/＜/g, "<")
    .replace(/＞/g, ">")
    .replace(/\s+/g, "");
}
