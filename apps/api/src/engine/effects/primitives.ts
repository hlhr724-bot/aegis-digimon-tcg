import { primitivesRuntimeContexts } from "#api/engine/effects/verbs/snapshot/primitivesRuntimeContexts";
import type { Primitives } from "./EffectContext.js";

export { dnaDigivolveCostFor, matchingDnaDigivolveCost } from "./verbs/digivolveCost.js";
export { rootZoneOfLooseInstance } from "./verbs/looseInstances.js";
export type { CombatPort, MemoryPort, PrimitivesEngine, SelectionPort } from "./verbs/types.js";

import type { PrimitivesEngine } from "./verbs/types.js";

export type { Primitives };
export { ModifierLedger } from "./modifiers.js";
import { createPrimitivesContext, type InternalVerbs } from "./verbs/context.js";
import { createBreedingAreaVerbs } from "./verbs/breedingArea.js";
import { createSessionVerbs } from "./verbs/session.js";
import { createDigiXrosVerbs } from "./verbs/digiXros.js";
import { createResourcesVerbs } from "./verbs/resources.js";
import { createStatsVerbs } from "./verbs/stats.js";
import { createPlayVerbs } from "./verbs/play.js";
import { createDigivolveVerbs } from "./verbs/digivolve.js";
import { createDnaDigivolveVerbs } from "./verbs/dnaDigivolve.js";
import { createStackTopsVerbs } from "./verbs/stackTops.js";
import { createPlaceUnderVerbs } from "./verbs/placeUnder.js";
import { createRelocateVerbs } from "./verbs/relocate.js";
import { createLinkingVerbs } from "./verbs/linking.js";
import { createTrashVerbs } from "./verbs/trash.js";
import { createTrashStackVerbs } from "./verbs/trashStack.js";
import { createOptionEffectsVerbs } from "./verbs/optionEffects.js";
import { createSecurityTrashVerbs } from "./verbs/securityTrash.js";
import { createDeletionVerbs } from "./verbs/deletion.js";
import { createRuleTrashVerbs } from "./verbs/ruleTrash.js";
import { createSuspendVerbs } from "./verbs/suspend.js";
import { createReturnsVerbs } from "./verbs/returns.js";
import { createReturnStacksVerbs } from "./verbs/returnStacks.js";
import { createDeckVerbs } from "./verbs/deck.js";
import { createRestrictionsVerbs } from "./verbs/restrictions.js";
import { createGrantsVerbs } from "./verbs/grants.js";
import { createSecurityStackVerbs } from "./verbs/securityStack.js";
import { createCombatVerbs } from "./verbs/combat.js";
import { createDelayedVerbs } from "./verbs/delayed.js";
import { createEngineBackedVerbs } from "./verbs/engineBacked.js";

/**
 * Effect primitives (subsystem: effect-primitives; sources: documented behavior,
 * documented behavior, documented behavior).
 *
 * `createPrimitives(engine)` is the concrete, server-authoritative implementation of
 * the `Primitives` interface (EffectContext.ts) that card modules are written
 * against (card-module contract). Each verb is the direct analogue of an
 * source the effect runtime / the effect factory operation: it mutates the
 * authoritative GameState and emits the matching ServerEvent. This replaces the
 * `unimplementedPrimitives()` placeholder in context.ts (which threw for every verb).
 *
 * Design (consistent with the sibling action modules digivolve.ts / playCard.ts):
 *   - It depends on a narrow `PrimitivesEngine` PORT, not on the concrete GameEngine,
 *     so there is no import cycle and the primitives are unit-testable with a tiny
 *     fake engine. The real GameEngine builds one from its MemoryGauge, emitter,
 *     decision API, and permanent-id allocator.
 *   - Memory verbs delegate to the MemoryGauge (the single owner of memory math; it
 *     documents these exact entry points). Deletion / suspend / security movement
 *     reuse GameStateAccess (the established state-mutation helper) rather than
 *     re-deriving the same mutations. Duration-scoped verbs (modifyDP / grantPierce /
 *     changeEvoCost) use the ModifierLedger.
 *   - Verbs that require a player choice (which cards to take from a revealed/searched
 *     set, which hand cards to play) call the injected DecisionApi via the engine
 *     port; verbs with a fixed count (draw N, reveal top N) need no round trip
 *     (ARCHITECTURE.md section 5).
 *
 * platform-independent: no presentation component / coroutine / UI / animation / network transport. The source
 * `...AndProcessAccordingToResult` shape — perform the movement, then let the caller
 * branch on what was actually affected — is preserved by returning the affected
 * CardInstance[] / Permanent[] from each targeting verb.
 */

/**
 * Build the concrete Primitives bound to `engine`. The verbs live in `verbs/`, one
 * module per subject; this assembles them into the single object the effect
 * context's `fx` is set to.
 *
 * The modules call each other, so the whole set has to exist before any of it runs:
 * `pc.fx` is filled in with the finished object, and the forwarding aliases each
 * module declares read it at call time.
 */
export function createPrimitives(engine: PrimitivesEngine): Primitives {
  const pc = createPrimitivesContext(engine);
  const fx: Primitives & InternalVerbs = {
    ...createBreedingAreaVerbs(pc),
    ...createSessionVerbs(pc),
    ...createDigiXrosVerbs(pc),
    ...createResourcesVerbs(pc),
    ...createStatsVerbs(pc),
    ...createPlayVerbs(pc),
    ...createDigivolveVerbs(pc),
    ...createDnaDigivolveVerbs(pc),
    ...createStackTopsVerbs(pc),
    ...createPlaceUnderVerbs(pc),
    ...createRelocateVerbs(pc),
    ...createLinkingVerbs(pc),
    ...createTrashVerbs(pc),
    ...createTrashStackVerbs(pc),
    ...createOptionEffectsVerbs(pc),
    ...createSecurityTrashVerbs(pc),
    ...createDeletionVerbs(pc),
    ...createRuleTrashVerbs(pc),
    ...createSuspendVerbs(pc),
    ...createReturnsVerbs(pc),
    ...createReturnStacksVerbs(pc),
    ...createDeckVerbs(pc),
    ...createRestrictionsVerbs(pc),
    ...createGrantsVerbs(pc),
    ...createSecurityStackVerbs(pc),
    ...createCombatVerbs(pc),
    ...createDelayedVerbs(pc),
    ...createEngineBackedVerbs(pc),
  };
  pc.fx = fx;
  primitivesRuntimeContexts.set(fx, pc);
  return fx;
}
