import { trackResolutionEnvironment } from "#api/engine/effects/resolution/trackResolutionEnvironment";
import { EffectTiming, type CardInstance, type Seat } from "@aegis/shared";
import { createEffectContext, createGameAccess, gatherTriggeredEffects, type EffectEnvironment } from "./context.js";
import type { CollectedEffect } from "./collect.js";
import type { EffectContext } from "./EffectContext.js";
import { effectiveKinds, effectiveNames, effectiveTraits } from "./continuous.js";
import { resolveTiming, type ResolutionEnv } from "./stack.js";
import { isTimingActivationDisabled } from "./timingActivation.js";

/**
 * Composition root for the effect stack (subsystem: effect-stack-resolution): bind
 * the pure resolver loop in stack.ts to the effect-framework's collection chain
 * (`gatherTriggeredEffects`, context.ts) and the engine's authoritative state, then
 * run a timing window.
 *
 * This is the single seam `GameEngine.fireTiming` delegates to via `runTiming`. — not inside the pure loop and not
 * inside the engine — lets the resolver stay unit-testable with fakes while the
 * engine wires production dependencies in one call.
 *
 * The source `GetSkillInfos` (documented behavior) walks a fixed set of zones for
 * candidate effects: each player's field permanents, hand, trash, and face-up
 * security, for BOTH players (turn order applied later). The engine supplies that
 * candidate list via `listCandidateInstances` so this module does not encode
 * GameState's zone layout; the framework's `gatherTriggeredEffects` applies the
 * kernel `canTrigger` + per-turn-limit filter.
 */

/** The engine-side dependencies the resolver composition needs beyond the framework env. */
export interface ResolutionDeps {
  registerPendingEffects?: ResolutionEnv["registerPendingEffects"];
  /** Active player (turn-player-first ordering). Usually `state.turnSeat`. */
  turnSeat: Seat;

  /**
   * The card instances that could contribute an effect at a timing — the union of
   * the zones documented behavior `GetSkillInfos` scans (field permanents + hand +
   * trash + face-up security, both players). Re-invoked on every collection pass so
   * effects on cards that entered a zone DURING resolution are seen. The canonical
   * implementation (`GameEngine.listCandidateInstances` /
   * `collectPermanentInstances`) also surfaces each permanent's digivolution-stack
   * and linked cards.
   */
  listCandidateInstances: () => readonly CardInstance[];

  /**
   * State-based-action sweep run after each resolution (documented behavior
   * `RuleProcess`). Owned by delayed-and-rule-effects / security-and-win-check; the
   * resolver only needs the seam. A no-op is acceptable until those land.
   */
  ruleProcess: () => Promise<void>;

  /** Has the match ended? (`state.gameOver`). */
  isGameOver: () => boolean;

  /** Controller prompts the resolver issues between effects (createResolverDecisions). */
  chooseOrder: ResolutionEnv["chooseOrder"];
  askOptional: ResolutionEnv["askOptional"];

  /** Observability seam: a triggered effect finished resolving (see ResolutionEnv.onResolved). */
  onResolved?: ResolutionEnv["onResolved"];

  /** Observability seam: a triggered effect is about to resolve (see ResolutionEnv.onResolving). */
  onResolving?: ResolutionEnv["onResolving"];
  onActivating?: ResolutionEnv["onActivating"];
  onWithoutLegalOutcome?: ResolutionEnv["onWithoutLegalOutcome"];

  /** Drain the engine's deferred queues between effects (see ResolutionEnv.betweenEffects). */
  betweenEffects?: ResolutionEnv["betweenEffects"];

  /**
   * SubTrigger watchers that fired off the SAME event as this window, presented as ordinary
   * collected effects (GameEngine.withPendingSubTriggers). One digivolution triggers the
   * evolving card's own `[When Digivolving]` AND every "when your Digimon digivolves" watcher on
   * the board; those are simultaneous triggers of one event, and one player orders ALL of their
   * own in a single prompt (CR §15-4) — which is only possible if they reach the resolver as one
   * pool instead of as two sequential passes. The reference implementation has no second bus at
   * all: every triggered effect lands in the one `StackedSkillInfos` list.
   *
   * Re-queried each collection pass like the printed effects, so a watcher whose condition
   * lapsed drops out and a resolved one does not come back. Absent => the window carries none.
   */
  collectPending?: () => CollectedEffect[];
}

/**
 * The granted effects that existed when the environment's triggering event occurred. An
 * ability acquired while its timing window is already resolving did not exist then and
 * cannot trigger retroactively (BT10-011 Q1940); one granted to a card that has since left
 * the field still triggered from that event (BT12-105 Q2241).
 */
export function eventGrantSnapshot(env: EffectEnvironment): NonNullable<Parameters<typeof gatherTriggeredEffects>[3]> {
  return {
    stackEffectConferrals: [
      ...(env.triggerInfo?.stackEffectConferralsSnapshot ?? env.continuous.listStackEffectConferrals()),
    ],
    customEffectGrants: [...(env.triggerInfo?.customEffectGrantsSnapshot ?? env.continuous.listCustomEffectGrants())],
    onDeletionAtEndOfAttackProjections: [
      ...(env.triggerInfo?.onDeletionAtEndOfAttackProjectionsSnapshot ??
        env.continuous.listOnDeletionAtEndOfAttackProjections().map((projection) => projection.permanentId)),
    ],
  };
}

