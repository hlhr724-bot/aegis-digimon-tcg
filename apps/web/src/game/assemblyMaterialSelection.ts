import {
  assemblyMaterialLevels,
  canAssignDistinctColors,
  effectiveExactNames,
  effectiveStaticNames,
  effectiveStaticTraits,
  getCompiledCard,
  nameIncludesToken,
  textMatchesToken,
} from "@aegis/shared";
import type { AssemblyMaterial, AssemblyRequirement, CardDefinition } from "@aegis/shared";
import { canAssignDistinctNames } from "@aegis/shared/cards/canAssignDistinctNames";

/*
 * Best-effort client-side filtering for the Assembly material picker (Comprehensive Rules
 * §7-3). The server validates the whole declaration; this only keeps the picker from
 * offering trash cards that can never satisfy the printed recipe.
 */

type NameOrTraitRef = NonNullable<AssemblyMaterial["nameOrTrait"]>[number];

const traitsOf = (definition: CardDefinition): readonly string[] => effectiveStaticTraits(definition);

const hasNameContaining = (definition: CardDefinition, token: string): boolean =>
  effectiveStaticNames(definition).some((name) => nameIncludesToken(name, token));

function includesFolded(values: readonly string[], wanted: string): boolean {
  const folded = wanted.toLocaleLowerCase();
  return values.some((value) => value.toLocaleLowerCase() === folded);
}

function matchesNameOrTrait(definition: CardDefinition, ref: NameOrTraitRef): boolean {
  const exactNames = effectiveExactNames(definition).map((name) => name.toLocaleLowerCase());
  const traits = traitsOf(definition);
  return ref.tokens.some((token) => {
    const folded = token.toLocaleLowerCase();
    switch (ref.match) {
      case "trait":
        return includesFolded(traits, token);
      case "traitContains":
        return traits.some((trait) => trait.toLocaleLowerCase().includes(folded));
      case "nameExact":
        return exactNames.includes(folded);
      case "text":
        // "In text" includes the name and traits, not just the effect boxes (Q4366).
        return textMatchesToken(
          [
            ...effectiveStaticNames(definition),
            ...traits,
            definition.effectText,
            definition.inheritedEffectText,
            definition.securityEffectText,
            definition.linkEffect,
            definition.linkRequirement,
            definition.dualEffect,
            definition.optionEffect,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase(),
          token,
        );
      case "any":
        return hasNameContaining(definition, token) || includesFolded(traits, token);
      default:
        return hasNameContaining(definition, token);
    }
  });
}

const normalizeKeyword = (keyword: string): string => keyword.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Mirrors the engine's `definitionHasKeyword` for persistent keywords such as ＜Blocker＞: the
 * card's own (non-inherited) static declaration counts; inherited-only text does not (Q7412/Q7413).
 */
function declaresPrintedKeyword(definition: CardDefinition, keyword: string): boolean {
  const requested = normalizeKeyword(keyword);
  const compiled = getCompiledCard(definition.cardId);
  if (compiled === undefined) {
    return (definition.effectText ?? "").toLowerCase().includes(`＜${keyword.toLowerCase()}`);
  }
  const matchesRequested = (entry: { keyword?: string } | undefined): boolean =>
    normalizeKeyword(entry?.keyword ?? "") === requested;
  if ((compiled.keywords ?? []).some(matchesRequested)) return true;
  return (
    compiled.effects.some(
      (effect) =>
        effect.isInherited !== true &&
        (effect.trigger === "Static" || effect.trigger === "Rule") &&
        (effect.keywords ?? []).some(matchesRequested),
    ) ||
    compiled.effects.some(
      (effect) =>
        effect.isInherited !== true &&
        effect.isLinked !== true &&
        effect.isSecurity !== true &&
        effect.isBreeding !== true &&
        effect.isFromTrash !== true &&
        effect.trigger === "Static" &&
        effect.condition === undefined &&
        effect.actions.some(
          (action) =>
            action.kind === "GainKeyword" &&
            action.condition === undefined &&
            action.target.isSelf === true &&
            action.duration === "permanent" &&
            [action.keyword, ...(action.keywords ?? [])].some(matchesRequested),
        ),
    )
  );
}

/** Whether one trash card can fill `slot`, mirroring the engine's `materialMatchesAssemblySlot`. */
export function assemblyMaterialMatchesSlot(
  definition: CardDefinition,
  slot: AssemblyMaterial,
  destination?: CardDefinition,
): boolean {
  const hasIdentityGate =
    (slot.names?.length ?? 0) > 0 ||
    (slot.namesExact?.length ?? 0) > 0 ||
    (slot.traits?.length ?? 0) > 0 ||
    (slot.nameOrTrait?.length ?? 0) > 0 ||
    (slot.printedKeywords?.length ?? 0) > 0;
  if (!hasIdentityGate) return false;
  if (slot.printedKeywords?.some((keyword) => !declaresPrintedKeyword(definition, keyword))) return false;
  if (slot.kinds?.length && !slot.kinds.some((kind) => definition.kinds.includes(kind as never))) return false;
  if (slot.colors?.length && !slot.colors.some((color) => definition.colors.includes(color as never))) return false;
  if (slot.names?.length && !slot.names.some((name) => hasNameContaining(definition, name))) return false;
  if (slot.namesExact?.length && !slot.namesExact.some((name) => effectiveExactNames(definition).includes(name))) {
    return false;
  }
  if (slot.traits?.length && !slot.traits.some((trait) => includesFolded(traitsOf(definition), trait))) return false;
  if (slot.nameOrTrait?.length && !slot.nameOrTrait.some((ref) => matchesNameOrTrait(definition, ref))) return false;
  return assemblyMaterialLevels(definition, destination).some(
    (level) =>
      (slot.level === undefined || level === slot.level) &&
      (slot.levelMin === undefined || (level !== undefined && level >= slot.levelMin)) &&
      (slot.levelMax === undefined || (level !== undefined && level <= slot.levelMax)),
  );
}

export interface AssemblyCandidateDefinition {
  instanceId: string;
  definition: CardDefinition;
}

/** Total material count the recipe demands (§7-3-2-4: exact, no partial Assembly). */
export function assemblyMaterialCount(requirement: AssemblyRequirement): number {
  return requirement.materials.reduce((sum, slot) => sum + slot.count, 0);
}

function selectionFits(
  requirement: AssemblyRequirement,
  selected: AssemblyCandidateDefinition[],
  destination: CardDefinition | undefined,
): boolean {
  const slots = requirement.materials;
  if (selected.length > assemblyMaterialCount(requirement)) return false;
  if (slots.length === 1) {
    const slot = slots[0]!;
    if (!selected.every((candidate) => assemblyMaterialMatchesSlot(candidate.definition, slot, destination)))
      return false;
    if (slot.differentLevels === true) {
      const levels = selected.map((candidate) => candidate.definition.level);
      if (levels.some((level) => level === undefined)) return false;
      if (new Set(levels).size !== levels.length) return false;
    }
    if (slot.differentNames === true && !canAssignDistinctNames(selected.map((candidate) => candidate.definition))) {
      return false;
    }
    if (
      slot.differentColors === true &&
      !canAssignDistinctColors(selected.map((candidate) => candidate.definition.colors))
    ) {
      return false;
    }
    if (slot.differentCardNumbers === true) {
      const cardNumbers = selected.map((candidate) => candidate.definition.cardId);
      if (new Set(cardNumbers).size !== cardNumbers.length) return false;
    }
    return true;
  }
  const remaining = slots.map((slot) => slot.count);
  const assign = (index: number): boolean => {
    if (index === selected.length) return true;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (remaining[slotIndex]! <= 0) continue;
      if (!assemblyMaterialMatchesSlot(selected[index]!.definition, slots[slotIndex]!, destination)) continue;
      remaining[slotIndex]! -= 1;
      if (assign(index + 1)) return true;
      remaining[slotIndex]! += 1;
    }
    return false;
  };
  return assign(0);
}

