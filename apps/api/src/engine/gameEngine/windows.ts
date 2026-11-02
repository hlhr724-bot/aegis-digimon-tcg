import { EffectTiming, type CardInstance } from "@aegis/shared";
import { gatherTriggeredEffects } from "../effects/context.js";
import { eventGrantSnapshot } from "../effects/resolution.js";
import { permanentIdentityOf } from "../effects/index.js";
import type { CollectedEffect } from "../effects/collect.js";
import type { EffectContext, TriggerInfo } from "../effects/EffectContext.js";
import { runPendingTimingWindow } from "./timing/fire.js";
import {
  armedAsPendingCollected,
  armedSubTriggers,
  fireSubTriggerSnapshot,
  nestedTriggerSourceStillResident,
  pendingWindowCollected,
  subTriggerStillActivatable,
} from "./subTriggers.js";
import { uniqueOncePerTurnWatcherOccurrences } from "./subTriggerIdentity.js";
import type { GameEngine } from "../GameEngine.js";
import { collectDeletionPending, listCandidateInstances } from "./ruleProcess.js";
import { effectEnvironment } from "./effectContext.js";

/**
 * Open (or transparently join) a "resolving-effect window" identifying ONE top-level
 * effect resolution for `activeWindowToken` (subsystem: delayed-and-rule-effects, KB
 * Q2814 / BT2-053). Only the OUTERMOST caller mints a fresh token — a call nested
 * inside an already-open window (e.g. `fireTimingForInstance` firing a played
 * permanent's own On Play from within another effect's still-resolving body)
 * transparently reuses the ambient token instead of opening a new one. This is what
 * lets a single effect that plays two same-named Digimon in one go (e.g. Keramon
 * playing 2 Diaboromon Tokens) dedupe an `oncePerTiming` watcher's fire across both
 * plays, while two SEPARATE top-level plays/effects still get distinct tokens and each
 * fires the watcher. Deliberately plain synchronous bookkeeping (not an async wrapper
 * around the caller's body) so it adds no extra microtask tick to the existing
 * `fireTiming`/`fireTimingForInstance` await chains — callers must pair engine with
 * {@link endResolvingWindow} in a `finally`.
 *
 * @returns Whether THIS call minted the token (pass to `endResolvingWindow`).
 */
export function beginResolvingWindow(engine: GameEngine): boolean {
  const isOutermost = engine.activeWindowToken === undefined;
  if (isOutermost) engine.activeWindowToken = ++engine.windowTokenSeq;
  return isOutermost;
}

/**
 * Run one resolution loop, marking that a pool-draining loop is on the stack while it does
 * (see {@link pendingPoolDrainDepth}).
 */
export async function withPendingPoolDrain(
  engine: GameEngine,
  draining: boolean,
  body: () => Promise<void>,
): Promise<void> {
  if (!draining) return body();
  engine.pendingPoolDrainDepth += 1;
  try {
    await body();
  } finally {
    engine.pendingPoolDrainDepth -= 1;
  }
}

/** Close a window opened by `beginResolvingWindow`; a no-op for a non-outermost (nested) call. */
export function endResolvingWindow(engine: GameEngine, wasOutermost: boolean): void {
  if (!wasOutermost) return;
  // The entry effects of cards an Option played, printed [On Play] and parked watchers alike,
  // and the watchers its [Main] body armed wait for the Option's post-use routing boundary
  // (Q2577, Q6215).
  if (engine.optionResolutionDepth === 0) {
    engine.pendingNestedTimingEffects = [];
    engine.parkedEntrySubTriggers = [];
    engine.pendingWindowSubTriggers = [];
  }
  // Claims outlive an inner window when parked watchers are still queued (see
  // `parkArmedForEnclosingWindow`); the queue itself ends here, so the claims do too — but only
  // once no timing window is still folding watchers, since such a window's trailing bus fire
  // relies on the claims its own resolver just recorded.
  if (engine.subTriggerWindowDepth === 0 && engine.parkedEntrySubTriggers.length === 0)
    engine.consumedSubTriggerKeys.clear();
  engine.activeWindowToken = undefined;
}

/**
 * Run a would-leave "instead" replacement body as its own effect resolution. What the body
 * triggers (the [On Play] of a Tamer it plays, and that play's watchers) only triggers here: it
 * activates together with the replaced leave's [On Deletion], and the controller orders them
 * (Q2934, Q2994, Q3021). A body reached inside an open window already parks those effects for
 * that window, so only the outermost call collects them, unless a rule check caused the leave:
 * its deletion reactions and watchers resolve in the rule check's own window, so the body's
 * effects join that window instead of waiting for the enclosing one.
 */
