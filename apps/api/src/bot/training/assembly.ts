import { assemblyRequirementFor, type CardDefinition } from "@aegis/shared";
import { materialMatchesAssemblySlot, materialsSatisfyAssemblyRecipe } from "../../engine/actions/assembly.js";
import { definitionOf } from "../../engine/cards/cardData.js";

export interface AssemblyMaterialCandidate {
  instanceId: string;
  cardId: string;
}

export interface AssemblyMaterialStep {
  selected: readonly string[];
  choices: readonly { key: string; label: string; referenceId?: string }[];
}

/**
 * Validates Assembly material sets against the engine's own recipe predicate.
 * Interchangeable trash copies share a card ID, so completion search tries each ID once per depth.
 */
export function assemblyRecipe(assemblyCardId: string) {
  const requirement = assemblyRequirementFor(assemblyCardId)?.[0];
  if (requirement === undefined) throw new Error(`Missing Assembly requirement for ${assemblyCardId}`);
  const destination = definitionOf(assemblyCardId);
  const required = requirement.materials.reduce((sum, slot) => sum + slot.count, 0);
  const complete = (definitions: readonly CardDefinition[]): boolean =>
    definitions.length === required &&
    materialsSatisfyAssemblyRecipe([...definitions], requirement.materials, destination);
  const completable = (
    selected: readonly AssemblyMaterialCandidate[],
    remaining: readonly AssemblyMaterialCandidate[],
  ): boolean => {
    if (selected.length > required) return false;
    if (selected.length === required) return complete(selected.map(({ cardId }) => definitionOf(cardId)));
    if (selected.length + remaining.length < required) return false;
    // For repeated slots, a prefix that already violates distinctness can never be repaired.
    // Reuse the engine predicate at the prefix size so names/levels/colors/card numbers agree
    // with full-recipe validation instead of exploring every impossible remaining subset.
    if (
      requirement.materials.length === 1 &&
      selected.length > 0 &&
      !materialsSatisfyAssemblyRecipe(
        selected.map(({ cardId }) => definitionOf(cardId)),
        [{ ...requirement.materials[0]!, count: selected.length }],
        destination,
      )
    )
      return false;
    const tried = new Set<string>();
    return remaining.some((candidate, index) => {
      if (tried.has(candidate.cardId)) return false;
      tried.add(candidate.cardId);
      return completable([...selected, candidate], remaining.slice(index + 1));
    });
  };
  return { required, reduction: requirement.reduceCost, completable };
}

/** Trash cards that fit at least one printed slot; the engine restricts Assembly materials to trash. */
export function assemblyMaterialCandidates(
  assemblyCardId: string,
  trash: readonly AssemblyMaterialCandidate[],
): AssemblyMaterialCandidate[] {
  const slots = assemblyRequirementFor(assemblyCardId)?.[0]?.materials ?? [];
  const destination = definitionOf(assemblyCardId);
  return trash.filter(({ cardId }) =>
    slots.some((slot) => materialMatchesAssemblySlot(definitionOf(cardId), slot, destination)),
  );
}

/** A complete recipe from the offered materials, or undefined when none exists. */
export function firstAssemblyRecipe(
  assemblyCardId: string,
  offered: readonly AssemblyMaterialCandidate[],
): string[] | undefined {
  const { required, completable } = assemblyRecipe(assemblyCardId);
  const selected: AssemblyMaterialCandidate[] = [];
  let remaining = [...offered];
  while (selected.length < required) {
    const next = remaining.findIndex((candidate, index) =>
      completable([...selected, candidate], remaining.slice(index + 1)),
    );
    if (next < 0) return undefined;
    selected.push(remaining[next]!);
    remaining = remaining.slice(next + 1);
  }
  return selected.map(({ instanceId }) => instanceId);
}

/**
 * Sequential material choice where every offered material still admits a complete recipe.
 * Finishing is legal only with an empty selection (when declining is allowed) or a complete recipe.
 */
export function* assemblyMaterialSteps(
  assemblyCardId: string,
  offered: readonly AssemblyMaterialCandidate[],
  allowDecline: boolean,
): Generator<AssemblyMaterialStep, string[], number> {
  const { required, completable } = assemblyRecipe(assemblyCardId);
  const selected: AssemblyMaterialCandidate[] = [];
  for (;;) {
    const remaining = offered.filter((candidate) => !selected.includes(candidate));
    const choices: { key: string; label: string; referenceId?: string }[] = remaining
      .filter((candidate) =>
        completable(
          [...selected, candidate],
          remaining.filter((other) => other !== candidate),
        ),
      )
      .map(({ instanceId }) => ({ key: instanceId, label: "Assembly material", referenceId: instanceId }));
    if (selected.length === required) choices.push({ key: "finish", label: "Finish Assembly" });
    else if (selected.length === 0 && allowDecline) choices.push({ key: "finish", label: "Decline Assembly" });
    if (choices.length === 0) throw new Error(`No legal Assembly completion for ${assemblyCardId}`);
    const index = yield { selected: selected.map(({ instanceId }) => instanceId), choices };
    const choice = choices[index];
    if (!Number.isInteger(index) || choice === undefined)
      throw new Error(`Invalid Assembly material index ${index} for ${assemblyCardId}`);
    if (choice.referenceId === undefined) return selected.map(({ instanceId }) => instanceId);
    selected.push(remaining.find(({ instanceId }) => instanceId === choice.referenceId)!);
  }
}
