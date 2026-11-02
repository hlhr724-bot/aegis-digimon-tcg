import { createNoPromptDecisionApi } from "#api/engine/decisions/createNoPromptDecisionApi";
import { EffectTiming } from "@aegis/shared";
import { effectProvenanceKinds } from "../effects/effectProvenance.js";
import { canActivate, canTrigger } from "../effects/kernel.js";
import { collectConferredEffects, collectGrantedCustomEffects } from "../effects/collect.js";
import { getEffectModule } from "../effects/registry.js";
import { grantedTokenEffectsForTiming } from "../effects/interpreter.js";
import type { CardSource } from "../effects/CardSource.js";
import type { Effect } from "../effects/Effect.js";
import type { EffectContext, DecisionApi } from "../effects/EffectContext.js";
import { sameNumericMap } from "./schemaSync.js";
import { listCandidateInstances } from "./ruleProcess.js";
import { buildEffectContext, cardSourceOf } from "./effectContext.js";
import type { GameEngine } from "../GameEngine.js";
import { runWithPreparedCardLocation } from "#api/engine/effects/runWithPreparedCardLocation";
import { nestedTriggerSourceStillResident } from "#api/engine/gameEngine/subTriggers";
import { applyEntryGrants } from "#api/engine/gameEngine/applyEntryGrants";

/**
 * Re-derive every continuous (persistent / `EffectTiming.None`) effect from a clean
 * slate (subsystem: static-continuous-effects). Comprehensive Rules §15-8-2:
 * persistent effects ("[Your Turn] This Digimon gets +1000 DP", "can't attack", a
 * granted ＜Blocker＞, a continuous cost reduction) are "constantly activated without
 * being triggered" — there is no firing window, so the engine recomputes the whole
 * tier at each relevant decision point.
 *
 * Clear-then-recompute (so nothing double-applies): drop only the CONTINUOUS tier of
 * both ledgers (the `continuous`-tagged DP/pierce/evo/play-cost modifiers and the
 * `continuous`-tagged restrictions/keywords/aliases/waivers) — one-shot,
 * duration-scoped modifiers from triggered effects are untouched — then re-fire the
 * `None`-timing effects with `continuousMode` on, so each re-records itself as
 * `continuous`. Unlike a triggered window engine does NOT touch the per-turn use ledger
 * and never prompts (persistent effects are mandatory and make no choices); a static
 * effect whose own `when`/`condition` gate fails simply contributes nothing engine pass,
 * which is exactly how a `[Your Turn]`/`while ...` effect lapses when its gate stops
 * holding.
 *
 * Re-entrant calls from inside the continuous pass are no-ops. Concurrent requests from a
 * different async flow instead wait for the in-flight pass and queue one final refresh. That
 * completion barrier prevents consumers from observing the clear-before-refill interval of
 * the continuous ledgers. Public so callers/tests can force a recompute at a decision point
 * the timing/boundary hooks do not already cover.
 */