function selectedCandidates(
  candidates: AssemblyCandidateDefinition[],
  selectedInstanceIds: readonly string[],
): AssemblyCandidateDefinition[] {
  const selectedIds = new Set(selectedInstanceIds);
  return candidates.filter((candidate) => selectedIds.has(candidate.instanceId));
}

/**
 * Trash instances that can extend the player's current selection toward any alternative recipe
 * (BT24-062 prints "[Blimpmon]/Tamer card w/[TS] trait").
 */
export function eligibleAssemblyCandidateIds(
  requirements: readonly AssemblyRequirement[],
  candidates: AssemblyCandidateDefinition[],
  selectedInstanceIds: string[],
  destination?: CardDefinition,
): Set<string> {
  const selected = selectedCandidates(candidates, selectedInstanceIds);
  const eligible = new Set(selected.map((candidate) => candidate.instanceId));
  for (const requirement of requirements) {
    if (selected.length >= assemblyMaterialCount(requirement)) continue;
    if (!selectionFits(requirement, selected, destination)) continue;
    for (const candidate of candidates) {
      if (eligible.has(candidate.instanceId)) continue;
      if (selectionFits(requirement, [...selected, candidate], destination)) eligible.add(candidate.instanceId);
    }
  }
  return eligible;
}

/** The alternative recipe the selection completes exactly, if any. */
export function completedAssemblyRequirement(
  requirements: readonly AssemblyRequirement[],
  candidates: AssemblyCandidateDefinition[],
  selectedInstanceIds: readonly string[],
  destination?: CardDefinition,
): AssemblyRequirement | undefined {
  const selected = selectedCandidates(candidates, selectedInstanceIds);
  return requirements.find(
    (requirement) =>
      selected.length === assemblyMaterialCount(requirement) && selectionFits(requirement, selected, destination),
  );
}

/** Material count to show: the smallest recipe the current selection can still complete. */
export function assemblyNeededCount(
  requirements: readonly AssemblyRequirement[],
  candidates: AssemblyCandidateDefinition[],
  selectedInstanceIds: readonly string[],
  destination?: CardDefinition,
): number {
  const selected = selectedCandidates(candidates, selectedInstanceIds);
  const open = requirements.filter((requirement) => selectionFits(requirement, selected, destination));
  return Math.min(...(open.length > 0 ? open : requirements).map(assemblyMaterialCount));
}

/** Whether the trash holds enough qualifying cards for any recipe to be worth offering. */
export function assemblyPossible(
  requirements: readonly AssemblyRequirement[],
  candidates: AssemblyCandidateDefinition[],
  destination?: CardDefinition,
): boolean {
  return requirements.some((requirement) => {
    const needed = assemblyMaterialCount(requirement);
    if (needed === 0) return false;
    const qualifying = candidates.filter((candidate) =>
      requirement.materials.some((slot) => assemblyMaterialMatchesSlot(candidate.definition, slot, destination)),
    );
    return qualifying.length >= needed;
  });
}
