import {
  digiXrosSlotMatches,
  effectiveExactNames,
  effectiveStaticNames,
  effectiveStaticTraits,
  nameIncludesToken,
  isPrintedKeywordToken,
  textPrintsKeyword,
  type CardDefinition,
  type DigiXrosMaterial,
  type DigiXrosNameOrTraitRef,
  type DigiXrosRequirement,
} from "@aegis/shared";
import { hasDistinctRepresentatives } from "@aegis/shared/effects/hasDistinctRepresentatives";

function includesFolded(values: readonly string[] | undefined, wanted: string): boolean {
  return values?.some((value) => value.toLocaleLowerCase() === wanted.toLocaleLowerCase()) === true;
}

const traitsOf = (definition: CardDefinition): string[] => effectiveStaticTraits(definition);

function printedTextOf(definition: CardDefinition): string {
  return [
    definition.effectText,
    definition.inheritedEffectText,
    definition.securityEffectText,
    definition.linkEffect,
    definition.linkRequirement,
    definition.dualEffect,
    definition.optionEffect,
  ]
    .filter((text): text is string => text !== undefined)
    .join(" ")
    .toLocaleLowerCase();
}

const normalizeName = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const normalizeTrait = (value: string): string => value.toLocaleLowerCase().replace(/[\s-]+/g, "");

/**
 * Definition-only mirror of the engine's `matchNameOrTrait`
 * (apps/api/src/engine/effects/interpreter/matching/definition.ts). The client sees no live
 * board, so only printed Rule traits are in reach; every other branch must stay identical.
 */
function matchesNameOrTrait(definition: CardDefinition, ref: DigiXrosNameOrTraitRef): boolean {
  const names = effectiveStaticNames(definition).map(normalizeName);
  const exactNames = effectiveExactNames(definition).map(normalizeName);
  const traits = traitsOf(definition).map(normalizeTrait);
  const text = printedTextOf(definition);
  return ref.tokens.some((token) => {
    const rawToken = token.toLocaleLowerCase();
    const nameToken = normalizeName(token);
    if (ref.match === "name") return names.some((name) => nameIncludesToken(name, nameToken));
    if (ref.match === "nameExact") return exactNames.some((name) => name === nameToken);
    if (ref.match === "trait") return traits.some((trait) => trait === normalizeTrait(rawToken));
    if (ref.match === "traitContains") return traits.some((trait) => trait.includes(normalizeTrait(rawToken)));
    if (ref.match !== undefined && ref.match !== "text" && ref.match !== "any") return false;
    // A printed keyword token ("with ＜Save＞ in its text") is delimiter-anchored and reads the
    // printed text only; anything else is the full name/trait/text union.
    if (isPrintedKeywordToken(rawToken)) return textPrintsKeyword(text, rawToken);
    return (
      names.some((name) => nameIncludesToken(name, nameToken)) ||
      traits.some((trait) => trait.includes(normalizeTrait(rawToken))) ||
      text.includes(rawToken)
    );
  });
}

function matchesSlot(
  definition: CardDefinition,
  slot: DigiXrosMaterial,
  digiXrosNames: readonly string[] = [],
): boolean {
  return digiXrosSlotMatches(
    definition,
    slot,
    { hasTrait: (card, trait) => includesFolded(traitsOf(card), trait), matchNameOrTrait: matchesNameOrTrait },
    digiXrosNames,
  );
}

function selectionFits(requirement: DigiXrosRequirement, candidates: DigiXrosMaterialCandidateDefinition[]): boolean {
  if (requirement.maxMaterials !== undefined && candidates.length > requirement.maxMaterials) return false;
  const slots = requirement.materials;
  if (slots.length === 1) {
    const slot = slots[0]!;
    const mismatches = candidates.filter(
      (candidate) => !matchesSlot(candidate.definition, slot, candidate.digiXrosNames),
    );
    if (mismatches.length > 1 || (mismatches.length === 1 && mismatches[0]?.canSubstitute !== true)) return false;
    if (slot.differentCardNumbers === true) {
      return new Set(candidates.map((candidate) => candidate.definition.cardId)).size === candidates.length;
    }
    if (slot.differentNames === true) {
      return hasDistinctRepresentatives(
        candidates.map((candidate) =>
          [...effectiveExactNames(candidate.definition), ...(candidate.digiXrosNames ?? [])].map((name) =>
            name.toLocaleLowerCase(),
          ),
        ),
      );
    }
    return true;
  }
  if (candidates.length > slots.length) return false;
  const used = new Array<boolean>(slots.length).fill(false);
  const assign = (index: number, substitutionUsed: boolean): boolean => {
    if (index === candidates.length) return true;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (used[slotIndex]) continue;
      const candidate = candidates[index]!;
      const matches = matchesSlot(candidate.definition, slots[slotIndex]!, candidate.digiXrosNames);
      const substitutes = !matches && !substitutionUsed && candidate.canSubstitute === true;
      if (!matches && !substitutes) continue;
      used[slotIndex] = true;
      if (assign(index + 1, substitutionUsed || substitutes)) return true;
      used[slotIndex] = false;
    }
    return false;
  };
  return assign(0, false);
}

export interface DigiXrosMaterialCandidateDefinition {
  instanceId: string;
  definition: CardDefinition;
  digiXrosNames?: readonly string[];
  canSubstitute?: boolean;
}

/** Instances that can extend the player's current DigiXros material selection. */
export function eligibleDigiXrosCandidateIds(
  requirement: DigiXrosRequirement,
  candidates: DigiXrosMaterialCandidateDefinition[],
  selectedInstanceIds: string[],
): Set<string> {
  const selectedIds = new Set(selectedInstanceIds);
  const selected = candidates.filter((candidate) => selectedIds.has(candidate.instanceId));
  const eligible = new Set(selected.map((candidate) => candidate.instanceId));
  for (const candidate of candidates) {
    if (selectedIds.has(candidate.instanceId)) continue;
    if (selectionFits(requirement, [...selected, candidate])) eligible.add(candidate.instanceId);
  }
  return eligible;
}