export async function recomputeContinuousEffects(engine: GameEngine, publish = true): Promise<void> {
  engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter((pending) =>
    nestedTriggerSourceStillResident(engine, pending),
  );
  if (publish && engine.continuousScope.getStore() !== true) await applyEntryGrants(engine);
  if (engine.recomputeInFlight !== undefined) {
    if (engine.continuousScope.getStore() === true) return;
    engine.recomputeQueued = true;
    await engine.recomputeInFlight;
    if (publish) {
      await publishContinuousState(engine);
    }
    return;
  }
  // Continuous effects are passive modifiers and never prompt (ARCHITECTURE.md §5);
  // a Static effect whose action has `optional:true` must be auto-declined here so
  // we don't open a nested DecisionManager request that collides with an already-open
  // dec-1 (#residual-gaps/nested-decision-crash).
  const noPromptAsk = createNoPromptDecisionApi();
  // Defer the driver by one microtask so `recomputeInFlight` is installed before the
  // first pass can recursively reach engine method through a static effect primitive.
  const task = Promise.resolve().then(async () => {
    do {
      engine.recomputeQueued = false;
      // Everything each pass records is a continuous effect, and the tier tag has to follow
      // THIS async chain: a timing window resolving concurrently (a play whose trailing
      // recompute is still in flight) must not read the tag from a shared field.
      //
      // A continuous gate may read a value produced by another continuous effect (for
      // example, EX10-010's DP threshold on two facing copies). Re-derive from a clean tier
      // each time so stale grants and duplicate watchers cannot accumulate, but seed each
      // pass with the previous pass's DP deltas so the dependency chain can reach a fixpoint.
      // The cap protects the resolver from a genuinely oscillating set of card effects.
      const maxFixpointPasses = 32;
      let seed = engine.projection.continuousDpSeeds();
      let converged = false;
      for (let pass = 0; pass < maxFixpointPasses; pass++) {
        await engine.continuousScope.run(true, () => engine.runContinuousPass(noPromptAsk, seed, false));
        engine.projection.updateContinuousDpSeeds();
        const next = engine.projection.continuousDpSeeds();
        if (sameNumericMap(seed, next)) {
          converged = true;
          break;
        }
        seed = next;
      }
      if (!converged) {
        throw new Error(`continuous effects did not converge after ${maxFixpointPasses} passes`);
      }
      engine.modifiers.refreshReducedDp(engine.state);
      if (publish) {
        await publishContinuousState(engine);
      }
    } while (engine.recomputeQueued);
  });
  engine.recomputeInFlight = task;
  try {
    await task;
  } finally {
    if (engine.recomputeInFlight === task) engine.recomputeInFlight = undefined;
  }
}

/** Intermediate stack tops derive ledgers but publish memory thresholds/affordances at the final boundary. */
async function publishContinuousState(engine: GameEngine): Promise<void> {
  engine.memory.commitTurnEndMinMemoryRecompute();
  engine.projection.syncActivatableEffects();
  engine.projection.syncOncePerTurnUsage();
  engine.projection.syncKeywords();
  engine.projection.syncSummoningSickness();
  engine.projection.syncRestrictions();
  engine.projection.syncFieldEffects();
  engine.projection.syncAttackTargets();
  engine.projection.syncHandAffordances();
  engine.projection.syncLinkTargets();
  await engine.projection.syncNegamonPlayEffects();
}

/**
 * The body of one continuous recompute: clear the continuous tier of every ledger, then
 * re-fire the persistent (`EffectTiming.None`) effects, the effects conferred by a
 * "gains all effects" grant, and the named custom-effect grants. Always run inside the
 * continuous scope (see {@link recomputeContinuousEffects}).
 */
export async function runContinuousPass(
  engine: GameEngine,
  noPromptAsk: DecisionApi,
  seed: ReadonlyMap<string, number> = new Map(),
  publishMemory = true,
): Promise<void> {
  try {
    await derivePass(engine, noPromptAsk, seed);
  } finally {
    if (publishMemory) engine.memory.commitTurnEndMinMemoryRecompute();
  }
}

