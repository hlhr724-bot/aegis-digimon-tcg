import { runtimeCompiledNodeRegistry } from "#api/engine/effects/interpreter/snapshot/runtimeCompiledNodeRegistry";
import { CompiledRootKind } from "#api/engine/effects/interpreter/snapshot/CompiledRootKind";
// The runtime registry of compiled card records.

import type { EffectModule } from "../EffectModule.js";
import { getCompiledCard } from "@aegis/shared";
import type { CompiledCard } from "@aegis/shared";

// Per-card modules are the runtime source of truth. Hand-written overrides can intentionally
// differ from the generated shared aggregate, so nested actions (for example ActivateMain)
// must resolve the same CompiledCard that was used to register the module's effects.
class CompiledCardRegistry extends Map<string, CompiledCard> {
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }

  override set(key: string, value: CompiledCard): this {
    this.#revision++;
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    const deleted = super.delete(key);
    if (deleted) this.#revision++;
    return deleted;
  }

  override clear(): void {
    if (this.size > 0) this.#revision++;
    super.clear();
  }
}

export const registeredCompiledCards = new CompiledCardRegistry();

export const registeredIrModules = new Map<string, EffectModule>();

export function runtimeCompiledCard(cardId: string): CompiledCard | undefined {
  const compiled = registeredCompiledCards.get(cardId) ?? getCompiledCard(cardId);
  if (compiled !== undefined) {
    runtimeCompiledNodeRegistry.registerRoot({
      cardId,
      rootKey: CompiledRootKind.CATALOG.value,
      root: compiled,
      index: true,
    });
  }
  return compiled;
}

/** Whether the runtime card module owns an inline compiled IR record. */
export function hasRegisteredCompiledCard(cardId: string): boolean {
  return registeredCompiledCards.has(cardId);
}

/** Names a card is unconditionally also treated as in every zone. */
export function universalNameAliasesFor(cardId: string): string[] {
  const compiled = runtimeCompiledCard(cardId);
  if (compiled === undefined) return [];

  const aliases = new Set<string>();
  for (const effect of compiled.effects) {
    if (effect.trigger !== "Rule") continue;
    for (const action of effect.actions) {
      if (
        action.kind !== "GrantStatic" ||
        action.grant !== "name" ||
        action.digiXrosOnly === true ||
        action.target.isSelf !== true
      )
        continue;
      for (const token of action.tokens ?? []) aliases.add(token);
    }
  }
  return [...aliases];
}

/** Names a card is also treated as only while it is being checked as a DigiXros material. */
export function digiXrosOnlyNameAliasesFor(cardId: string): string[] {
  const compiled = runtimeCompiledCard(cardId);
  if (compiled === undefined) return [];

  const aliases = new Set<string>();
  for (const effect of compiled.effects) {
    if (effect.trigger !== "Static" && effect.trigger !== "Rule") continue;
    for (const action of effect.actions) {
      if (action.kind !== "GrantStatic" || action.grant !== "name" || action.digiXrosOnly !== true) continue;
      for (const token of action.tokens ?? []) aliases.add(token);
    }
  }
  return [...aliases];
}
