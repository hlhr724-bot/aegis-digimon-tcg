import { printedPassage } from "#api/engine/decisions/printedPassage";

const SENTENCE_END = /[.!?](?=\s|$)/g;
const LEADING_TIMING_HEADERS = /^(?:\s*\[[^\]]*\])*\s*/;

export function printedSentence(text: string, passage: string): string | undefined {
  const match = printedPassage(text, passage);
  if (match === undefined) return undefined;
  const passageStart = text.indexOf(match);
  const passageEnd = passageStart + match.length;
  let sentenceStart = 0;
  let sentenceEnd = text.length;
  for (const end of text.matchAll(SENTENCE_END)) {
    const boundary = end.index + 1;
    if (boundary <= passageStart) sentenceStart = boundary;
    else if (boundary >= passageEnd) {
      sentenceEnd = boundary;
      break;
    }
  }
  const sentence = text.slice(sentenceStart, sentenceEnd).replace(LEADING_TIMING_HEADERS, "").trimEnd();
  return sentence.length > 0 ? sentence : undefined;
}