/**
 * Assemble a {@link ResolutionEnv} from the framework {@link EffectEnvironment}
 * (state + fx + ask + tracker) and the engine {@link ResolutionDeps}. `collect`
 * delegates straight to `gatherTriggeredEffects` with a FRESHLY listed candidate
 * set each pass; `makeContext` reuses the framework's EffectContext factory bound to
 * the same state/fx/ask the env carries.
 */
export function buildResolutionEnv(
  env: EffectEnvironment,
  deps: ResolutionDeps,
  grantSnapshot: ReturnType<typeof eventGrantSnapshot> = eventGrantSnapshot(env),
): ResolutionEnv {
  const environment: ResolutionEnv = {
    runtimeObjects: env.runtimeObjects,
    runtimeCallbacks: env.runtimeCallbacks,
    registerPendingEffects: deps.registerPendingEffects,
    turnSeat: deps.turnSeat,
    tracker: env.tracker,
    collect: (timing: EffectTiming): CollectedEffect[] => [
      ...gatherTriggeredEffects(env, timing, deps.listCandidateInstances(), grantSnapshot),
      ...(deps.collectPending?.() ?? []),
    ],
    makeContext: (collected: CollectedEffect): EffectContext =>
      createEffectContext({
        source: collected.source,
        // Carry the firing window's TriggerInfo into the resolution context (was hardcoded
        // `{}`), so a triggered effect's resolve() can read the trigger source — e.g. "that
        // attacking Digimon" (P-064 attackerPermanentId) or "the Digimon that digivolved"
        // (BT19-080 subjectPermanentId). Collection (context.ts:309) already binds env.triggerInfo
        // for the canTrigger/`when` check; resolution must use the SAME trigger or a deferred
        // resolve (after an optional/cost decision) loses the source.
        trigger: collected.triggerInfo ?? env.triggerInfo ?? {},
        // Third arg (linkCostReduction) mirrors gatherTriggeredEffects (context.ts:303-307)
        // and GameEngine.buildEffectContext: without it, a Link action resolved from a
        // TRIGGERED effect (e.g. BT24-038's OnPlay Link) reads the () => 0 default inside
        // createGameAccess and ignores any active <Link +N> cost-reduction grant (BT25-004).
        game: Object.assign(
          createGameAccess(
            env.state,
            (id) => env.continuous.linkMaxDelta(id),
            (id, traits) => env.continuous.linkCostReduction(id, traits),
            env.hasKeyword,
            env.digivolvedThisTurn,
            (permanentId, timing) => isTimingActivationDisabled(env.continuous, permanentId, timing),
            env.effectiveColors,
            env.colorRequirementWaived,
            env.colorRequirementAlternatives,
            env.canDeclareAttack,
            (permanentId, printedTraits) => effectiveTraits(env.continuous, permanentId, printedTraits),
            (permanentId, printedKinds) => effectiveKinds(env.continuous, permanentId, printedKinds),
            env.baseGrantedDigivolve,
            undefined,
            (id, traits) => env.continuous.linkCostReductionGrant(id, traits),
            (permanent, printedName) => effectiveNames(env.continuous, permanent, printedName),
            env.battleOpponentOf,
          ),
          { runtimeCallbacks: env.runtimeCallbacks, runtimeObjects: env.runtimeObjects },
        ),
        fx: env.fxForSource?.(collected.source) ?? env.fx,
        ask: env.ask,
        usage: env.tracker,
        // Provenance the client shows next to a decision: the PRINTED window the effect is
        // tagged with ("[When Attacking]"), which is the IR trigger, not the engine's internal
        // EffectTiming name for it. Hand-written effects that carry no IR trigger fall back to
        // the enum name.
        activeTiming:
          collected.effect.irTrigger ?? (collected.timing === undefined ? undefined : EffectTiming[collected.timing]),
        activeEffectText: collected.effect.description,
        activeEffectKey: collected.effect.effectKey,
        conferredToPermanentId: collected.conferredToPermanentId,
        conferralGranterInstanceId: collected.conferralGranterInstanceId,
        discardedStackSourceProof: collected.discardedStackSourceProof,
      }),
    ruleProcess: deps.ruleProcess,
    isGameOver: deps.isGameOver,
    chooseOrder: deps.chooseOrder,
    askOptional: deps.askOptional,
    onResolved: deps.onResolved,
    onResolving: deps.onResolving,
    onActivating: deps.onActivating,
    onWithoutLegalOutcome: deps.onWithoutLegalOutcome,
    betweenEffects: deps.betweenEffects,
  };
  trackResolutionEnvironment({
    framework: env,
    environment,
    payload: {
      trigger: env.triggerInfo ?? {},
      grants: grantSnapshot,
      dependencies: deps,
    },
  });
  return environment;
}

/**
 * Build the env and resolve a timing window in one call — the exact body
 * `GameEngine.fireTiming` should adopt once it constructs an EffectEnvironment
 * (state + createPrimitives + createDecisionApi + a per-turn UseTracker) and a
 * ResolutionDeps (createResolverDecisions + candidate-zone enumeration + the rule
 * sweep). Until then `fireTiming` stays a documented no-op.
 */
export async function runTiming(timing: EffectTiming, env: EffectEnvironment, deps: ResolutionDeps): Promise<void> {
  await resolveTiming(timing, buildResolutionEnv(env, deps));
}
