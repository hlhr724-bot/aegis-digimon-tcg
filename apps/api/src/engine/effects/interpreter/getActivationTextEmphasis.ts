import type { CardEffect } from "@aegis/shared/effects/ir/card";
import { printedPassage } from "#api/engine/decisions/printedPassage";

type Params = { effect: CardEffect; description: string };

export function getActivationTextEmphasis({ effect, description }: Params): string | undefined {
  const first = effect.actions[0];
  if (!effect.optional || !first || first.kind === "RawUnparsed" || !first.effectTextPart) {
    return undefined;
  }
  const passage = printedPassage(description, first.effectTextPart);
  if (!passage || passage.trim() === description.trim()) {
    return undefined;
  }
  return passage;
}
