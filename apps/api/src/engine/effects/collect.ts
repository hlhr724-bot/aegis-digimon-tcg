import { EffectTiming, type Seat, type Keyword } from "@aegis/shared";
import type { CardSource } from "./CardSource.js";
import type { Effect } from "./Effect.js";
import type { DiscardedStackSourceProof, EffectContext, TriggerInfo } from "./EffectContext.js";
import { getEffectModule } from "./registry.js";
import { UseTracker, canActivate, canTrigger } from "./kernel.js";

/** One effect paired with the source that produced it (collection output). */
export interface CollectedEffect {
  sourceIdentityAtDefer?: string | null;
  /** Ledger identity of an effect granted to a Digimon, retained across digivolution. */
  grantedEffectId?: number;
  /** Stable identity of an event occurrence, separate from the effect's per-turn usage key. */
  triggerOccurrence?: string;
  watcherEventIdentity?: string;
  source: CardSource;
  effect: Effect;
  /** Internal firing window retained so nested decisions can preserve effect provenance. */
  timing?: EffectTiming;
  /** Event payload captured when a timing triggered inside another resolving effect. */
  triggerInfo?: TriggerInfo;
  /** Stable event occurrence for repeated watcher activations, retained across re-collection. */
  activationIdentity?: object;
  /** Event-time placement proof for an inherited source discarded from its live host. */
  discardedStackSourceProof?: DiscardedStackSourceProof;
  /** Host that received this buried card's printed effect through a static conferral. */
  conferredToPermanentId?: string;
  /** Physical source of this effect-conferral copy; distinguishes Q1943's stacked grants. */
  conferralGranterInstanceId?: string;
  /**
   * Seat that orders this entry against the other simultaneous ones, when that is NOT the
   * source's controller. Set only for PENDING PROCESSING — a delayed deletion scheduled by an
   * earlier effect, which is no longer anyone's activated effect by the time it happens. The
   * ruling for that case (KB Q5564/Q5566/Q5568) puts the whole simultaneous set in the turn
   * player's hands, unlike the §15-4-3-5 split that governs activated effects.
   */
  orderingSeat?: Seat;
  /**
   * Announcement label for an entry that is NOT a printed timing effect: a SubTrigger watcher
   * folded into a timing window keeps its own event name ("whenSecurityRemoved"), so the
   * `effectTriggered` event reads the same whether the watcher resolved through the window or
   * through the SubTrigger bus.
   */
  timingLabel?: string;
  printedTiming?: string;
  /** The printed condition that armed a watcher, when its description is the whole clause. */
  triggerReason?: string;
}

/**
 * Ask one card's registered EffectModule for the effects it contributes at
 * `timing` for `source`. Returns [] when the card has no module registered
 * (an un-implemented card simply contributes nothing — it does not crash the match).
 */
export function effectsOf(timing: EffectTiming, source: CardSource): Effect[] {
  const module = getEffectModule(source.cardId);
  if (module === undefined) return [];
  return module.effectsForTiming(timing, source);
}

/**
 * Collect every effect that TRIGGERS at `timing` across a set of candidate card
 * sources. This is the framework half of stack resolution (step 1-2 of the
 * effect-stack-resolution outline in stack.ts): for each source, get its effects
 * for the timing, then keep those whose kernel `canTrigger` is true (timing guard
 * + the card's `when` + per-turn limit).
 *
 * Ordering (turn player first), optional prompting, and one-at-a-time resolution
 * belong to effect-stack-resolution and are NOT done here — this function is the
 * pure, deterministic "what is eligible" query the resolver builds on.
 *
 * `makeContext` binds the runtime EffectContext (trigger data, game access,
 * primitives, decision API) for a given effect; the engine supplies it.
 */
export function collectTriggeredEffects(
  timing: EffectTiming,
  sources: readonly CardSource[],
  makeContext: (source: CardSource, effect: Effect) => EffectContext,
  tracker: UseTracker,
): CollectedEffect[] {
  const collected: CollectedEffect[] = [];
  for (const source of sources) {
    for (const effect of effectsOf(timing, source)) {
      const ctx = makeContext(source, effect);
      if (canTrigger(effect, ctx, tracker)) {
        collected.push({ source, effect, timing });
      }
    }
  }
  return collected;
}

/**
 * Collect NAMED custom effects granted onto a permanent (GrantStatic grant:"effects" with
 * to the engine Effects it contributes at `timing`, anchored on the GRANTED permanent's top
 * card (its CardSource). The compiled effect carries the same timing builder's gate as a printed
 * effect (e.g. an [On Deletion] grant fires only when the granted permanent is in the deletion
 * window), so a granted ability resolves through the identical stack as a printed one.
 */
export function collectGrantedCustomEffects(
  timing: EffectTiming,
  grants: readonly { grantId?: number; instanceId: string; token: string; isActive?: () => boolean }[],
  sourceForInstance: (instanceId: string) => CardSource | undefined,
  effectsForGrant: (token: string, source: CardSource) => Effect[],
  makeContext: (source: CardSource, effect: Effect) => EffectContext,
  tracker: UseTracker,
): CollectedEffect[] {
  const collected: CollectedEffect[] = [];
  for (const { grantId, instanceId, token, isActive } of grants) {
    if (isActive?.() === false) continue;
    const source = sourceForInstance(instanceId);
    if (source === undefined) continue;
    for (const effect of effectsForGrant(token, source)) {
      // Separately resolved copies of the same named grant are separate effects. Give each
      // materialized ledger entry its own key so trigger de-duplication and UseTracker do not
      // collapse stacked copies that share a recipient and library token.
      const grantedEffect =
        grantId === undefined ? effect : { ...effect, effectKey: `${effect.effectKey}/grant/${grantId}` };
      const ctx = makeContext(source, grantedEffect);
      if (canTrigger(grantedEffect, ctx, tracker)) {
        collected.push({ source, effect: grantedEffect, timing, grantedEffectId: grantId });
      }
    }
  }
  return collected;
}

