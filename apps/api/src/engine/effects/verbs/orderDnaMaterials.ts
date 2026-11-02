import { requireCardDefinition } from "@aegis/shared/cards/registry";
import { CardColor } from "@aegis/shared/schema/enums";
import type { CardDefinition } from "@aegis/shared/cards/types";
import { effectiveColors, effectiveNames } from "#api/engine/effects/continuous/effective";
import { matchingDnaMaterialOrder } from "#api/engine/effects/verbs/digivolveCost";
import { peekLooseInstance } from "#api/engine/effects/verbs/looseInstances";
import type { PrimitivesContext } from "#api/engine/effects/verbs/context";

type OrderDnaMaterialsParams = {
  pc: PrimitivesContext;
  materialPermanentIds: string[];
  resultInstanceId: string;
};

export function orderDnaMaterials({
  pc,
  materialPermanentIds,
  resultInstanceId,
}: OrderDnaMaterialsParams): string[] | undefined {
  const result = peekLooseInstance(pc.state, resultInstanceId);
  if (result === undefined) {
    return undefined;
  }
  const into = requireCardDefinition(result.cardId);
  const definitions: CardDefinition[] = [];
  for (const id of materialPermanentIds) {
    const material = pc.access.permanentById(id);
    if (material?.topCard === undefined) {
      return undefined;
    }
    const printed = requireCardDefinition(material.topCard.cardId);
    const level = pc.continuous.dnaLevelFor(id, into);
    const names = effectiveNames(pc.continuous, material, printed.nameEn ?? printed.cardId);
    const colors = effectiveColors(pc.continuous, id, printed.colors);
    definitions.push({
      ...printed,
      colors: Object.values(CardColor).filter((color) => colors.includes(color)),
      ...(level === undefined ? {} : { level }),
      nameEn: names.join(" | "),
    });
  }
  return matchingDnaMaterialOrder(into, definitions)?.map((index) => materialPermanentIds[index]!);
}
