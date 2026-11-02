import { getCardDefinition } from "@aegis/shared/cards/registry";
import { CardTextField } from "@/i18n/CardTextField";
import { effectClausesForTiming } from "@/game/overlay/effectText";
import { normalizePrintedTextKey } from "@/i18n/normalizePrintedTextKey";

type Params = { cardId?: string; timing?: string; isInherited?: boolean; isLinked?: boolean; text?: string };

export function getCardTextField({ cardId, timing, isInherited, isLinked, text }: Params): CardTextField | undefined {
  const card = cardId ? getCardDefinition(cardId) : undefined;
  const key = (value: string) => normalizePrintedTextKey(value.replace(/&#(?:160|xA0);/gi, " "));
  const contains = (field: CardTextField) =>
    Boolean(card?.[field] && (!text || key(card[field]!).indexOf(key(text)) >= 0));
  if (isInherited && card?.inheritedEffectText) {
    return CardTextField.INHERITED.value;
  }
  if (isLinked && card?.linkEffect) {
    return CardTextField.LINK.value;
  }
  if (timing === "Security" && contains(CardTextField.SECURITY.value)) {
    return CardTextField.SECURITY.value;
  }
  if (card && timing) {
    const candidates = Object.values(CardTextField).filter(
      (entry) =>
        entry.value !== CardTextField.INHERITED.value &&
        entry.value !== CardTextField.LINK.value &&
        contains(entry.value) &&
        effectClausesForTiming(card[entry.value], timing).length > 0,
    );
    if (candidates.length === 1) {
      return candidates[0]!.value;
    }
  }
  if (card && text) {
    const candidates = Object.values(CardTextField).filter((entry) => contains(entry.value));
    if (candidates.length === 1) {
      return candidates[0]!.value;
    }
  }
  return undefined;
}
