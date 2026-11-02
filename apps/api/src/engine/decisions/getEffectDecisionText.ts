import { splitPrintedClauses } from "@aegis/shared/effects/printedClauses";
import { printedPassage } from "#api/engine/decisions/printedPassage";

type Params = {
  activeEffectText?: string;
  activeEffectTextPart?: string;
  activeEffectTextEmphasis?: string;
};

export function getEffectDecisionText(ctx: Params) {
  const part = ctx.activeEffectTextPart;
  const focus = ctx.activeEffectTextEmphasis ?? part;
  const matchingClauses = focus
    ? splitPrintedClauses(ctx.activeEffectText).filter((clause) => printedPassage(clause.text, focus) !== undefined)
    : undefined;
  const fullText = matchingClauses?.length === 1 ? matchingClauses[0]!.text : ctx.activeEffectText;
  const printedPart =
    fullText && part && !fullText.toLowerCase().includes(part.toLowerCase()) ? printedPassage(fullText, part) : part;
  const emphasis =
    ctx.activeEffectTextEmphasis ??
    (fullText &&
    printedPart &&
    fullText.toLowerCase() !== printedPart.toLowerCase() &&
    fullText.toLowerCase().includes(printedPart.toLowerCase())
      ? printedPart
      : undefined);
  return {
    effectText: emphasis && fullText ? fullText : ctx.activeEffectText,
    ...(part !== undefined ? { effectTextPart: part } : {}),
    ...(emphasis !== undefined ? { effectTextEmphasis: emphasis } : {}),
  };
}