export async function resolveLeaveReplacementBody<T>(
  engine: GameEngine,
  body: () => Promise<T>,
  options: { asEffectBody?: boolean } = {},
): Promise<T> {
  const wasOutermost = beginResolvingWindow(engine);
  if (!wasOutermost && engine.ruleTriggerPool === undefined) return body();
  const nestedBefore = new Set(engine.pendingNestedTimingEffects);
  let triggered: CollectedEffect[] = [];
  try {
    if (!wasOutermost) {
      const result = await body();
      triggered = engine.pendingNestedTimingEffects.filter((pending) => !nestedBefore.has(pending));
      return result;
    }
    let result!: T;
    await withPendingPoolDrain(engine, true, async () => {
      if (options.asEffectBody !== true) {
        result = await body();
        return;
      }
      engine.effectBodyTokens.push(++engine.windowTokenSeq);
      engine.effectResolutionDepth += 1;
      try {
        result = await body();
      } finally {
        engine.effectBodyTokens.pop();
        engine.effectResolutionDepth = Math.max(0, engine.effectResolutionDepth - 1);
      }
    });
    triggered = pendingWindowCollected(engine).filter((pending) => !nestedBefore.has(pending));
    return result;
  } finally {
    engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter((pending) =>
      nestedBefore.has(pending),
    );
    endResolvingWindow(engine, wasOutermost);
    engine.pendingLeaveReplacementEffects.push(
      ...triggered.map((pending) => ({
        ...pending,
        effect: {
          ...pending.effect,
          canActivate: (ctx: EffectContext) =>
            nestedTriggerSourceStillResident(engine, pending) && pending.effect.canActivate(ctx),
        },
      })),
    );
  }
}

/** Hand the effects a leave replacement triggered to the window that resolves them. */
export function takeLeaveReplacementPending(engine: GameEngine): CollectedEffect[] {
  return engine.pendingLeaveReplacementEffects.splice(0);
}

export async function flushDeferredSecurityRemovalTriggers(engine: GameEngine): Promise<void> {
  if (engine.flushingDeferredSecurityRemovalTriggers || engine.optionMainDepth > 0) return;
  engine.flushingDeferredSecurityRemovalTriggers = true;
  try {
    while (engine.deferredSecurityRemovalTriggers.length > 0) {
      const deferred = engine.deferredSecurityRemovalTriggers.shift();
      if (deferred !== undefined) {
        await fireSubTriggerSnapshot(engine, deferred.subscriptions, deferred.payload, deferred.contexts);
      }
    }
  } finally {
    engine.flushingDeferredSecurityRemovalTriggers = false;
  }
}

/** Fold completed effect-body security removals into the next derived-trigger pool. */
export function parkDeferredSecurityRemovalTriggers(
  engine: GameEngine,
  alreadyPending?: ReadonlySet<GameEngine["deferredSecurityRemovalTriggers"][number]>,
): void {
  for (let index = 0; index < engine.deferredSecurityRemovalTriggers.length;) {
    const deferred = engine.deferredSecurityRemovalTriggers[index]!;
    if (alreadyPending?.has(deferred)) {
      index += 1;
      continue;
    }
    engine.deferredSecurityRemovalTriggers.splice(index, 1);
    const armed = armedSubTriggers(engine, deferred.subscriptions, deferred.payload, deferred.contexts);
    const collected = armedAsPendingCollected(engine, armed);
    for (const entry of collected) {
      entry.sourceIdentityAtDefer = permanentIdentityOf(entry.source) ?? null;
    }
    engine.pendingNestedTimingEffects.push(...collected);
  }
}

/**
 * Fold the reactions the ordering effect's body deferred, such as the watchers of a Digimon it
 * deleted before ordering the attack, into the attack's [When Attacking] pool. Both happened
 * during that one effect, so they trigger simultaneously and the turn player orders them
 * together (CR §15-4-3, KB Q2044, Q3399). Flushing them as their own window first would force
 * them ahead of the [When Attacking] effects.
 */
export function parkDeferredTimingWindowsForAttack(engine: GameEngine): void {
  for (const entry of collectDeferredTimingPending(engine)) {
    entry.sourceIdentityAtDefer = permanentIdentityOf(entry.source) ?? null;
    engine.pendingNestedTimingEffects.push(entry);
  }
}

/**
 * Everything that must happen between two effects of one resolution loop, after the rule
 * sweep: drain the windows a resolving effect deferred (an [On Deletion] caused mid-body) and
 * the deferred security-removal reactions. Both were parked precisely because an effect was
 * running; between effects none is, and their triggers must activate BEFORE the effects that
 * were already pending (CR §15-4-5-2/3, KB Q3430).
 */
export async function settleBetweenEffects(engine: GameEngine): Promise<void> {
  await flushDeferredTimingWindows(engine);
  await flushDeferredSecurityRemovalTriggers(engine);
}

/** Security removal is another reaction of the same completed effect body. */
function collectDeferredSecurityRemovalPending(engine: GameEngine): CollectedEffect[] {
  const armed = uniqueOncePerTurnWatcherOccurrences(
    engine.deferredSecurityRemovalTriggers
      .splice(0)
      .flatMap((entry) => armedSubTriggers(engine, entry.subscriptions, entry.payload, entry.contexts)),
  );
  return armedAsPendingCollected(engine, armed).map((entry, index) => ({
    ...entry,
    effect: {
      ...entry.effect,
      canActivate: (ctx) => subTriggerStillActivatable(engine, armed[index]!) && entry.effect.canActivate(ctx),
    },
  }));
}

