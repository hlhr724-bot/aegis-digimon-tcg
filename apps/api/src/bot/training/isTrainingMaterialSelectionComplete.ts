import { assemblyRequirementFor, digiXrosRequirementFor } from "@aegis/shared/effects/data";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import { satisfiedAssemblyRequirement } from "#api/engine/actions/assembly";
import { materialsSatisfyRecipe } from "#api/engine/actions/digiXros";
import type { DecisionRequest } from "@aegis/shared/protocol/events";
import type { SelectionCard } from "#api/bot/training/decisions";

interface Params {
  options: NonNullable<DecisionRequest["options"]>;
  cards: ReadonlyMap<string, SelectionCard>;
  selected: readonly string[];
}

export function isTrainingMaterialSelectionComplete({ options, cards, selected }: Params): boolean {
  if (selected.length === 0 || (!options.assemblyCardId && !options.digiXrosCardId)) {
    return true;
  }
  const definitions = selected.map((id) => {
    const cardId = cards.get(id)?.cardId;
    const definition = cardId === undefined ? undefined : getCardDefinition(cardId);
    if (definition === undefined) {
      throw new Error(`Missing visible card identity for material ${id}`);
    }
    return definition;
  });
  if (options.assemblyCardId) {
    return (
      satisfiedAssemblyRequirement(
        assemblyRequirementFor(options.assemblyCardId) ?? [],
        definitions,
        getCardDefinition(options.assemblyCardId),
      ) !== undefined
    );
  }
  const requirements = digiXrosRequirementFor(options.digiXrosCardId!) ?? [];
  return requirements.some(
    (requirement) =>
      (requirement.maxMaterials === undefined || selected.length <= requirement.maxMaterials) &&
      materialsSatisfyRecipe(definitions, requirement.materials),
  );
}
