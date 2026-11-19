import { CardKind, type CardDefinition } from "@aegis/shared";

export function activeDualFaceDefinition(definition: CardDefinition, useAsOption: boolean): CardDefinition {
  if (!definition.isDualCard) return definition;
  const inactiveKind = useAsOption ? CardKind.Digimon : CardKind.Option;
  return { ...definition, kinds: definition.kinds.filter((kind) => kind !== inactiveKind) };
}