/** Stage one completed body's deferred reactions alongside its other derived effects. */
export function collectDeferredTimingPending(engine: GameEngine): CollectedEffect[] {
  if (engine.effectResolutionDepth > 0 || engine.optionMainDepth > 0) return [];
  const deferred = engine.deferredTimingWindows.splice(0);
  const deletions = deferred.filter((entry) => entry.timing === EffectTiming.OnDestroyedAnyone);
  const pending = collectDeletionPending(
    engine,
    deletions.map((entry) => ({
      trigger: entry.trigger,
      transientCandidates: [...(entry.transientCandidates ?? [])],
      ascensionCandidates: [...(entry.ascensionCandidates ?? [])],
    })),
  );
  pending.push(
    ...armedAsPendingCollected(
      engine,
      uniqueOncePerTurnWatcherOccurrences([
        ...deletions.flatMap((entry) => entry.deletionSubTriggers ?? []),
        ...(deletions.length > 0 ? engine.pendingBattleWonSubTriggers.splice(0) : []),
      ]),
    ),
  );
  for (const entry of deferred.filter((item) => item.timing !== EffectTiming.OnDestroyedAnyone)) {
    pending.push(
      ...collectNestedTimingEffects(engine, entry.timing, entry.trigger, [
        ...listCandidateInstances(engine),
        ...(entry.transientCandidates ?? []),
      ]),
    );
  }
  pending.push(...collectDeferredSecurityRemovalPending(engine));
  pending.push(...takeLeaveReplacementPending(engine));
  return pending;
}

export async function flushDeferredTimingWindows(engine: GameEngine): Promise<void> {
  if (engine.flushingDeferredTimingWindows) return;
  // Deferred windows belong between effect bodies. A nested entry seam can reach engine
  // helper while its enclosing card body is still resolving; keep that queue parked until
  // the genuine between-effects boundary.
  if (engine.effectResolutionDepth > 0 || engine.optionResolutionDepth > 0) return;
  engine.flushingDeferredTimingWindows = true;
  try {
    const pending = collectDeferredTimingPending(engine);
    await runPendingTimingWindow(engine, pending);
  } finally {
    engine.flushingDeferredTimingWindows = false;
  }
}

export function shouldDeferNestedTiming(engine: GameEngine): boolean {
  return (
    engine.ruleProcessing ||
    (engine.effectResolutionDepth > 0 && engine.activeWindowToken !== undefined) ||
    (engine.optionResolutionDepth > 0 && engine.optionMainDepth === 0)
  );
}

export function collectNestedTimingEffects(
  engine: GameEngine,
  timing: EffectTiming,
  trigger: TriggerInfo,
  candidateInstances: readonly CardInstance[],
): CollectedEffect[] {
  const capturedTrigger = { ...trigger };
  const environment = effectEnvironment(engine, capturedTrigger);
  return gatherTriggeredEffects(environment, timing, candidateInstances, eventGrantSnapshot(environment)).map(
    // Each captured event is a new activation, even for the same physical card/effect.
    // Re-collecting this parked entry retains that event's identity.
    (collected) => ({ ...collected, timing, triggerInfo: capturedTrigger, activationIdentity: capturedTrigger }),
  );
}

export function deferNestedTimingEffects(
  engine: GameEngine,
  timing: EffectTiming,
  trigger: TriggerInfo,
  candidateInstances: readonly CardInstance[],
): void {
  const collected = collectNestedTimingEffects(engine, timing, trigger, candidateInstances);
  for (const entry of collected) {
    entry.sourceIdentityAtDefer = permanentIdentityOf(entry.source) ?? null;
  }
  engine.pendingNestedTimingEffects.push(...collected);
}

/**
 * Run a TRIGGERED effect body outside the continuous tier.
 *
 * A triggered, duration-scoped effect is never a continuous one (Comprehensive Rules
 * §15-8-2: persistent effects are the ones "constantly activated without being
 * triggered"), so nothing it records may carry the `continuous` tag. This holds even
 * when the body was reached FROM a recompute — a watcher discovered while the engine was
 * re-deriving statics (BT8-081's inherited Digi-Burst reaction) — and when a recompute
 * starts elsewhere while the body is mid-await.
 */
export function withTriggeredMutations<T>(engine: GameEngine, body: () => Promise<T>): Promise<T> {
  return engine.continuousScope.run(false, body);
}

/** Whether what is being recorded right here belongs to the continuous tier. */
export function inContinuousPass(engine: GameEngine): boolean {
  // No store means engine code is not on a continuous-recompute chain, and it must NOT fall
  // back to a shared "a recompute is running somewhere" flag: a triggered body interleaving
  // with an in-flight recompute would tag its one-shot modifiers `continuous`, and the next
  // recompute would erase them (EX13-060's re-run [When Digivolving] -8000 vanished whenever
  // a Tamer play woke its watcher while the play's own recompute was still in flight).
  return engine.continuousScope.getStore() ?? false;
}
