import type { UseTrackerSnapshot } from "#api/engine/effects/UseTrackerSnapshot";
import { CardKind, type CardDefinition } from "@aegis/shared";
import type { Effect } from "./Effect.js";
import type { EffectContext } from "./EffectContext.js";

/**
 * The effect-framework kernel: the cross-cutting `CanTrigger` / `CanActivate`
 * logic shared by every effect, plus the per-turn use limit. Keeping it here
 * lets the timing builders (builders.ts) and each card file stay declarative.
 *
 * Pure and side-effect free: every function takes the data it needs. The only
 * mutable piece, the per-turn use ledger, is an explicit object (UseTracker) the
 * engine owns and resets each turn.
 */

/**
 * Records how many times each effect has been used in the current turn. Mirrors
 * `CEntity_EffectController.UseEffectsThisTurn` + `GetUseCountThisTurn`: the source
 * counts uses by `ICardEffect.IsSameEffect`, which is "same source card AND same
 * HashString AND same RootCardEffect". Our analogue of that identity is
 * (source.instanceId, effect.effectKey) — the effectKey is the documented analogue
 * of HashString (PORTING-GUIDE.md section 2), and a given physical card instance is
 * the source. Reset via `resetForNewTurn` at each turn boundary.
 */
export class UseTracker {
  private readonly counts = new Map<string, number>();

  snapshot(): UseTrackerSnapshot {
    return Array.from(this.counts, ([key, count]) => [key, count] as const);
  }

  restore(snapshot: UseTrackerSnapshot): void {
    const restored = new Map<string, number>();
    for (const [key, count] of snapshot) {
      if (
        typeof key !== "string" ||
        !key.includes("\0") ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        restored.has(key)
      ) {
        throw new Error("Invalid effect usage snapshot");
      }
      restored.set(key, count);
    }
    this.counts.clear();
    for (const [key, count] of restored) {
      this.counts.set(key, count);
    }
  }

  private static key(instanceId: string, effectKey: string): string {
    return `${instanceId}\0${effectKey}`;
  }

  /** upstream GetUseCountThisTurn(cardEffect). */
  count(instanceId: string, effectKey: string): number {
    return this.counts.get(UseTracker.key(instanceId, effectKey)) ?? 0;
  }

  /** upstream RegisterUseEffectThisTurn(cardEffect). */
  register(instanceId: string, effectKey: string): void {
    const k = UseTracker.key(instanceId, effectKey);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  /** upstream RemoveUseEffectThisTurn(cardEffect): undo one recorded use. */
  unregister(instanceId: string, effectKey: string): void {
    const k = UseTracker.key(instanceId, effectKey);
    const next = (this.counts.get(k) ?? 0) - 1;
    if (next <= 0) this.counts.delete(k);
    else this.counts.set(k, next);
  }

  /**
   * Drop one instance's uses: CR §3-1-3-1-2 (a card that leaves the field returns as a new
   * card) and CR 8-2-2-1-6 (DNA digivolution resets [X Per Turn] uses). Watcher, replacement
   * and link-cost budgets are not keyed by instance; they are registered under string keys
   * that start with `${instanceId}/`, so those are matched too.
   */
  forgetInstance(instanceId: string): void {
    const prefixes = [`${instanceId}\0`, `${instanceId}/`, `link-cost/${instanceId}/`];
    for (const key of this.counts.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) this.counts.delete(key);
    }
  }

  hasUsesFor(instanceId: string): boolean {
    const prefixes = [`${instanceId}\0`, `${instanceId}/`];
    for (const key of this.counts.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) return true;
    }
    return false;
  }

  /** Clear all use counts (called when a new turn begins). */
  resetForNewTurn(): void {
    this.counts.clear();
  }
}

/**
 * upstream `isOverMaxCountPerTurn`: an effect is over its limit when the recorded
 * use count this turn is `>= maxPerTurn`. A non-positive `maxPerTurn` means
 * "unlimited" (the source setter ignores values <= 0, leaving the sentinel large
 * number; Effect uses -1 for that). Returns false when there is no limit.
 */
export function isOverMaxPerTurn(effect: Effect, tracker: UseTracker, instanceId: string): boolean {
  if (effect.maxPerTurn <= 0) return false; // unlimited
  return tracker.count(instanceId, effect.effectKey) >= effect.maxPerTurn;
}

/** A source hidden at deletion had no effect to trigger, even after trash reveals it. */
function wasHiddenAtDeletion(ctx: EffectContext): boolean {
  return (
    ctx.trigger?.deletedPermanentSnapshots?.some((snapshot) =>
      snapshot.faceDownSourceInstanceIds?.includes(ctx.source.instanceId),
    ) === true
  );
}

/** The shared host-category contract for live and event-time inherited placement. */
export function inheritedDigimonHost({
  definition,
  effectiveKinds,
  inBattleArea,
}: {
  definition: Pick<CardDefinition, "kinds">;
  effectiveKinds: readonly CardKind[];
  inBattleArea: boolean;
}): boolean {
  return effectiveKinds.includes(CardKind.Digimon) || (inBattleArea && definition.kinds.includes(CardKind.DigiEgg));
}

