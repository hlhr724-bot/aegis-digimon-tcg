import { effectiveExactNames } from "./effectiveNames.js";
import { hasDistinctRepresentatives } from "../effects/hasDistinctRepresentatives.js";
import type { CardDefinition } from "./types.js";

export function canAssignDistinctNames(definitions: readonly CardDefinition[]): boolean {
  return hasDistinctRepresentatives(
    definitions.map((definition) => effectiveExactNames(definition).map((name) => name.toLowerCase())),
  );
}
