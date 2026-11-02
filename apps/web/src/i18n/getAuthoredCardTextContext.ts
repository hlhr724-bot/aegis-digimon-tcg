import { getCardDefinition } from "@aegis/shared/cards/registry";
import { getCompiledCard } from "@aegis/shared/effects/data";
import { printedModalBullets, printedModalPreamble } from "@aegis/shared/effects/printedClauses";
import { effectClausesForTiming } from "@/game/overlay/effectText";
import { CardTextField } from "@/i18n/CardTextField";

type Params = { text: string; cardId?: string; field?: CardTextField; timing?: string };
type Context = { text: string; field: CardTextField };

export function getAuthoredCardTextContext({ text, cardId, field, timing }: Params): Context | undefined {
  if (!cardId || !timing) {
    return undefined;
  }
  const definition = getCardDefinition(cardId);
  const effects = getCompiledCard(cardId)?.effects;
  if (!definition || !Array.isArray(effects)) {
    return undefined;
  }
  const matches = new Map<string, Context>();
  for (const effect of effects) {
    if (effect.trigger !== timing || !hasAuthoredHint({ node: effect.actions, text })) {
      continue;
    }
    let fields: CardTextField[] = [CardTextField.EFFECT.value];
    if (effect.isInherited) {
      fields = [CardTextField.INHERITED.value];
    } else if (effect.isLinked) {
      fields = [CardTextField.LINK.value];
    } else if (effect.isSecurity || effect.trigger === "Security") {
      fields = [CardTextField.SECURITY.value, CardTextField.EFFECT.value];
    } else if (effect.trigger === "Main") {
      fields = [CardTextField.EFFECT.value, CardTextField.OPTION.value];
    }
    for (const sourceField of fields) {
      if (field && field !== sourceField) {
        continue;
      }
      for (const clause of effectClausesForTiming(definition[sourceField], timing)) {
        const bullets = printedModalBullets(clause);
        const units = bullets.length ? [printedModalPreamble(clause), ...bullets] : [clause];
        for (const unit of units) {
          if (hasBoundedHint({ source: unit, text })) {
            matches.set(JSON.stringify([sourceField, unit]), { text: unit, field: sourceField });
          }
        }
      }
    }
  }
  return matches.size === 1 ? [...matches.values()][0] : undefined;
}

function normalizeHint(text: string): string {
  return text
    .replace(/&#(?:160|xA0);|&nbsp;/gi, " ")
    .replace(/＜/g, "<")
    .replace(/＞/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAuthoredHint({ node, text }: { node: unknown; text: string }): boolean {
  if (Array.isArray(node)) {
    return node.some((entry) => hasAuthoredHint({ node: entry, text }));
  }
  if (!node || typeof node !== "object") {
    return false;
  }
  return Object.entries(node).some(([key, value]) => {
    if ((key === "effectTextPart" || key === "effectTextEmphasis") && typeof value === "string") {
      return normalizeHint(value) === normalizeHint(text);
    }
    return hasAuthoredHint({ node: value, text });
  });
}

function hasBoundedHint({ source, text }: { source: string; text: string }): boolean {
  const normalized = normalizeHint(source);
  const requested = normalizeHint(text);
  if (!requested) {
    return false;
  }
  const variants = new Set([requested, requested.replace(/^[A-Z]/, (letter) => letter.toLowerCase())]);
  const starts = new Set<number>();
  for (const variant of variants) {
    let position = normalized.indexOf(variant);
    while (position >= 0) {
      starts.add(position);
      position = normalized.indexOf(variant, position + 1);
    }
  }
  if (starts.size !== 1) {
    return false;
  }
  const start = [...starts][0]!;
  const before = normalized.slice(0, start);
  const after = normalized.slice(start + requested.length);
  const endsSentence = /[.!?]$/.test(requested) && /^[A-Z]/.test(after);
  return (!before || /[\s\]>]$/.test(before)) && (!after || /^[\s[,;:.]/.test(after) || endsSentence);
}