/** An inherited card's host had to confer the effect before deletion moved both cards. */
function inheritedHostInvalidAtDeletion(ctx: EffectContext): boolean {
  return (
    ctx.trigger?.deletedPermanentSnapshots?.some(
      (snapshot) =>
        snapshot.stackInstanceIds?.includes(ctx.source.instanceId) && snapshot.inheritedHostIsDigimon === false,
    ) === true
  );
}

/**
 * Whether this effect's source card is currently placed such that an
 * inherited/linked effect may activate:
 *
 *  - An INHERITED effect's source must be a digivolution card; a LINKED effect's source
 *    must be a linked card. Neither may come from the permanent's top card.
 *  - A NON-inherited, NON-linked effect's source card must BE the permanent's top
 *    card (a stack card's own printed effect does not fire while buried).
 *
 * When a printed source card is not on any permanent (e.g. an explicit hand/trash effect),
 * placement does not gate it. Inherited/linked effects are different: off-field they only
 * remain eligible for the deletion event whose trigger snapshot proves their former role.
 *
 * Continuous "is flipped" / link-membership / on-deletion nuances from the source
 * are deferred to the inherited-effects and advanced-mechanics subsystems.
 */
export function passesPlacementGuard(effect: Effect, ctx: EffectContext): boolean {
  if (effect.isActivatedConsequence === true) return true;
  if (wasHiddenAtDeletion(ctx)) return false;
  // CR 15-3-1: cards under a Tamer confer no inherited effects. Once deletion
  // moves that host to trash, generic stack membership cannot prove a Digimon
  // inherited the effect; preserve the host's event-time effective category.
  if (effect.isInherited && inheritedHostInvalidAtDeletion(ctx)) return false;
  // Gained keywords belong to the recipient Digimon, rather than its former top card.
  // Preserve activation across ordinary evolution, but never after that permanent leaves.
  if (ctx.source.gainedOnPermanentId !== undefined) {
    const recipient = ctx.source.permanent();
    return recipient?.permanentId === ctx.source.gainedOnPermanentId && ctx.source.isOnBattleArea();
  }
  const discardedProof = ctx.discardedStackSourceProof;
  const discardedOption = discardedProof !== undefined && ctx.source.definition.kinds.includes(CardKind.Option);
  if (discardedProof !== undefined) {
    const host = ctx.game.permanentById(discardedProof.hostPermanentId);
    const proofIsLive =
      effect.isInherited &&
      discardedProof.sourceInstanceId === ctx.source.instanceId &&
      discardedProof.hostPermanentId === ctx.trigger?.subjectPermanentId &&
      ctx.source.isInTrash?.() === true &&
      (host?.inBreeding === false || discardedOption || discardedProof.activatesFromDiscardedCard === true);
    if (!proofIsLive) return false;
  }
  const permanent = ctx.source.permanent();
  if (permanent === undefined) {
    if (
      effect.isInherited &&
      discardedProof?.sourceInstanceId === ctx.source.instanceId &&
      discardedProof.hostPermanentId === ctx.trigger?.subjectPermanentId &&
      (ctx.game.permanentById(discardedProof.hostPermanentId) !== undefined ||
        discardedOption ||
        discardedProof.activatesFromDiscardedCard === true)
    ) {
      return true;
    }
    // Off-field source (deleted → trash, hand-resident, etc.). For an inherited
    // effect whose source was deleted, consult the trigger's deletedWasStackInstanceIds
    // to determine whether the card was a stack card (inherited effect may fire) or
    // the permanent's top card (inherited effect must NOT fire).
    const stackIds = ctx.trigger?.deletedWasStackInstanceIds;
    const linkedIds = ctx.trigger?.deletedWasLinkedInstanceIds;
    if (stackIds !== undefined || linkedIds !== undefined) {
      const wasStackCard = stackIds?.includes(ctx.source.instanceId) === true;
      const wasLinkedCard = linkedIds?.includes(ctx.source.instanceId) === true;
      // A buried card's OWN effect may be active because the deleted host had already
      // gained it through GrantStatic (BT12-072 Q2214). The conferral snapshot and deleted
      // permanent identity prove that relationship survived until this deletion event.
      if (
        ctx.conferredToPermanentId !== undefined &&
        ctx.trigger.deletedPermanentIds?.includes(ctx.conferredToPermanentId) === true &&
        ctx.trigger.deletedInstanceIds?.includes(ctx.source.instanceId) === true &&
        wasStackCard
      ) {
        return true;
      }
      if (effect.isLinked) return wasLinkedCard;
      if (effect.isInherited) return wasStackCard;
      // A stack card moved to trash with its deleted host was not itself the
      // Digimon's top card. Its own printed [On Deletion]/＜Save＞ effect must
      // not activate; only its inherited effect was active in that position.
      if (ctx.trigger?.deletedInstanceIds?.includes(ctx.source.instanceId)) {
        return !wasStackCard && !wasLinkedCard;
      }
    }
    // A pending inherited/linked effect whose host left the battle area before activation has
    // lost the placement that conferred that effect (§15-4-4-3). Only the deletion snapshot
    // branch above can prove it was active for that specific On Deletion event.
    if (effect.isInherited || effect.isLinked) return false;
    return true;
  }
  // CR §4-7-9: a hidden stacked card has no referenceable information or active effects.
  if (
    permanent.stack?.some((card) => card.instanceId === ctx.source.instanceId && card.faceUp === false) &&
    !(ctx.continuousPass && effect.isColorWaiverStatic && ctx.source.definition.kinds.includes(CardKind.Option))
  )
    return false;
  if (permanent.topCard === undefined) return true;

  const isTop = permanent.topCard.instanceId === ctx.source.instanceId;

  // Conferred stack effects (GrantStatic grant:"effects") fire while the source
  // card remains in the digivolution stack of the target permanent.
  if (ctx.conferredToPermanentId !== undefined) {
    if (permanent.permanentId !== ctx.conferredToPermanentId) return false;
    return !isTop;
  }

  if (effect.isLinked) return permanent.linked.some((card) => card.instanceId === ctx.source.instanceId);
  if (effect.isInherited) {
    // Link-era Digi-Eggs can carry inherited text that is active while attached as a
    // link card (EX10-001/005), so inherited placement accepts either a digivolution
    // stack card or a linked card. The host-kind gate below still applies.
    const isLinkedCard = permanent.linked.some((card) => card.instanceId === ctx.source.instanceId);
    if (!isLinkedCard && !permanent.stack.some((card) => card.instanceId === ctx.source.instanceId)) return false;
    const def = ctx.game.definitionOf(permanent.topCard);
    const effectiveHostKinds = ctx.game.effectiveKinds?.(permanent.permanentId, def.kinds) ?? def.kinds;
    const isBattleAreaDigimon = inheritedDigimonHost({
      definition: def,
      effectiveKinds: effectiveHostKinds,
      inBattleArea: ctx.source.isOnBattleArea(),
    });
    // The breeding area has one rules-defined exception to the ordinary Digimon-host
    // requirement: BT13-007 King Drasil_7D6 is a Digi-Egg whose inherited effect is active
    // from its digivolution cards while it remains in breeding. In the battle area, a
    // Digi-Egg is a Digimon (CR 4-3-1) whether or not it prints DP, so its stack provides
    // inherited effects (EX2-007 Mother D-Reaper Q3276, BT22-007 Mother Eater).
    return isBattleAreaDigimon || ctx.source.isOnBreedingArea?.() === true;
  }
  // An Option used from a stack still checks its own printed use requirement.
  // Only the dedicated self-waiver builder gets this continuous exception; ordinary
  // printed statics and triggered effects remain inactive while buried.
  if (ctx.continuousPass && effect.isColorWaiverStatic && ctx.source.definition.kinds.includes(CardKind.Option)) {
    return true;
  }
  // Printed (own) effect: must be the top card.
  return isTop;
}