/**
 * Collect the `[On Deletion]` effects a permanent projects into the END-OF-ATTACK window
 * (BT16-015 Phoenixmon (X Antibody): "attach [End of Attack] to all of this Digimon's
 * [On Deletion] effects").
 *
 * The projection re-times effects rather than copying them: each candidate source is asked for
 * the SAME effects it would contribute at `OnDestroyedAnyone`, and they are reported at the
 * end-of-attack window instead. Two properties fall out of that and are the reason it is done
 * this way rather than through a granted-token library entry:
 *
 *  - Inherited `[On Deletion]` effects are reached, because a permanent's digivolution cards are
 *    candidate sources exactly as its top card is (KB Q2614's EX4-053 / Q2615's BT13-014).
 *  - Each projected effect keeps its own trigger condition and the inherited/printed placement
 *    guard `canActivate` applies, so a stack card's OWN printed `[On Deletion]` is not projected
 *    and a conditional inherited effect whose condition is unmet is collected-but-not-activatable
 *    — which is precisely Q2614's answer ("the effect will trigger, but it can't be activated").
 *
 * `onDeletion`'s base guard is permissive when the firing window carries no deleted set, which an
 * end-of-attack window never does; the caller is responsible for scoping the projection to the
 * attacking permanent.
 */
export function collectProjectedOnDeletionEffects(
  projectedPermanentIds: readonly string[],
  sourcesOfPermanent: (permanentId: string) => readonly CardSource[],
  makeContext: (source: CardSource, effect: Effect) => EffectContext,
  tracker: UseTracker,
): CollectedEffect[] {
  const collected: CollectedEffect[] = [];
  for (const permanentId of projectedPermanentIds) {
    for (const source of sourcesOfPermanent(permanentId)) {
      for (const effect of effectsOf(EffectTiming.OnDestroyedAnyone, source)) {
        const ctx = makeContext(source, effect);
        if (canTrigger(effect, ctx, tracker) && canActivate(effect, ctx, tracker)) {
          collected.push({ source, effect, timing: EffectTiming.OnEndAttack });
        }
      }
    }
  }
  return collected;
}

/**
 * Collect effects conferred from digivolution-stack cards onto their owning
 * permanent (GrantStatic grant:"effects").
 */
export function collectConferredEffects(
  timing: EffectTiming,
  conferrals: readonly {
    targetPermanentId: string;
    stackInstanceId: string;
    trigger?: string;
    /** Collect only the stack card's INHERITED effects, not its own. */
    inheritedOnly?: boolean;
    /** Do not collect the stack card's inherited effects. */
    excludeInherited?: boolean;
    excludeKeywords?: Keyword[];
    granterInstanceId?: string;
  }[],
  instanceById: (id: string) => CardSource | undefined,
  makeContext: (
    source: CardSource,
    effect: Effect,
    conferredToPermanentId: string,
    conferralGranterInstanceId?: string,
  ) => EffectContext,
  tracker: UseTracker,
): CollectedEffect[] {
  const collected: CollectedEffect[] = [];
  for (const {
    targetPermanentId,
    stackInstanceId,
    trigger,
    inheritedOnly,
    excludeInherited,
    excludeKeywords,
    granterInstanceId,
  } of conferrals) {
    const source = instanceById(stackInstanceId);
    if (source === undefined) continue;
    for (const effect of effectsOf(timing, source)) {
      if (effect.keywordEffect !== undefined && excludeKeywords?.includes(effect.keywordEffect) === true) continue;
      if (inheritedOnly === true && effect.isInherited !== true) continue;
      if (excludeInherited === true && effect.isInherited === true) continue;
      if (trigger !== undefined && effect.irTrigger !== trigger) continue;
      // A card can gain the same stack effect from more than one static grant
      // at the same timing (for example BT16-014 gaining Goldramon's
      // [When Digivolving] effect while Goldramon itself is also present).
      // Those are distinct effect instances and must not collide in the
      // per-turn UseTracker, whose ordinary identity is source + effectKey.
      // Build the provenance-specific key BEFORE consulting the tracker so the
      // key checked by canTrigger/canActivate is the same one later registered.
      const collectedEffect =
        granterInstanceId === undefined
          ? effect
          : { ...effect, effectKey: `${effect.effectKey}/conferral/${granterInstanceId}` };
      const ctx = makeContext(source, collectedEffect, targetPermanentId, granterInstanceId);
      if (canTrigger(collectedEffect, ctx, tracker) && canActivate(collectedEffect, ctx, tracker)) {
        collected.push({
          source,
          effect: collectedEffect,
          timing,
          conferredToPermanentId: targetPermanentId,
          conferralGranterInstanceId: granterInstanceId,
        });
      }
    }
  }
  return collected;
}
