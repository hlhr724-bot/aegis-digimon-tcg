import type { CardTextField } from "@/i18n/CardTextField";
import { getDictionaryValue } from "@/i18n/getDictionaryValue";
import type { CardTranslationData } from "@/i18n/cardTranslationTypes";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";
import { findTranslatedCardClause } from "@/i18n/findTranslatedCardClause";

type Params = { text: string; translations?: CardTranslationData; cardId?: string; field?: CardTextField };

export function getTranslatedCardText({ text, translations, cardId, field }: Params): string {
  const cardText = cardId ? getDictionaryValue({ dictionary: translations?.byCard, key: cardId }) : undefined;
  const translated =
    getDictionaryValue({ dictionary: cardText, key: normalizePrintedTextKey(text) }) ??
    getDictionaryValue({ dictionary: translations?.text, key: normalizePrintedTextKey(text) });
  const resolved =
    translated ||
    findTranslatedCardClause({ text, translations, cardId, field }) ||
    text.replace(/[^\r\n]+/g, (line) => {
      return (
        getDictionaryValue({ dictionary: cardText, key: normalizePrintedTextKey(line) }) ||
        getDictionaryValue({ dictionary: translations?.text, key: normalizePrintedTextKey(line) }) ||
        line
      );
    });
  const printed = removeUnprintedNameNotes({ source: text, translated: resolved });
  if (printed === text) {
    return text;
  }
  return printed
    .replace(/[【［]([^】］]+)[】］]/g, "[$1]")
    .replace(
      /≪([^≫]+)≫|《([^》]+)》/g,
      (_, japanese: string | undefined, chinese: string | undefined) => `＜${japanese ?? chinese}＞`,
    );
}

type NameNotesParams = { source: string; translated: string };

function removeUnprintedNameNotes({ source, translated }: NameNotesParams): string {
  if (/[[【［]\s*(?:Rule|规则)\s*[\]】］]/i.test(source)) {
    return translated;
  }
  return translated.replace(/(?:[\r\n]+|^)[ \t]*※[ \t]*此卡(?:牌)?不?属于名称中包含[^\r\n]*/g, "");
}
