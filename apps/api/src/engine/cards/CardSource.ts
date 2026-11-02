import { sourceRuntimeObjectRegistries } from "#api/engine/snapshot/context/sourceRuntimeObjectRegistries";
import type { RuntimeObjectRegistry } from "#api/engine/snapshot/RuntimeObjectRegistry";
import { EngineRuntimeObjectKind } from "#api/engine/snapshot/context/EngineRuntimeObjectKind";
import type { CardColor, CardDefinition, CardInstance, Permanent, Seat } from "@aegis/shared";
import type { CardSource } from "../effects/CardSource.js";
import { definitionOf, hasColor as defHasColor } from "./cardData.js";

/**
 * The live-state queries a CardSource needs that the card-data-model itself cannot
 * answer (they depend on where the card currently sits and whose turn it is). The
 * engine supplies an implementation; the card-data-model stays pure by depending
 * only on this narrow port instead of reaching into GameState/TurnStateMachine.
 *
 * This is the seam between the read-only card-data-model (definition lookup +
 * static facts, owned here) and the game-state-schema / turn-phase subsystems that
 * own runtime placement and turn ownership.
 */
export interface CardStateLookup {
  runtimeObjects?: RuntimeObjectRegistry;
  /** The Permanent this instance is the top card / in the stack of, or undefined. */
  permanentOf(instanceId: string): Permanent | undefined;
  /** source the effect runtime.IsExistOnBattleArea(card). */
  isOnBattleArea(instanceId: string): boolean;
  /** source the effect runtime.IsExistOnBreedingArea(card): in the raising area. Optional
   * on the port (fakes that never exercise a [Breeding] effect may omit it). */
  isOnBreedingArea?(instanceId: string): boolean;
  /**
   * Is this instance currently loose in its owner's trash (§15-14-3-1's `[Trash]` residency)?
   * Optional on the port (fakes that never exercise a `[Trash]` effect may omit it).
   */
  isInTrash?(instanceId: string): boolean;
  /**
   * Is this instance currently in its owner's hand (§15-14-2-1's `{Hand}` residency)?
   * Optional on the port (fakes that never exercise a `[Hand]` effect may omit it).
   */
  isInHand?(instanceId: string): boolean;
  /** Is this card currently face-up in its owner's security stack? */
  isInSecurity?(instanceId: string): boolean;
  /** source the effect runtime.IsOwnerTurn(card): is it `ownerSeat`'s turn? */
  isSeatsTurn(seat: Seat): boolean;
}

/**
 * Build the concrete CardSource for a specific CardInstance (the analogue of the
 * source `CardSource`, card-module contract). The static half (cardId,
 * ownerSeat, definition, hasColor) is resolved here from the card-data-model; the
 * placement/turn half delegates to the injected CardStateLookup.
 *
 * Pure and testable: given an instance and a lookup it constructs a value object;
 * it mutates nothing.
 */
export function createCardSource(instance: CardInstance, lookup: CardStateLookup): CardSource {
  if (typeof instance.cardId !== "string") {
    throw new Error(
      `createCardSource: instance ${instance.instanceId} has non-string cardId ` +
        `(${typeof instance.cardId}): ${JSON.stringify(instance.cardId)}`,
    );
  }
  const definition: CardDefinition = definitionOf(instance.cardId);
  const instanceId = instance.instanceId;
  const ownerSeat = instance.ownerSeat;

  const source: CardSource = {
    instanceId,
    cardId: instance.cardId,
    ownerSeat,
    definition,
    permanent: (): Permanent | undefined => lookup.permanentOf(instanceId),
    isOnBattleArea: (): boolean => lookup.isOnBattleArea(instanceId),
    isOnBreedingArea: (): boolean => lookup.isOnBreedingArea?.(instanceId) ?? false,
    isInTrash: (): boolean => lookup.isInTrash?.(instanceId) ?? false,
    isInHand: (): boolean => lookup.isInHand?.(instanceId) ?? false,
    isInSecurity: (): boolean => lookup.isInSecurity?.(instanceId) ?? false,
    isOwnersTurn: (): boolean => lookup.isSeatsTurn(ownerSeat),
    hasColor: (color: CardColor): boolean => defHasColor(definition, color),
  };
  if (lookup.runtimeObjects !== undefined) {
    lookup.runtimeObjects.track({ value: source, key: EngineRuntimeObjectKind.CARD_SOURCE.value });
    sourceRuntimeObjectRegistries.set(source, lookup.runtimeObjects);
  }
  return source;
}