/**
 * upstream `ICardEffect.CanTrigger`: the effect's own trigger predicate
 * (builders.ts wires this to the timing guard ANDed with the card's `when`),
 * gated by the per-turn use limit. The "game has started" guard from the source is
 * the engine's responsibility (the stack only fires timings during a live match),
 * so it is not duplicated here.
 */
export function canTrigger(effect: Effect, ctx: EffectContext, tracker: UseTracker): boolean {
  if (wasHiddenAtDeletion(ctx)) return false;
  // CR 15-3-1: cards under a Tamer confer no inherited effects. Once deletion
  // moves that host to trash, generic stack membership cannot prove a Digimon
  // inherited the effect; preserve the host's event-time effective category.
  if (effect.isInherited && inheritedHostInvalidAtDeletion(ctx)) return false;
  if (isOverMaxPerTurn(effect, tracker, ctx.source.instanceId)) return false;
  return effect.canTrigger(ctx);
}

/**
 * upstream `ICardEffect.CanActivate`: per-turn limit, the effect's own activation
 * predicate, and the inherited/linked placement guard. (Disabled-by-other-effect
 * is a static-continuous-effects concern and is layered in there.)
 */
export function canActivate(effect: Effect, ctx: EffectContext, tracker: UseTracker): boolean {
  if (isOverMaxPerTurn(effect, tracker, ctx.source.instanceId)) return false;
  if (!effect.canActivate(ctx)) return false;
  return passesPlacementGuard(effect, ctx);
}

/**
 * upstream `ICardEffect.CanUse`: both gates must pass (used for static effects /
 * declarations that have no separate trigger vs activate step).
 */
export function canUse(effect: Effect, ctx: EffectContext, tracker: UseTracker): boolean {
  return canTrigger(effect, ctx, tracker) && canActivate(effect, ctx, tracker);
}