async function derivePass(
  engine: GameEngine,
  noPromptAsk: DecisionApi,
  seed: ReadonlyMap<string, number>,
): Promise<void> {
  engine.modifiers.clearContinuous(engine.state);
  // clearContinuous recomputes each touched permanent from the non-continuous layer. Reapply
  // only the previous pass's continuous deltas, so gates can observe the prior derived value
  // while engine pass still rebuilds a clean ledger.
  for (const player of engine.state.players) {
    const permanents = player.breeding === undefined ? player.battleArea : [...player.battleArea, player.breeding];
    for (const permanent of permanents) {
      const delta = seed.get(permanent.permanentId);
      if (delta !== undefined) permanent.currentDP += delta;
    }
  }
  engine.continuous.clearContinuous();
  // Staged rather than cleared: the turn-end condition is read synchronously while engine
  // pass awaits, so a half-derived tier must never be observable (MemoryGauge.
  // beginTurnEndMinMemoryRecompute has the full reasoning).
  engine.memory.beginTurnEndMinMemoryRecompute();
  // The SubTrigger registry holds CONTINUOUS Static/[Breeding] Replacement (reduceCost) and
  // SubTrigger watcher installs, re-derived each recompute alongside the other continuous
  // tiers. Clear them here so a `Static` reduceCost re-installs exactly once per recompute
  // (CR-01) rather than accumulating to N, 2N, 3N… across the multiple recomputes per turn.
  // One-shot installs from triggered windows (BT23-056's granted timed trigger) carry no
  // `continuous` flag and survive.
  engine.subTriggers.clearContinuous();
  engine.deletionMaxDp.clear();
  engine.dpDeleteBudget.clear();
  // The security-DP ledger holds the CONTINUOUS ModifySecurityDP deltas (ST3-12's
  // [Opponent's Turn] +2000), re-derived each recompute alongside the other continuous
  // tiers. Clear it here so a re-fire under the [Opponent's Turn] guard re-applies the
  // delta exactly once (IR-01) rather than accumulating across recomputes.
  engine.securityDp.clearContinuous();

  const continuousEffects: { source: CardSource; effect: Effect }[] = [];
  for (const instance of listCandidateInstances(engine)) {
    const module = getEffectModule(instance.cardId);
    if (module === undefined || module.hasTiming?.(EffectTiming.None) === false) continue;
    const source = cardSourceOf(engine, instance);
    for (const effect of module.effectsForTiming(EffectTiming.None, source)) {
      continuousEffects.push({ source, effect });
    }
  }
  continuousEffects.sort(
    (left, right) => (left.effect.continuousPriority ?? 0) - (right.effect.continuousPriority ?? 0),
  );
  for (const { source, effect } of continuousEffects) {
    const prepared = runWithPreparedCardLocation({
      state: engine.state,
      execute: () => {
        const ctx = buildEffectContext(engine, source, {}, noPromptAsk);
        ctx.activeTiming = effect.irTrigger ?? EffectTiming[EffectTiming.None];
        ctx.continuousPass = true;
        if (!canTrigger(effect, ctx, engine.tracker)) {
          return undefined;
        }
        if (!canActivate(effect, ctx, engine.tracker)) {
          return undefined;
        }
        const restoreSource = enterContinuousEffectSource(ctx, effect);
        return { ctx, restoreSource };
      },
    });
    if (prepared === undefined) {
      continue;
    }
    const { ctx, restoreSource } = prepared;
    try {
      await effect.resolve(ctx);
    } finally {
      restoreSource();
    }
  }
  // A GrantStatic "gain all effects" source is established during the base static pass.
  // Its conferred card can itself have an [All Turns]/Static watcher (EX3-013 under
  // BT12-072), so resolve those newly-visible continuous effects in the same recompute.
  // Triggered timings already use collectConferredEffects through the normal resolver;
  // without engine companion pass only their discrete effects existed, while leave
  // replacements silently failed to install.
  const conferrals = engine.continuous.listStackEffectConferrals();
  const customGrants = engine.continuous.listCustomEffectGrants();
  const sourceByInstanceId = new Map<string, CardSource>();
  if (conferrals.length > 0 || customGrants.length > 0) {
    for (const instance of listCandidateInstances(engine)) {
      sourceByInstanceId.set(instance.instanceId, cardSourceOf(engine, instance));
    }
  }
  const conferredContinuous = collectConferredEffects(
    EffectTiming.None,
    conferrals,
    (instanceId) => sourceByInstanceId.get(instanceId),
    (source, effect, conferredToPermanentId, conferralGranterInstanceId) => ({
      ...buildEffectContext(engine, source, {}, noPromptAsk),
      activeTiming: EffectTiming[EffectTiming.None],
      activeEffectText: effect.description,
      continuousPass: true,
      conferredToPermanentId,
      conferralGranterInstanceId,
    }),
    engine.tracker,
  );
  for (const { source, effect, conferredToPermanentId, conferralGranterInstanceId } of conferredContinuous) {
    const ctx: EffectContext = {
      ...buildEffectContext(engine, source, {}, noPromptAsk),
      activeTiming: EffectTiming[EffectTiming.None],
      activeEffectText: effect.description,
      continuousPass: true,
      conferredToPermanentId,
      conferralGranterInstanceId,
    };
    const restoreSource = enterContinuousEffectSource(ctx, effect);
    try {
      await effect.resolve(ctx);
    } finally {
      restoreSource();
    }
  }
  // Named custom effect grants ("1 of your opponent's Digimon gains '[All Turns] When engine
  // Digimon becomes suspended, lose 2 memory.'"). Discrete timings already reach these through
  // gatherTriggeredEffects -> collectGrantedCustomEffects, but a granted [All Turns]/Static
  // clause lives in the CONTINUOUS window: its SubTrigger/Replacement watcher has to be
  // installed by engine pass or it is never armed at all. Without engine the grant is recorded in
  // the ledger, reads as active on the board, and silently never fires.
  const grantedContinuous = collectGrantedCustomEffects(
    EffectTiming.None,
    customGrants,
    (instanceId) => sourceByInstanceId.get(instanceId),
    (token, source) => grantedTokenEffectsForTiming(token, EffectTiming.None, source),
    (source, effect) => ({
      ...buildEffectContext(engine, source, {}, noPromptAsk),
      activeTiming: EffectTiming[EffectTiming.None],
      activeEffectText: effect.description,
      continuousPass: true,
    }),
    engine.tracker,
  );
  for (const { source, effect } of grantedContinuous) {
    const ctx: EffectContext = {
      ...buildEffectContext(engine, source, {}, noPromptAsk),
      activeTiming: EffectTiming[EffectTiming.None],
      activeEffectText: effect.description,
      continuousPass: true,
    };
    if (!canActivate(effect, ctx, engine.tracker)) continue;
    const restoreSource = enterContinuousEffectSource(ctx, effect);
    try {
      await effect.resolve(ctx);
    } finally {
      restoreSource();
    }
  }

  // BT23-024 suspend-restriction-with-superlative-exception: for every ARMED source, re-derive
  // the affected opponent set (all opponent Digimon MINUS the highest-play-cost one) and record
  // a CONTINUOUS `suspend` restriction per affected permanent. Done here (not in a card's
  // resolve) because the exempt set is a computed exclusion over the live board, recomputed each
  // pass so it tracks plays/digivolves/removals (KB Q5250/Q5252; Q6025/Q6026 all-restricted).
  engine.projection.applySuspendRestrictionRecompute();

  // A continuous immunity can disappear because its live condition stopped matching (for
  // example, a suspended Digimon unsuspended), not only because a duration was swept. Re-read
  // stored opponent-effect DP modifiers after every such immunity has been re-derived.
  engine.projection.recomputeExpiredAffectationRecipients();
  engine.modifiers.recomputeFilteredPlayerDp(engine.state);

  // A seed is only an input to this pass. Recompute seeded and newly modified permanents from the rebuilt
  // ledgers so a gate that stopped matching cannot leave the seed's stale DP visible.
  // A DP aura can run before its target reinstalls its immunity in this pass. Refresh
  // every live recipient after all protections exist, including newly affected targets
  // absent from the previous seed; otherwise their provisional reduction oscillates.
  for (const player of engine.state.players) {
    const permanents = player.breeding === undefined ? player.battleArea : [...player.battleArea, player.breeding];
    for (const permanent of permanents) {
      if (seed.has(permanent.permanentId) || engine.modifiers.hasContinuousDp(permanent.permanentId))
        engine.modifiers.recomputeDP(engine.state, permanent.permanentId);
    }
  }
  engine.modifiers.recomputeFilteredPlayerDp(engine.state);
}

/** A rebuilt aura belongs to its own source, even inside an opposing effect's resolution. */
function enterContinuousEffectSource(ctx: EffectContext, effect: Effect): () => void {
  const sourceKinds = effectProvenanceKinds(ctx, { isLinked: effect.isLinked });
  ctx.effectSourceKinds = sourceKinds;
  ctx.fx.enterEffectResolution?.(
    ctx.source.ownerSeat,
    sourceKinds,
    ctx.conferredToPermanentId ?? ctx.source.permanent()?.permanentId,
  );
  return () => ctx.fx.leaveEffectResolution?.();
}
