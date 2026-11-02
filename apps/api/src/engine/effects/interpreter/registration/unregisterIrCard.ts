import { compiledEffects } from "@aegis/shared/effects/data";
import { runtimeCompiledNodeRegistry } from "#api/engine/effects/interpreter/snapshot/runtimeCompiledNodeRegistry";
import { registeredCompiledCards, registeredIrModules } from "#api/engine/effects/interpreter/compiledCards";
import { unregisterCard } from "#api/engine/effects/registry";

export function unregisterIrCard(cardId: string): void {
  delete compiledEffects[cardId];
  registeredCompiledCards.delete(cardId);
  registeredIrModules.delete(cardId);
  runtimeCompiledNodeRegistry.resetCard(cardId);
  unregisterCard(cardId);
}
