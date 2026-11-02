type Params = { text: string; highlight?: string };
type HighlightSegment = { text: string; highlighted: boolean };

export function splitTextByHighlight({ text, highlight }: Params): HighlightSegment[] {
  const needle = highlight?.trim().toLocaleLowerCase();
  if (!needle) {
    return [{ text, highlighted: false }];
  }
  const normalized = text.toLocaleLowerCase();
  const segments: HighlightSegment[] = [];
  let offset = 0;
  let match = normalized.indexOf(needle);
  while (match !== -1) {
    if (match > offset) {
      segments.push({ text: text.slice(offset, match), highlighted: false });
    }
    offset = match + needle.length;
    segments.push({ text: text.slice(match, offset), highlighted: true });
    match = normalized.indexOf(needle, offset);
  }
  if (offset < text.length) {
    segments.push({ text: text.slice(offset), highlighted: false });
  }
  return segments;
}
