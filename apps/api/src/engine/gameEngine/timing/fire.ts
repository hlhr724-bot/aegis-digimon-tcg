import type { ResolutionCandidateScope } from "#api/engine/effects/resolution/ResolutionCandidateScope";
import { createResolutionCandidateReader } from "#api/engine/effects/resolution/createResolutionCandidateReader";
import { ResolutionCandidateKind } from "#api/engine/effects/resolution/ResolutionCandidateKind";
import { createPendingDeletionEffectReader } from "#api/engine/gameEngine/createPendingDeletionEffectReader";
import { EffectTiming, Permanent, type CardInstance } from "@aegis/shared";
import { definitionOf } from "../../cards/cardData.js";
import { runTiming } from "../../effects/index.js";
import type { CollectedEffect } from "../../effects/collect.js";
import type { TriggerInfo } from "../../effects/EffectContext.js";
import { resolutionDeps } from "../actionDeps.js";
import type { GameEngine } from "../../GameEngine.js";
import { pendingWindowCollected, withPendingSubTriggers } from "../subTriggers.js";
import {
  candidateSourceLocation,
  collectPermanentInstances,
  instancesById,
  listCandidateInstances,
  collectRuleProcessPending,
  hasRuleProcessPending,
} from "../ruleProcess.js";
import {
  beginResolvingWindow,
  collectNestedTimingEffects,
  deferNestedTimingEffects,
  endResolvingWindow,
  flushDeferredSecurityRemovalTriggers,
  flushDeferredTimingWindows,
  shouldDeferNestedTiming,
  takeLeaveReplacementPending,
  withPendingPoolDrain,
  withTriggeredMutations,
} from "../windows.js";
import { effectEnvironment } from "../effectContext.js";
import { collectPendingBurstDigivolveTrash } from "#api/engine/gameEngine/collectPendingBurstDigivolveTrash";

export async function fireTiming(
  engine: GameEngine,
  timing: EffectTiming,
  trigger: TriggerInfo = {},
  transientCandidates: readonly CardInstance[] = [],
): Promise<void> {
  if (timing === EffectTiming.OnDestroyedAnyone) {
    // Every deletion of ONE rule-check pass is simultaneous (§17-1-3), so its [On Deletion]
    // effects join the pass's single pool instead of opening a window per sweep (§15-4-3-3).
    if (engine.ruleTriggerPool !== undefined) {
      engine.ruleTriggerPool.push({
        trigger: { ...trigger },
        ascensionCandidates: [],
        // A deleted Token leaves the match instead of entering trash. Capture its live card
        // instance before movement so its already-triggered [On Deletion] can still join the
        // pooled post-fixpoint window (EX11-012 Q6514).
        transientCandidates: [
          ...transientCandidates,
          ...instancesById(engine, trigger.deletedInstanceIds ?? []).filter(
            (instance) => definitionOf(instance).isToken === true,
          ),
        ],
      });
      return;
    }
    // A deletion caused during another effect only TRIGGERS [On Deletion] at that point.
    // Activation waits until the causing effect has finished (§15-4-4). Re-collecting at
    // flush time also enforces §15-4-4-3: if that card left trash meanwhile, its pending
    // effect can no longer activate (BT26-016 Q6977).
    if (
      shouldDeferNestedTiming(engine) ||
      (engine.activeWindowToken !== undefined && !engine.flushingDeferredTimingWindows)
    ) {
      engine.deferredTimingWindows.push({
        readPendingEffects: createPendingDeletionEffectReader({ engine, trigger, transientCandidates }),
        timing,
        trigger: { ...trigger },
        transientCandidates: [
          ...transientCandidates,
          ...instancesById(engine, trigger.deletedInstanceIds ?? []).filter(
            (instance) => definitionOf(instance).isToken === true,
          ),
        ],
      });
      return;
    }
  }
  if (shouldDeferNestedTiming(engine)) {
    await engine.recomputeContinuousEffects();
    deferNestedTimingEffects(engine, timing, trigger, [...listCandidateInstances(engine), ...transientCandidates]);
    return;
  }
  await runTimingWindow(engine, timing, trigger, transientCandidates);
}

export async function runTimingWindow(
  engine: GameEngine,
  timing: EffectTiming,
  trigger: TriggerInfo,
  transientCandidates: readonly CardInstance[] = [],
  extraPending: readonly CollectedEffect[] = [],
): Promise<void> {
  // A play-cost deletion belongs to the play's own trigger batch (KB Q5131): collect its
  // [On Deletion] effects at trigger time and hand them to the play's entry window, where
  // they compete with the played card's [On Play] in one ordering prompt. Gated here rather
  // than in `fireTiming` because a rule-check pass routes its pooled deletion window
  // straight to engine runner.
  if (timing === EffectTiming.OnDestroyedAnyone && engine.payingPlayCost) {
    await engine.recomputeContinuousEffects();
    engine.pendingPlayCostDeletionEffects.push(
      ...collectNestedTimingEffects(engine, timing, trigger, [
        ...listCandidateInstances(engine),
        ...transientCandidates,
      ]),
    );
    return;
  }
  const windowExtraPending =
    timing === EffectTiming.OnDestroyedAnyone
      ? [...extraPending, ...takeLeaveReplacementPending(engine)]
      : extraPending;
  const wasOutermostWindow = beginResolvingWindow(engine);
  const excludedNestedPending =
    engine.effectResolutionDepth === 0 ? new Set(engine.pendingNestedTimingEffects) : undefined;
  try {
    await engine.recomputeContinuousEffects();
    // A phase-boundary event has one fixed set of card sources: a Tamer played by an
    // earlier start-of-turn/start-of-main effect did not exist when that boundary
    // occurred and cannot retroactively trigger (BT24-082/Q5664, BT24-083/Q5667).
    // The end of the turn is the same kind of boundary in the other direction: a card
    // that ARRIVES while it is being resolved has missed it, so its own end-of-turn
    // clause is not processed engine turn (Q2731/Q2762 — "the end of the turn timing has
    // already passed"). Without the snapshot, EX11-046's "[End of Opponent's Turn] engine
    // Digimon may digivolve into [Galacticmon]" put a fresh Galacticmon on top of the
    // stack that fired the very same clause again, chaining through hand and trash in
    // one window.
    const phaseBoundarySourceLocations =
      timing === EffectTiming.OnStartTurn ||
      timing === EffectTiming.OnStartMainPhase ||
      timing === EffectTiming.OnEndTurn ||
      timing === EffectTiming.OnEndAttack
        ? new Map(
            listCandidateInstances(engine).map((instance) => [
              instance.instanceId,
              candidateSourceLocation(engine, instance.instanceId),
            ]),
          )
        : undefined;
    let candidateScope: ResolutionCandidateScope = { kind: ResolutionCandidateKind.ALL.value };
    if (phaseBoundarySourceLocations !== undefined) {
      candidateScope = { kind: ResolutionCandidateKind.BOUNDARY.value, locations: phaseBoundarySourceLocations };
    }
    const listWindowCandidates = createResolutionCandidateReader({
      engine,
      scope: candidateScope,
      transientCandidates,
    });
    const burstPending = timing === EffectTiming.OnEndTurn ? collectPendingBurstDigivolveTrash(engine) : [];
    // GRANTED timed triggers fired at the same physical point as the matching window, and
    // therefore simultaneous with the printed effects it collects:
    //   - "[Start of Your Main Phase]" granted onto a permanent (BT23-056); the per-install
    //     `matches` gate re-checks turn-ownership so it fires only on the watched permanent's
    //     owner's main phase (documented behavior), never the granter's.
    //   - "[End of Your Turn]" (EX10-035's delayed self-delete) and "at the end of your
    //     opponent's turn" (EX3-069/EX4-058/EX4-071/EX6-070/BT16-084/BT16-085/BT16-088/
    //     BT17-025), both at the OnEndTurn window while `state.turnSeat` is still the ENDING
    //     player's seat, which is what `endOfOpponentTurnGate` reads.
    // Everything engine window resolves is a TRIGGERED effect, so its mutations must not be
    // tagged continuous even when a recompute is still in flight around it (see
    // {@link withTriggeredMutations}).
    // A rule check at this checkpoint triggers alongside its printed
    // effects (§15-4-3-3). Collect its movements before the resolver's first pass,
    // then offer its reactions in the same pending group. The normal resolver sweep
    // remains responsible for checks caused by effects later in the window.
    const ruleCheckPending =
      engine.effectResolutionDepth === 0 && engine.optionResolutionDepth === 0 && hasRuleProcessPending(engine)
        ? await collectRuleProcessPending(engine)
        : [];
    const runWindow = async (): Promise<void> =>
      withTriggeredMutations(engine, async () => {
        await withPendingPoolDrain(engine, wasOutermostWindow, () =>
          runTiming(
            timing,
            effectEnvironment(engine, trigger),
            resolutionDeps(engine, listWindowCandidates, {
              outermost: wasOutermostWindow,
              extraPending: [...windowExtraPending, ...ruleCheckPending, ...burstPending],
              excludeNestedPending: excludedNestedPending,
            }),
          ),
        );
        if (wasOutermostWindow) {
          await flushDeferredTimingWindows(engine);
          await flushDeferredSecurityRemovalTriggers(engine);
        }
      });
    if (timing === EffectTiming.OnStartMainPhase) {
      await withPendingSubTriggers(engine, ["startOfYourMainPhase"], {}, runWindow);
    } else if (timing === EffectTiming.OnEndTurn) {
      // A delayed "at end of turn" effect set up while this window resolves missed the timing
      // and must not fire this turn (KB Q2731/Q2762).
      const enclosingTurnEndSeat = engine.turnEndWindowSeat;
      engine.turnEndWindowSeat = engine.state.turnSeat;
      try {
        await withPendingSubTriggers(engine, ["endOfTurn", "endOfOpponentTurn"], {}, runWindow, {
          onlyInitiallyArmed: true,
        });
      } finally {
        engine.turnEndWindowSeat = enclosingTurnEndSeat;
      }
    } else {
      await runWindow();
    }
    await engine.recomputeContinuousEffects();
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}

/**
 * Resolve one timing window, past the deferral gates {@link fireTiming} applies. The
 * pooled rule-check window calls engine directly: at that point the fixpoint has converged
 * and no card body is on the stack, so there is nothing left to defer behind.
 */
/**
 * Resolve the nested pending pool for an effect-directed attack whose ordering body is a
 * watcher rather than a timing window, so nothing else would drain it before Counter Timing
 * and the security check (§11-1). The pool is the ONLY source here — candidate instances are
 * narrowed to none — so engine drains what the attack and its ordering body already triggered
 * rather than re-opening a [When Attacking] window of its own.
 */
/** Resolve a derived batch without recollecting an unrelated printed timing. */
export async function runPendingTimingWindow(engine: GameEngine, pending: readonly CollectedEffect[]): Promise<void> {
  if (pending.length === 0) return;
  const wasOutermostWindow = beginResolvingWindow(engine);
  const excludeNestedPending = new Set(engine.pendingNestedTimingEffects);
  try {
    await withTriggeredMutations(engine, () =>
      withPendingPoolDrain(engine, wasOutermostWindow, () =>
        runTiming(
          EffectTiming.OnDestroyedAnyone,
          effectEnvironment(engine, {}),
          resolutionDeps(
            engine,
            createResolutionCandidateReader({ engine, scope: { kind: ResolutionCandidateKind.NONE.value } }),
            {
              outermost: wasOutermostWindow,
              extraPending: pending,
              excludeNestedPending,
            },
          ),
        ),
      ),
    );
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}

export async function drainPendingAttackTriggers(engine: GameEngine): Promise<void> {
  if (pendingWindowCollected(engine).length === 0) return;
  const wasOutermostWindow = beginResolvingWindow(engine);
  try {
    await withTriggeredMutations(engine, () =>
      withPendingPoolDrain(engine, wasOutermostWindow, () =>
        runTiming(
          EffectTiming.OnUseAttack,
          effectEnvironment(engine, {}),
          resolutionDeps(
            engine,
            createResolutionCandidateReader({ engine, scope: { kind: ResolutionCandidateKind.NONE.value } }),
            { outermost: true },
          ),
        ),
      ),
    );
    await engine.recomputeContinuousEffects();
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}

/**
 * Drain entry effects parked by cards an Option played, after that Option finishes routing.
 * Arts Digivolve belongs to the Option's post-use overwrite step, so this boundary must occur
 * after it; normal pending-source residency then drops an On Play source buried by the Arts
 * evolution while retaining the evolution bonus draw.
 */
export async function drainPendingOptionEntryTriggers(
  engine: GameEngine,
  extraPending: readonly CollectedEffect[] = [],
): Promise<void> {
  await drainPendingEffectTriggers(engine, EffectTiming.OnPlay, extraPending);
}

/**
 * Drain what a directly activated [Main] body triggered once that body has finished
 * (CR §15-4-4): a card trashed as its Digi-Burst cost activates only now (KB Q1155).
 */
export async function drainActivatedMainTriggers(
  engine: GameEngine,
  extraPending: readonly CollectedEffect[] = [],
): Promise<void> {
  await drainPendingEffectTriggers(engine, EffectTiming.OnDeclaration, extraPending);
}

/** Counter reactions settle after the body and before combat continues (CR §15-4-4). */
export async function drainActivatedCounterTriggers(
  engine: GameEngine,
  extraPending: readonly CollectedEffect[] = [],
): Promise<void> {
  await drainPendingEffectTriggers(engine, EffectTiming.OnCounterTiming, extraPending);
}

async function drainPendingEffectTriggers(
  engine: GameEngine,
  timing: EffectTiming,
  extraPending: readonly CollectedEffect[],
): Promise<void> {
  if (pendingWindowCollected(engine).length === 0 && extraPending.length === 0) return;
  const wasOutermostWindow = beginResolvingWindow(engine);
  try {
    await withTriggeredMutations(engine, () =>
      withPendingPoolDrain(engine, wasOutermostWindow, () =>
        runTiming(
          timing,
          effectEnvironment(engine, {}),
          resolutionDeps(
            engine,
            createResolutionCandidateReader({ engine, scope: { kind: ResolutionCandidateKind.NONE.value } }),
            { outermost: true, extraPending },
          ),
        ),
      ),
    );
    await engine.recomputeContinuousEffects();
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}

/**
 * Fire a timing window scoped to one source instance (subsystem:
 * effect-stack-resolution). The play-card verb fires On Play for a newly placed
 * permanent and the option activation for an Option card; only the played card's
 * effects should fire at that window (the rest of the board is not triggering on
 * its own play here), so the candidate set is narrowed to that single instance.
 *
 * `trigger` is carried into the window's `ctx.trigger` (e.g. `enteredByEffect` for an
 * effect-driven play/digivolve — see {@link fireEnteredByEffectTiming}). Each window's
 * environment carries its OWN trigger payload (no shared engine field), so firing NESTED
 * inside an outer effect's resolution — or interleaved with a concurrent one — can never
 * strip or clobber another window's trigger.
 */
export async function fireTimingForInstance(
  engine: GameEngine,
  timing: EffectTiming,
  sourceInstanceId: string,
  trigger: TriggerInfo = {},
  extraPending: readonly CollectedEffect[] = [],
): Promise<void> {
  if (shouldDeferNestedTiming(engine)) {
    await engine.recomputeContinuousEffects();
    deferNestedTimingEffects(engine, timing, trigger, instancesById(engine, [sourceInstanceId]));
    return;
  }
  const wasOutermostWindow = beginResolvingWindow(engine);
  const excludedNestedPending =
    engine.effectResolutionDepth === 0 ? new Set(engine.pendingNestedTimingEffects) : undefined;
  try {
    await engine.recomputeContinuousEffects();
    const ruleCheckPending =
      engine.effectResolutionDepth === 0 && engine.optionResolutionDepth === 0 && hasRuleProcessPending(engine)
        ? await collectRuleProcessPending(engine)
        : [];
    await withPendingPoolDrain(engine, wasOutermostWindow, () =>
      runTiming(
        timing,
        effectEnvironment(engine, trigger),
        resolutionDeps(
          engine,
          createResolutionCandidateReader({
            engine,
            scope: { kind: ResolutionCandidateKind.INSTANCES.value, instanceIds: [sourceInstanceId] },
          }),
          {
            outermost: wasOutermostWindow,
            extraPending: [...extraPending, ...ruleCheckPending],
            excludeNestedPending: excludedNestedPending,
          },
        ),
      ),
    );
    if (wasOutermostWindow) {
      await flushDeferredTimingWindows(engine);
      await flushDeferredSecurityRemovalTriggers(engine);
    }
    await engine.recomputeContinuousEffects();
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}

/**
 * Fire `timing` scoped to a single permanent (its top card plus its digivolution-stack
 * and linked cards). The [When Digivolving] / [When Attacking] windows are the
 * permanent's OWN timing — they must NOT collect the same timing from OTHER permanents
 * on the board. Cross-permanent reactions ("when one of your Digimon digivolves")
 * go through `fireSubTrigger` watchers, not engine window.
 */
export async function fireTimingForPermanent(
  engine: GameEngine,
  timing: EffectTiming,
  permanent: Permanent,
  trigger: TriggerInfo = {},
  extraPending: readonly CollectedEffect[] = [],
  options: { continuousEffectsCurrent?: boolean } = {},
): Promise<void> {
  if (shouldDeferNestedTiming(engine)) {
    if (!options.continuousEffectsCurrent) await engine.recomputeContinuousEffects();
    const scoped: CardInstance[] = [];
    collectPermanentInstances(engine, permanent, scoped);
    deferNestedTimingEffects(engine, timing, trigger, scoped);
    return;
  }
  const wasOutermostWindow = beginResolvingWindow(engine);
  // A window opened between effects inside an enclosing one (an effect-ordered attack's Counter
  // Timing) must still pool what its own effects trigger: a Digimon that Blast Digivolve's
  // [When Digivolving] plays has its [On Play] parked in the nested pool, beside the watchers
  // that play armed. Only entries parked before this window opened belong to the parent.
  const excludedNestedPending =
    engine.effectResolutionDepth === 0 ? new Set(engine.pendingNestedTimingEffects) : undefined;
  // Freeze the subject instance set at window open. The resolver re-collects every pass
  // (to fold in effects that BECOME active during resolution), but a card that digivolves
  // onto engine permanent MID-WINDOW would otherwise be re-collected here and have its
  // WhenDigivolving fired a SECOND time — it already fired through the effect-driven entry
  // seam (`fireEnteredByEffect` -> `fireTimingForInstance`). Restricting the live re-collect
  // to instances present at open keeps genuine re-triggers on those same instances while
  // excluding a newly-arrived top card (a distinct instanceId).
  const subjectInstanceIds = new Set<string>();
  {
    const opening: CardInstance[] = [];
    collectPermanentInstances(engine, permanent, opening);
    for (const instance of opening) subjectInstanceIds.add(instance.instanceId);
  }
  try {
    if (!options.continuousEffectsCurrent) await engine.recomputeContinuousEffects();
    const ruleCheckPending =
      engine.effectResolutionDepth === 0 && engine.optionResolutionDepth === 0 && hasRuleProcessPending(engine)
        ? await collectRuleProcessPending(engine)
        : [];
    await withPendingPoolDrain(engine, wasOutermostWindow, () =>
      runTiming(
        timing,
        effectEnvironment(engine, trigger),
        resolutionDeps(
          engine,
          createResolutionCandidateReader({
            engine,
            permanent,
            scope: {
              kind: ResolutionCandidateKind.PERMANENT.value,
              permanentId: permanent.permanentId,
              instanceIds: [...subjectInstanceIds],
              resident: true,
            },
          }),
          {
            outermost: wasOutermostWindow,
            extraPending: [...extraPending, ...ruleCheckPending],
            excludeNestedPending: excludedNestedPending,
          },
        ),
      ),
    );
    if (wasOutermostWindow) {
      await flushDeferredTimingWindows(engine);
      await flushDeferredSecurityRemovalTriggers(engine);
    }
    await engine.recomputeContinuousEffects();
  } finally {
    endResolvingWindow(engine, wasOutermostWindow);
  }
}
