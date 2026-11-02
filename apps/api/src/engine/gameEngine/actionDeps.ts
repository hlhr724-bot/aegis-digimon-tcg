import { resumeMainPhaseInput } from "#api/engine/gameEngine/resumeMainPhaseInput";
import { createResolutionCandidateReader } from "#api/engine/effects/resolution/createResolutionCandidateReader";
import { trackResolutionDependencies } from "#api/engine/effects/resolution/trackResolutionDependencies";
import type { ResolutionDependencySnapshot } from "#api/engine/effects/resolution/ResolutionDependencySnapshot";
import {
  conditionalDigiXrosTrashAllowed,
  hasOtherDigiXrosPlayCosts,
  pendingDigiXrosSelfReduction,
  preparedDigiXrosMaterials,
} from "./timing/payCost.js";
import { EffectTiming, type CardDefinition, type CardInstance, type Permanent, type ServerEvent } from "@aegis/shared";
import { rollTurnActivity } from "../turnActivity.js";
import { lookupDefinition, definitionOf, isDigimon, intrinsicDigivolutionCostReduction } from "../cards/cardData.js";
import { type IntentRouterDeps } from "../intentRouter.js";
import { type ActivateEffectDeps } from "../actions/activateEffect.js";
import { matchingDnaDigivolveCost } from "../effects/primitives.js";
import { effectiveColors, effectiveKinds, effectiveNames } from "../effects/continuous.js";
import { effectiveDigivolutionBase } from "../effects/continuous/effective.js";
import { digisorptionAmountFor } from "../cards/digisorptionDigivolve.js";
import { type ResolutionDeps } from "../effects/index.js";
import { effectsOf } from "../effects/collect.js";
import {
  applyWouldDigivolveSelfReducer,
  wouldBePlayedSelfReducersFor,
  wouldDigivolveSelfReducersFor,
  potentialWouldDigivolveSelfReduction,
  hasBlastDigivolveKeyword,
  digiXrosOnlyNameAliasesFor,
  universalNameAliasesFor,
} from "../effects/interpreter.js";
import type { CollectedEffect } from "../effects/collect.js";
import { type TurnFlowHooks } from "../TurnStateMachine.js";
import { logError } from "../../logger.js";
import { type BreedingDeps } from "../actions/breeding.js";
import {
  memoryDepsFromGauge,
  type DigivolveDeps,
  type PlayCardDeps,
  type DigiXrosDeps,
  type AssemblyDeps,
  type AttackDeps,
  type BlockDeps,
  type CombatDecisionDeps,
  type LinkCardDeps,
  type DnaDigivolveDeps,
  type RespondCounterDeps,
} from "../actions/index.js";
import { linkHostOf, linkRequirementSatisfied } from "./boardQueries.js";
import { digivolvedFromTamerBase } from "./subTriggerIdentity.js";
import type { GameEngine } from "../GameEngine.js";
import { applyIntent, checkTurnEndAfterVerb, findInstance, findLooseInstance } from "./intents.js";
import {
  breedingPlayCostEffects,
  crossPermanentPlayReducerWatchers,
  fireBeforeDigivolveCost,
  fireBeforePayCost,
  firePlayEntryWindows,
  drainPendingOptionEntryTriggers,
  drainActivatedCounterTriggers,
  fireTimingForPermanent,
  projectLooseUseCost,
  residentPlayCostEffects,
  wouldBePlayedRuleTrashMaterials,
} from "./timing.js";
import {
  prepareOptionUsed,
  nestedTriggerSourceStillResident,
  parkedEntryCollected,
  pendingWindowCollected,
  pendingWindowWatchersCollected,
  withPendingSubTriggers,
} from "./subTriggers.js";
import { collectRuleProcessPending, hasRuleProcessPending, nextPermanentId, ruleProcess } from "./ruleProcess.js";
import {
  beginResolvingWindow,
  collectDeferredTimingPending,
  endResolvingWindow,
  takeLeaveReplacementPending,
  withPendingPoolDrain,
} from "./windows.js";
import { buildEffectContext, cardSourceOf } from "./effectContext.js";
import { drawCards, runBreedingPhase, sweepDurations } from "./turnFlow.js";
import { effectiveColorsOf } from "./matchLifecycle.js";
import { minimumDeferredPlayCost } from "./timing/playAffordability.js";
import { holdCostTriggers } from "#api/engine/gameEngine/holdCostTriggers";
import { looseZoneOfInstance } from "../effects/verbs/looseInstances.js";

/**
 * Engine-side dependencies for the stack resolver. `listCandidate` defaults to the
 * full candidate-zone enumeration ({@link listCandidateInstances}); a caller may
 * narrow it (e.g. fireTimingForInstance scopes to the one played card). `ruleProcess`
 * is the state-based-action fixpoint ({@link ruleProcess}); the resolver calls it
 */
export function resolutionDeps(
  engine: GameEngine,
  listCandidate: () => readonly CardInstance[] = createResolutionCandidateReader({ engine }),
  opts: {
    outermost?: boolean;
    extraPending?: readonly CollectedEffect[];
    excludeNestedPending?: ReadonlySet<CollectedEffect>;
    /** Shared with specialized checkpoints that replace the ordinary collector. */
    reactionPending?: CollectedEffect[];
    runtimeState?: ResolutionDependencySnapshot;
  } = {},
): ResolutionDeps {
  const runtimeState: ResolutionDependencySnapshot = opts.runtimeState ?? {
    turnSeat: engine.state.turnSeat,
    listCandidate,
    outermost: opts.outermost,
    extraPending: opts.extraPending,
    excludeNestedPending: opts.excludeNestedPending,
    excludedWindowWatchers: new Set(engine.pendingWindowSubTriggers),
    derivedPending: opts.reactionPending ?? [],
    announced: new Set(),
  };
  const excludeNestedPending = runtimeState.excludeNestedPending;
  const excludedWindowWatchers = runtimeState.excludedWindowWatchers;
  const derivedPending = runtimeState.derivedPending;
  // A single OPT watcher can be published through both the event bus and deletion pool.
  // Preserve distinct non-OPT occurrences; only duplicate OPT identities are collapsed.
  const uniquePending = (items: readonly CollectedEffect[]): CollectedEffect[] => {
    const unique = new Map<string, CollectedEffect>();
    for (const item of items) {
      const key = item.effect.effectKey.startsWith("subtrigger/opt/")
        ? `${item.source.instanceId} ${item.effect.effectKey} ${item.triggerOccurrence ?? item.watcherEventIdentity ?? ""}`
        : String(unique.size);
      if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
  };
  // Everything a used Option's [Main] body triggers waits until the Option is trashed or Arts
  // Digivolved (Q2577, Q6215). Its watchers then join the Arts [When Digivolving] pool, so the
  // turn player resolves first; without Arts they drain when the Option finishes.
  const pendingWhileOptionResolves = (): CollectedEffect[] =>
    engine.optionMainDepth > 0 ? [] : pendingWindowWatchersCollected(engine);
  const announced = runtimeState.announced;
  const dependencies: ResolutionDeps = {
    registerPendingEffects: (read) => {
      engine.pendingEffectReaders.add(read);
      return () => {
        engine.pendingEffectReaders.delete(read);
      };
    },
    // The outermost loop settles deferred queues between effects. A nested resolver normally
    // cannot reach into the enclosing pool while its card body is still running; a settlement
    // window that starts at effect depth zero may opt into only entries added after its opening
    // snapshot, leaving the parent's older pending group to the outermost resolver.
    ...(runtimeState.outermost === true
      ? {
          collectPending: () =>
            uniquePending([
              ...(engine.optionResolutionDepth > 0 ? pendingWhileOptionResolves() : pendingWindowCollected(engine)),
              ...(runtimeState.extraPending ?? []),
              ...derivedPending,
            ]),
        }
      : {
          collectPending: () =>
            uniquePending([
              ...(excludeNestedPending === undefined
                ? []
                : engine.optionResolutionDepth > 0
                  ? pendingWhileOptionResolves()
                  : engine.pendingNestedTimingEffects.filter(
                      (pending) =>
                        !excludeNestedPending.has(pending) && nestedTriggerSourceStillResident(engine, pending),
                    )),
              ...(excludeNestedPending !== undefined && engine.optionResolutionDepth === 0
                ? pendingWindowWatchersCollected(engine, excludedWindowWatchers)
                : []),
              ...(engine.optionResolutionDepth > 0 ? [] : parkedEntryCollected(engine)),
              ...(runtimeState.extraPending ?? []),
              ...derivedPending,
            ]),
        }),
    betweenEffects: async () => {
      derivedPending.push(...collectDeferredTimingPending(engine));
      // The window only rebuilds statics when it opens. A condition an earlier effect
      // changed (memory for BT17-016's immunity, Q2746) must be current for the next one.
      await engine.recomputeContinuousEffects();
    },
    turnSeat: runtimeState.turnSeat,
    listCandidateInstances: runtimeState.listCandidate,
    ruleProcess: async () => {
      if (engine.optionMainDepth > 0 || engine.effectResolutionDepth > 0) return;
      if (engine.ruleChecks.anyZeroDpDigimon()) {
        await engine.recomputeContinuousEffects();
      }
      derivedPending.push(...(await collectRuleProcessPending(engine)));
    },
    isGameOver: () => engine.state.gameOver,
    chooseOrder: (seat, active, timing, plan, waiting) =>
      engine.resolverDecisions.chooseOrder(seat, active, timing, plan, waiting),
    askOptional: (seat, collected, plan) => engine.resolverDecisions.askOptional(seat, collected, plan),
    onResolving: (_timing, collected) => {
      const reactionIndex = derivedPending.indexOf(collected);
      if (reactionIndex >= 0) derivedPending.splice(reactionIndex, 1);
      // A deferred trigger belongs to its original event, not every nested resolver that
      // can see engine pending pool. Retire it before its body can open another window.
      engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter((pending) => pending !== collected);
    },
    onActivating: (timing, collected) => {
      if (collected.effect.announce?.() === false) return;
      const stableOptWatcher = collected.effect.effectKey.startsWith("subtrigger/opt/");
      const announcementKey = `${engine.state.turnCount}:${collected.effect.effectKey}`;
      if (stableOptWatcher && engine.announcedSubTriggerEffectKeys.has(announcementKey)) return;
      if (stableOptWatcher) engine.announcedSubTriggerEffectKeys.add(announcementKey);
      announced.add(collected);
      engine.hooks.emit({
        kind: "effectTriggered",
        seat: collected.source.ownerSeat,
        sourceCardId: collected.source.cardId,
        sourceInstanceId: collected.source.instanceId,
        sourcePermanentId: collected.conferredToPermanentId ?? collected.source.permanent()?.permanentId,
        effectKey: collected.effect.effectKey,
        description: collected.effect.description,
        timing: collected.timingLabel ?? EffectTiming[collected.timing ?? timing],
        ...(collected.printedTiming !== undefined || collected.effect.irTrigger !== undefined
          ? { printedTiming: collected.printedTiming ?? collected.effect.irTrigger }
          : {}),
        ...(collected.effect.isInherited ? { isInherited: true } : {}),
        // `securityChecked` closes the check AFTER these effects have resolved, so the
        // client needs engine to hold the announcement until the reveal has been shown.
        ...(engine.securityCheckDepth > 0 ? { duringSecurityCheck: true } : {}),
      });
    },
    onWithoutLegalOutcome: (timing, collected) => {
      engine.hooks.emit({
        kind: "effectHadNoEffect",
        seat: collected.source.ownerSeat,
        sourceCardId: collected.source.cardId,
        sourceInstanceId: collected.source.instanceId,
        sourcePermanentId: collected.conferredToPermanentId ?? collected.source.permanent()?.permanentId,
        effectKey: collected.effect.effectKey,
        description: collected.effect.description,
        timing: collected.timingLabel ?? EffectTiming[collected.timing ?? timing],
        ...(collected.effect.isInherited ? { isInherited: true } : {}),
      });
    },
    onResolved: (timing, collected) => {
      if (!announced.delete(collected)) return;
      engine.hooks.emit({
        kind: "effectResolved",
        seat: collected.source.ownerSeat,
        sourceCardId: collected.source.cardId,
        sourceInstanceId: collected.source.instanceId,
        sourcePermanentId: collected.conferredToPermanentId ?? collected.source.permanent()?.permanentId,
        effectKey: collected.effect.effectKey,
        description: collected.effect.description,
        timing: collected.timingLabel ?? EffectTiming[collected.timing ?? timing],
        ...(collected.effect.isInherited ? { isInherited: true } : {}),
      });
    },
  };
  trackResolutionDependencies({ engine, dependencies, state: runtimeState });
  return dependencies;
}

/** Dependencies the breeding verbs need (subsystem: deck-and-setup / breeding). */
export function breedingDeps(engine: GameEngine): BreedingDeps {
  return {
    nextPermanentId: () => nextPermanentId(engine),
    // Seat-level "your opponent can't move <X>" prohibition (RestrictPlay). Moving out of
    // the breeding area is the moving seat's own action (KB EX7-014 Q3835/Q6509).
    moveProhibited: (_state, seat, definition) => engine.continuous.isPlayBlocked(seat, definition, "move"),
    emit: (event) => engine.hooks.emit(event as ServerEvent),
  };
}

/**
 * Assemble the side-effect dependencies the digivolve action needs (subsystem:
 * digivolve). Memory math is delegated to the shared MemoryGauge (its single
 * owner); draw uses the interim draw primitive; the When Digivolving timing is
 * fired through the effect stack; narration is forwarded to the room.
 */
export function digivolveDeps(engine: GameEngine): DigivolveDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  return {
    maxAffordable: mem.maxAffordable,
    payMemory: mem.payMemory,
    recomputeDP: (state, permanentId) => engine.modifiers.recomputeDP(state, permanentId),
    reanchorGrantedEffects: (priorTopInstanceId, newTopInstanceId) =>
      engine.continuous.reanchorCustomEffectGrants(priorTopInstanceId, newTopInstanceId),
    // Apply active continuous digivolution-cost modifiers (changeEvoCost) to the
    // printed evolve cost: a `fixed` adjustment sets an absolute cost, otherwise the
    // delta sums; floored at 0 (Official Rule Manual: a cost can't go below 0).
    adjustedDigivolveCost: (_state, target, base, into, opts) => {
      const reductionsBlocked = engine.continuous.blocksCostReduction(target.controllerSeat, "digivolve");
      let cost = base;
      const intrinsicAlreadyApplied = engine.modifiers.hasIntrinsicEvoCostAdjustment(target, into);
      const adj = engine.modifiers.evoCostFor(target, into, opts);
      if (adj !== undefined) {
        cost = "fixed" in adj ? adj.fixed : cost + adj.delta;
      }
      const replReduction = engine.subTriggers.costReductionFor("wouldDigivolve", target, into, {
        consume: opts?.consumeOnce === true,
        hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
        markFired: (key) => engine.tracker.register(key, "replacement"),
      });
      // The shared intrinsic projection is a fallback, not a second copy of a live IR reduction.
      const intrinsicReduction = intrinsicAlreadyApplied ? 0 : intrinsicDigivolutionCostReduction(into, target);
      return Math.max(0, cost - (reductionsBlocked ? 0 : replReduction + intrinsicReduction));
    },
    deferAffordabilityForWouldDigivolve: (_state, _seat, target, into) => {
      for (const replacement of engine.subTriggers.replacementsFor("wouldDigivolve")) {
        if (replacement.mode !== "instead" || replacement.sourcePermanentId === undefined) continue;
        const sourcePermanent = engine.access.permanentById(replacement.sourcePermanentId);
        if (sourcePermanent?.topCard === undefined) continue;
        const ctx = buildEffectContext(engine, cardSourceOf(engine, sourcePermanent.topCard), {
          subjectPermanentId: target.permanentId,
          digivolvingIntoCardId: into.cardId,
        });
        if (replacement.appliesTo !== undefined && !replacement.appliesTo(ctx, target.permanentId)) continue;
        return true;
      }
      return false;
    },
    prepareDigivolveCost: (_state, _seat, target, evolving) => fireBeforeDigivolveCost(engine, evolving, target),
    holdCostTriggers: () => holdCostTriggers(engine),
    potentialInteractiveDigivolveReduction: (state, seat, target, into, baseAsDigimon) => {
      if (engine.continuous.blocksCostReduction(seat, "digivolve")) return 0;
      const liveReduction = engine.subTriggers.potentialInteractiveReductionFor(
        "wouldDigivolve",
        seat,
        target,
        into,
        {
          hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
          markFired: (key) => engine.tracker.register(key, "replacement"),
        },
        "hand",
        baseAsDigimon,
      );
      const evolving = state.players[seat]?.hand.find(({ cardId }) => cardId === into.cardId);
      if (evolving === undefined) return liveReduction;
      const ctx = buildEffectContext(engine, cardSourceOf(engine, evolving), {});
      const intrinsicReduction = wouldDigivolveSelfReducersFor(into.cardId).reduce(
        (total, reducer) => total + potentialWouldDigivolveSelfReduction(ctx, reducer, target),
        0,
      );
      return liveReduction + intrinsicReduction;
    },
    activateInteractiveDigivolveReduction: async (_state, seat, target, into, evolvingInstanceId, baseAsDigimon) => {
      if (engine.continuous.blocksCostReduction(seat, "digivolve")) return 0;
      const liveReduction = await engine.subTriggers.activateInteractiveReductionsFor(
        "wouldDigivolve",
        seat,
        target,
        into,
        evolvingInstanceId,
        (sourcePermanentId, sourceInstanceId) => {
          const source = engine.access.permanentById(sourcePermanentId);
          return source?.topCard === undefined
            ? undefined
            : buildEffectContext(
                engine,
                cardSourceOf(engine, findInstance(engine, sourceInstanceId ?? "")?.instance ?? source.topCard),
                {},
              );
        },
        {
          hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
          markFired: (key) => engine.tracker.register(key, "replacement"),
        },
        undefined,
        looseZoneOfInstance(engine.state, evolvingInstanceId),
        baseAsDigimon,
      );
      const evolving = findLooseInstance(engine, evolvingInstanceId);
      if (evolving === undefined) return liveReduction;
      const ctx = buildEffectContext(engine, cardSourceOf(engine, evolving), {});
      ctx.activeTiming = "Static";
      ctx.activeEffectText = ctx.source.definition.effectText;
      let intrinsicReduction = 0;
      for (const reducer of wouldDigivolveSelfReducersFor(into.cardId)) {
        intrinsicReduction += await applyWouldDigivolveSelfReducer(ctx, reducer, target);
      }
      return liveReduction + intrinsicReduction;
    },
    // A DUAL card's color waiver belongs to its Option use requirement (rule 16-42).
    // It cannot waive the Digimon side's printed digivolution colors.
    // Color-requirement waiver at the digivolve site (WaiveColorRequirement, LOCKED Q3):
    // when the evolving instance is waived, the EvoCost is matched on level alone. This is
    // the consuming read of the color-waiver store on the digivolve path. BUT while a
    // "players can't ignore digivolution requirements" rule (BT8-059) is active for the
    // digivolving seat, ignoring the color requirement is itself an ignored requirement
    // (KB Q1741: "players can't ignore part of the digivolution requirements such as
    // levels") — so the waiver is suppressed and the color test is re-enforced. This is the
    // consuming read of `cannotIgnoreDigivolution` (WR-01).
    colorWaived: (state, instance) =>
      definitionOf(instance.cardId).isDualCard !== true &&
      engine.continuous.hasColorWaiver(instance.instanceId) &&
      !engine.continuous.cannotIgnoreDigivolution(state.turnSeat),
    // The base permanent's effective colors (printed ∪ continuously-derived) gate the
    // EvoCost color test (static-continuous-effects, LOCKED Q4 — KB BT3-040 Q1075). The
    // continuous tier is recomputed before each fired timing, so the store is current.
    derivedBaseColors: (_state, permanent) => effectiveColorsOf(engine, permanent),
    grantedBaseExactNames: (_state, permanent) => engine.continuous.grantedExactNames(permanent.permanentId),
    effectiveBaseDefinition: (_state, permanent) =>
      effectiveDigivolutionBase(engine.continuous, permanent, definitionOf(permanent.topCard)),
    effectiveBaseKinds: (_state, permanent) =>
      effectiveKinds(engine.continuous, permanent.permanentId, definitionOf(permanent.topCard)?.kinds ?? []),
    // Positive "can only digivolve into [X]" constraint (EX10-035 digivolveExceptInto): consult
    // the continuous ledger with the evolving card's definition; reject a non-matching target.
    digivolveIntoAllowed: (_state, permanent, evolving) =>
      engine.continuous.digivolveIntoAllowed(
        permanent.permanentId,
        lookupDefinition(evolving.cardId) ?? cardSourceOf(engine, evolving).definition,
      ),
    // consuming read of the digivolve-restriction store at the digivolve site.
    digivolveBaseRestricted: (_state, permanent, evolving) => {
      if (engine.continuous.hasRestriction(permanent.permanentId, "digivolve")) return true;
      const evolvingDefinition = lookupDefinition(evolving.cardId) ?? cardSourceOf(engine, evolving).definition;
      if (
        evolvingDefinition.level === 7 &&
        engine.continuous.hasRestriction(permanent.permanentId, "digivolveToLevel7")
      ) {
        return true;
      }
      if (permanent.isSuspended) return false;
      if (!engine.continuous.isUnsuspendedDigivolveProhibited(permanent.controllerSeat)) return false;
      const base = permanent.topCard === undefined ? undefined : definitionOf(permanent.topCard.cardId);
      return base !== undefined && isDigimon(base);
    },
    digivolveLockedAsDigimon: (_state, permanent, asDigimon) =>
      engine.continuous.isDigivolveLockedAsDigimon(permanent.permanentId, asDigimon) ||
      (!permanent.isSuspended && engine.continuous.isUnsuspendedDigivolveProhibited(permanent.controllerSeat)),
    // Alternate-requirement non-memory placement cost (BT7-112): availability gate + payment.
    // Generic over `placementCost` (kind ∈ kinds OR trait ∈ traits, across hand/trash).
    alternatePlacementPayable: (_state, seat, requirement) =>
      engine.digivolveSupport.placementCostCards(seat, requirement).length >= (requirement.placementCost?.count ?? 0),
    payAlternatePlacement: async (_state, seat, requirement, evolving) => {
      const need = requirement.placementCost?.count ?? 0;
      const candidates = engine.digivolveSupport
        .placementCostCards(seat, requirement)
        .filter((c) => c.instanceId !== evolving.instanceId);
      if (candidates.length < need) return false;
      // KB BT7-112 Q1691: the player chooses WHICH matching cards to place; the selection
      // order is the bottom-of-deck order ("in any order").
      const ctx = buildEffectContext(engine, cardSourceOf(engine, evolving), {});
      const chosen = await engine.decisionApi.selectCards(ctx, {
        candidates: candidates.map((c) => c.instanceId),
        min: need,
        max: need,
      });
      // Empty/short response (decision timeout safe-default): fall back to the deterministic
      // hand-then-trash pick — payment is mandatory once the alternate path was chosen (Q1681).
      const ids = chosen.length === need ? chosen : candidates.slice(0, need).map((c) => c.instanceId);
      // KB BT7-112 Q1691: the returned cards are revealed to the opponent before they go under the deck.
      const returned = ids.flatMap((id) => candidates.filter((c) => c.instanceId === id));
      for (const card of returned) {
        engine.hooks.emit({
          kind: "cardRevealed",
          seat,
          cardId: card.cardId,
          ...(card.artId ? { artId: card.artId } : {}),
          sourceCardId: evolving.cardId,
        });
      }
      await engine.primitives.returnToDeck(ids, { toTop: false });
      return true;
    },
    // Burst Digivolve's non-memory Tamer-return cost (§8-3-3-2): availability gate + payment.
    burstDigivolveTamerPayable: (_state, seat, requirement) =>
      engine.digivolveSupport.burstDigivolveTamerCandidates(seat, requirement).length > 0,
    payBurstDigivolveTamer: (_state, seat, requirement, evolving) =>
      engine.digivolveSupport.payBurstDigivolveTamer(seat, requirement, evolving),
    // ＜Digisorption -N＞ availability for the affordability gate (Comprehensive Rules §16-10):
    // N when the card being digivolved into has ＜Digisorption＞ AND at least one Digimon is
    // suspendable to pay it (the controller's own, or — while an eligible BT3-056 redirector is
    // on the controller's battle area engine turn — an opponent's). Pure read; no prompt/suspend.
    digisorptionReduction: (_state, seat, intoCardId) => {
      if (engine.continuous.blocksCostReduction(seat, "digivolve")) return 0;
      const amount = digisorptionAmountFor(intoCardId);
      if (amount === undefined) return 0;
      return engine.digivolveSupport.digisorptionSuspendCandidates(seat).length >= 1 ? amount : 0;
    },
    payDigisorption: (_state, seat, into, target) => engine.digivolveSupport.payDigisorption(seat, into, target),
    fireWouldDigivolve: async (_state, _seat, target, into) => {
      // A would-digivolve watcher may be anchored to another permanent (EX2-056 Takato)
      // while applying to the Digimon that declared the evolution. Gather the whole event
      // window and let each replacement's `appliesTo` predicate gate the target.
      const replacements = engine.subTriggers.replacementsFor("wouldDigivolve");
      for (const replacement of replacements) {
        if (replacement.mode !== "instead" || replacement.sourcePermanentId === undefined) continue;
        const sourcePermanent = engine.access.permanentById(replacement.sourcePermanentId);
        if (sourcePermanent?.topCard === undefined) continue;
        const ctx = buildEffectContext(engine, cardSourceOf(engine, sourcePermanent.topCard), {
          subjectPermanentId: target.permanentId,
          digivolvingIntoCardId: into.cardId,
        });
        if (replacement.appliesTo && !replacement.appliesTo(ctx, target.permanentId)) continue;
        await replacement.apply(ctx);
      }
    },
    // Base-granted digivolve path (ST7-03/BT6-060): the base permanent's static grant lets engine
    // specific evolving card digivolve onto it, ignoring color/level, when active (battle area,
    // the grant's allowed turns and its printed condition when present).
    baseGrantedDigivolve: (_state, seat, base, evolving, sourceZone) =>
      engine.digivolveSupport.matchBaseGrantedDigivolve(seat, base, evolving, sourceZone),
    // ＜Blast Digivolve＞/＜Blast DNA Digivolve＞ (§16-26-1/§16-31-1): the evolving hand card's
    // own printed keyword, read from the compiled-IR side registry (registerIrCard populates it
    // via registerBlastDigivolveFromEffects) since the card is in hand, not a live permanent.
    costWaived: (_state, instance) => hasBlastDigivolveKeyword(instance.cardId),
    blastWindowAllowed: (_state, seat) =>
      engine.combat.hasOpenCounterWindow && engine.combat.counterWindowSeat === seat,
    draw: async (_state, seat, count) => {
      engine.drawingDigivolutionBonus = true;
      try {
        return await drawCards(engine, seat, count);
      } finally {
        engine.drawingDigivolutionBonus = false;
      }
    },
    fireWhenDigivolving: async (_state, seat, permanent, previousLevel, baseWasDigimon, isDnaDigivolve) => {
      // Turn-scoped fact consumed by inherited effects such as BT1-007. Register before
      // firing When Digivolving so effects in that window can observe the completed evolution.
      // Effects do not inspect the breeding area unless their text explicitly says so (BT1-007
      // Q870), therefore a breeding-area evolution must not set engine battle-area fact.
      if (!permanent.inBreeding) {
        engine.tracker.register(`seat:${seat}`, "digivolvedThisTurn");
      }
      // Scope [When Digivolving] to the permanent that just digivolved (its top card
      // plus inherited stack effects). A global fire would also collect and resolve
      // every OTHER permanent's [When Digivolving] effect — including the opponent's
      // — because those effects rely on the engine (not a per-card owner's-turn guard)
      // to be scoped to the digivolving card.
      // One digivolution, one set of simultaneous triggers: the evolving card's own
      // [When Digivolving], the board-wide enter-field window, and every "when your Digimon
      // digivolves" watcher. They reach the resolver as ONE pool, so the controller orders
      // all of them in a single prompt — Destromon's own [When Digivolving] against the two
      // Xeno EX11-066 watchers, for example — instead of the printed effects always
      // resolving before the watchers.
      // Q6671/Q6708: a Tamer base digivolves as a Tamer, not as a Digimon. The watcher events
      // still fire — "when one of your Tamers digivolves" (BT7-081) and "when your Digimon or
      // Tamers digivolve" (BT18-010) are real triggers — but the payload is tagged so the
      // SubTrigger gate withholds plain "when a Digimon digivolves" watchers. The caller's
      // report reads EFFECTIVE kinds, so a Tamer currently treated as a Digimon is not tagged
      // and keeps every watcher; a Digi-Egg base is not a Tamer and is never tagged.
      const fromTamer = digivolvedFromTamerBase(permanent);
      const tamerDigivolved = fromTamer && baseWasDigimon !== true;
      const digivolveTrigger = {
        subjectPermanentId: permanent.permanentId,
        digivolvedInstanceId: permanent.topCard.instanceId,
        previousDigivolutionLevel: previousLevel,
        ...(isDnaDigivolve === true ? { isDnaDigivolve: true } : {}),
        ...(fromTamer ? { digivolvedFromTamer: true } : {}),
        ...(tamerDigivolved ? { tamerDigivolved: true } : {}),
      };
      // The completed evolution can install watchers on its new top card, and the board
      // may have been seeded since the last continuous pass. Refresh before fixing the
      // event's watcher pool; the timing window's later refresh is too late for it.
      await engine.recomputeContinuousEffects();
      await withPendingSubTriggers(
        engine,
        ["whenOneOfYoursDigivolves", "whenAnyDigivolves"],
        { ...digivolveTrigger, digivolvedSubject: permanent.clone() },
        async () => {
          // Scope [When Digivolving] to the permanent that just digivolved (its top card
          // plus inherited stack effects). A global fire would also collect and resolve
          // every OTHER permanent's [When Digivolving] effect — including the opponent's
          // — because those effects rely on the engine (not a per-card owner's-turn guard)
          // to be scoped to the digivolving card.
          await fireTimingForPermanent(engine, EffectTiming.WhenDigivolving, permanent, digivolveTrigger, [], {
            continuousEffectsCurrent: true,
          });
          // Thread the digivolving permanent as the trigger subject (documented behavior: the
          // enter-field hashtable carries the entered permanent). An OnEnterFieldAnyone effect
          // that targets "the Digimon that digivolved" (BT19-080) reads
          // ctx.trigger.subjectPermanentId; it was previously undefined here, leaving such
          // effects silently inert.
          await engine.fireTiming(EffectTiming.OnEnterFieldAnyone, {
            ...digivolveTrigger,
            entryCause: "digivolve",
          });
          await engine.fireSubTrigger("onEnterFieldAnyone", {
            ...digivolveTrigger,
            entryCause: "digivolve",
          });
        },
        // A watcher played or gained while [When Digivolving] resolves did not exist
        // when this evolution happened. Keep the trigger-time pool simultaneous.
        // Rule processing defers watchers through fireSubTrigger rather than this pool.
        { onlyInitiallyArmed: !engine.ruleProcessing },
      );
    },
    emit: (event) => engine.hooks.emit(event as ServerEvent),
  };
}

async function placePendingReducerCards(
  engine: GameEngine,
  playedInstanceId: string,
  permanentId: string,
): Promise<void> {
  const ids = engine.pendingPlayReducerPlacements.get(playedInstanceId);
  if (ids === undefined || ids.length === 0) return;
  engine.pendingPlayReducerPlacements.delete(playedInstanceId);
  await engine.primitives.placeUnder(permanentId, ids);
}

/**
 * Assemble the side-effect dependencies the play-card action needs (subsystem:
 * play-card). Memory math is delegated to the shared MemoryGauge (its single
 * owner, identical binding to digivolve); the On Play / option timing is fired
 * through the effect stack scoped to the played instance; permanent ids come from
 * the engine's allocator; narration is forwarded to the room.
 */
export function playCardDeps(engine: GameEngine): PlayCardDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  return {
    maxAffordable: mem.maxAffordable,
    minimumDeferredPlayCost: (instance, baseCost) => minimumDeferredPlayCost(engine, instance, baseCost),
    payMemory: mem.payMemory,
    // Apply active continuous play-cost modifiers (CostModifier play/use forms) to the
    // printed cost. The recompute runs before each fired timing, so the store is
    // current when a play is validated. `controllerSeat` is the seat paying.
    adjustedPlayCost: (_state, seat, definition, base) =>
      engine.modifiers.playCostFor({ def: definition, controllerSeat: seat }, base),
    optionUseCost: (_state, seat, instance, passiveCost) =>
      projectLooseUseCost(engine, instance.instanceId, seat) ?? passiveCost,
    // Seat-level "your opponent can't play <X>" prohibition (RestrictPlay). A manual play
    // is the playing seat's own action, so the prohibition on that seat applies.
    playProhibited: (_state, seat, definition) => engine.continuous.isPlayBlocked(seat, definition, "play"),
    // MINIMAL color-requirement legality gate (CONTEXT.md LOCKED Q3): the printed color
    // requirement must overlap the seat's available colors, UNLESS WaiveColorRequirement
    // has waived engine instance — `continuous.hasColorWaiver` is the consuming read that
    // makes the waiver observable. Deliberately not the full color subsystem (Phase 4).
    colorRequirementMet: (_state, seat, instance, definition, mode) =>
      engine.continuous.hasColorWaiver(instance.instanceId) ||
      engine.digivolveSupport.printedColorRequirementMet(
        seat,
        definition,
        mode,
        engine.continuous.colorRequirementAlternatives(instance.instanceId),
      ),
    nextPermanentId: () => nextPermanentId(engine),
    recomputeDP: (permanentId) => engine.modifiers.recomputeDP(engine.state, permanentId),
    // Pay-time interactive cost reduction (BeforePayCost): fire the played card's BeforePayCost
    // window (where a ReducePlayCost action runs its optional server-side payment) and return the
    // finalized cost. Runs in the async apply path BEFORE memory is paid (EX9-043 / BT25-076).
    finalizePlayCost: async (_state, _seat, instance, _definition, baseCost, mode) =>
      fireBeforePayCost(engine, instance, baseCost, mode === "option", "hand"),
    // Synchronous fast-path gate: only cards with a BeforePayCost effect take the async
    // finalization path. Every other card keeps same-microtask placement (no timing change).
    holdCostTriggers: () => holdCostTriggers(engine),
    hasBeforePayCost: (instance) =>
      effectsOf(EffectTiming.BeforePayCost, cardSourceOf(engine, instance)).some(
        (effect) => effect.costWindow !== "digivolve",
      ) ||
      wouldBePlayedSelfReducersFor(instance.cardId).length > 0 ||
      breedingPlayCostEffects(engine, cardSourceOf(engine, instance).ownerSeat).length > 0 ||
      crossPermanentPlayReducerWatchers(engine, instance, cardSourceOf(engine, instance).ownerSeat).length > 0 ||
      residentPlayCostEffects(engine, cardSourceOf(engine, instance).ownerSeat).length > 0 ||
      engine.subTriggers.hasInteractiveReductionsFor("wouldBePlayed", cardSourceOf(engine, instance).ownerSeat) ||
      engine.subTriggers.hasPassiveReductionsFor("wouldBePlayed"),
    // After the played permanent is created (before On Play), place any cards a cross-permanent
    // reducer (BT10-093) committed under it, and relocate any whole permanent a SELF reducer's cost
    // body (BT12-112) selected to become one of its digivolution cards. No-op when nothing was
    // committed/selected for engine play.
    placePendingDigivolution: async (playedInstanceId, permanentId) => {
      engine.preparedDigiXrosCosts.delete(playedInstanceId);
      await placePendingReducerCards(engine, playedInstanceId, permanentId);
      const relocations = engine.pendingSelfReducerRelocations.get(playedInstanceId);
      if (relocations !== undefined && relocations.length > 0) {
        engine.pendingSelfReducerRelocations.delete(playedInstanceId);
        for (const relocation of relocations) {
          const opts = {
            belowTop: true,
            ...(relocation.shedOwnCards === true ? { shedOwnCards: true } : {}),
          };
          if (engine.primitives.relocatePermanentByEffect !== undefined) {
            await engine.primitives.relocatePermanentByEffect(permanentId, relocation.permanentId, opts);
          } else {
            engine.primitives.relocatePermanent(permanentId, relocation.permanentId, opts);
          }
        }
      }
    },
    fireTiming: async (_state, _seat, timing, sourceInstanceId) =>
      firePlayEntryWindows(engine, timing, sourceInstanceId),
    beginOptionResolution: () => {
      engine.optionResolutionDepth += 1;
      engine.optionMainDepth += 1;
    },
    finishOptionMain: () => {
      engine.optionMainDepth = Math.max(0, engine.optionMainDepth - 1);
    },
    finishOptionResolution: async () => {
      if (engine.optionResolutionDepth === 1) {
        // The completed Option creates one pending group: entry effects and the
        // rule-check reactions must compete under turn-player priority.
        const rulesChangedBoard = hasRuleProcessPending(engine);
        const rulePending = await collectRuleProcessPending(engine);
        engine.optionResolutionDepth = 0;
        await drainPendingOptionEntryTriggers(engine, [...rulePending, ...collectDeferredTimingPending(engine)]);
        if (rulesChangedBoard) await engine.recomputeContinuousEffects();
      } else {
        engine.optionResolutionDepth = Math.max(0, engine.optionResolutionDepth - 1);
      }
    },
    prepareOptionUsed: (usedInstanceId, usedOptionCost) => prepareOptionUsed(engine, usedInstanceId, usedOptionCost),
    fireOptionUsed: async (usedInstanceId, usedOptionCost) =>
      engine.primitives.fireOptionUsed(usedInstanceId, usedOptionCost),
    // CR §4-19 Arts Digivolve (Task 4): a rule on DUAL cards, not a per-card effect —
    // see `resolveArtsDigivolve` below for the eligibility + decision + commit steps.
    artsDigivolve: async (_state, seat, instance, definition) =>
      engine.digivolveSupport.resolveArtsDigivolve(seat, instance, definition),
    emit: (event) => engine.hooks.emit(event as ServerEvent),
  };
}

/**
 * Dependencies the attack verb needs (subsystem: attack-and-block). The shared
 * state-access layer and the single CombatController instance back it; a fatal
 * error from the async combat continuation is surfaced to the room as an
 * actionRejected entry rather than an unhandled rejection.
 */
export function attackDeps(engine: GameEngine): AttackDeps {
  return {
    state: engine.state,
    access: engine.access,
    combat: engine.combat,
    continuous: engine.continuous,
    onCombatComplete: () => checkTurnEndAfterVerb(engine),
    onCombatError: (err) => {
      logError("[engine] combat resolve failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "attack",
        reason: err instanceof Error ? err.message : "combat-error",
      });
      // A combat that died mid-resolution already released the controller's guards
      // (resolveAttack's finally), but it skipped onCombatComplete — and with it the
      // turn-end check. If an effect pushed memory across before the throw, no later
      // verb is legal to re-trigger that check, so the Main phase would hang open
      // until a manual endPhase (field bug: api.log 2026-08-20, BT21-021).
      engine.projection.syncAttackTargets();
      engine.projection.syncHandAffordances();
      checkTurnEndAfterVerb(engine);
    },
  };
}

/** Dependencies the block verbs need (subsystem: attack-and-block). */
export function blockDeps(engine: GameEngine): BlockDeps {
  return { state: engine.state, access: engine.access, combat: engine.combat, continuous: engine.continuous };
}

export function combatDecisionDeps(engine: GameEngine): CombatDecisionDeps {
  return { state: engine.state, access: engine.access, combat: engine.combat, continuous: engine.continuous };
}

/** Assemble the non-combat verb router's dependencies (subsystem: intent-protocol-and-room). */
export function intentRouterDeps(engine: GameEngine): IntentRouterDeps {
  return {
    state: engine.state,
    win: engine.win,
    decisions: engine.decisions,
    mainPhase: engine.mainPhase,
    markReady: (seat) => {
      engine.readySeats.add(seat);
      const bothReady = engine.readySeats.size >= 2;
      if (bothReady && !engine.bothReadyFired) {
        engine.bothReadyFired = true;
        engine.hooks.onBothReady?.();
      }
      return bothReady;
    },
  };
}

/** Dependencies the respondCounter verb needs (subsystem: attack-and-block). */
export function respondCounterDeps(engine: GameEngine): RespondCounterDeps {
  return {
    resolveInWindow: async (body) => {
      const wasOutermostWindow = beginResolvingWindow(engine);
      try {
        await engine.recomputeContinuousEffects();
        await withPendingPoolDrain(engine, wasOutermostWindow, async () => {
          await body();
          const rulePending = await collectRuleProcessPending(engine);
          await drainActivatedCounterTriggers(engine, [...rulePending, ...collectDeferredTimingPending(engine)]);
        });
      } finally {
        endResolvingWindow(engine, wasOutermostWindow);
      }
      await engine.recomputeContinuousEffects();
      await ruleProcess(engine);
    },
    combat: engine.combat,
    findInstance: (instanceId) => findInstance(engine, instanceId),
    cardSourceOf: (instance) => cardSourceOf(engine, instance),
    // A player-activated [Counter] ability has no incoming trigger payload (it is
    // not reacting to another event), so the TriggerInfo is empty — same as
    // activateEffectDeps.makeContext.
    makeContext: (source, effect) => engine.projection.activationContext({ source, effect }),
    tracker: engine.tracker,
  };
}

/** Dependencies the activateEffect verb needs (subsystem: intent-protocol-and-room). */
export function activateEffectDeps(engine: GameEngine): ActivateEffectDeps {
  return {
    findInstance: (instanceId) => findInstance(engine, instanceId),
    cardSourceOf: (instance) => cardSourceOf(engine, instance),
    activationEffectsFor: (instance) => engine.projection.activatableEffectsFor([instance]),
    // A directly-activated [Main] ability has no incoming trigger payload (it is
    // not reacting to another event), so the TriggerInfo is empty. It still carries
    // the named effect's provenance because every nested decision must render engine
    // exact [Main]/Delay clause rather than guessing from the card's first text box.
    makeContext: (source, effect, conferredToPermanentId, conferralGranterInstanceId) =>
      engine.projection.activationContext({
        source,
        effect,
        ...(conferredToPermanentId === undefined ? {} : { conferredToPermanentId }),
        ...(conferralGranterInstanceId === undefined ? {} : { conferralGranterInstanceId }),
      }),
    tracker: engine.tracker,
    announceActivation: (source, effect, ctx) => {
      const announced = {
        seat: source.ownerSeat,
        sourceCardId: source.cardId,
        sourceInstanceId: source.instanceId,
        sourcePermanentId: ctx.conferredToPermanentId ?? source.permanent()?.permanentId,
        effectKey: effect.effectKey,
        description: effect.description,
        timing: effect.irTrigger ?? "Main",
        ...(effect.isInherited ? { isInherited: true } : {}),
      };
      engine.hooks.emit({ kind: "effectTriggered", ...announced });
      return () =>
        engine.hooks.emit({
          kind: "effectResolved",
          ...announced,
          ...(ctx.digivolutionPerformed === undefined ? {} : { digivolutionPerformed: ctx.digivolutionPerformed }),
        });
    },
    enterEffectResolution: (seat, sourceKinds, sourcePermanentId) =>
      engine.primitives.enterEffectResolution?.(seat, sourceKinds, sourcePermanentId),
    leaveEffectResolution: () => engine.primitives.leaveEffectResolution?.(),
  };
}

/**
 * Side-effect dependencies for the DigiXros play subsystem. Memory math is the shared gauge
 * (identical to playCard / digivolve); placement and suspension are delegated to the canonical
 * primitives; On Play fires through the effect stack scoped to the played instance, plus the
 * board-wide OnEnterFieldAnyone / whenPlayed seams (mirroring playCardDeps.fireTiming).
 */
export function digiXrosDeps(engine: GameEngine): DigiXrosDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  const materialInterruptPending: CollectedEffect[] = [];
  return {
    maxAffordable: mem.maxAffordable,
    payMemory: mem.payMemory,
    adjustedPlayCost: (_state, seat, definition, base) =>
      engine.modifiers.playCostFor({ def: definition, controllerSeat: seat }, base),
    canReducePlayCost: (_state, seat) => !engine.continuous.blocksCostReduction(seat, "play"),
    finalizePlayCost: async (_state, _seat, instance, _definition, baseCost) =>
      fireBeforePayCost(engine, instance, baseCost, false, "hand"),
    digiXrosNamesOf: (instanceId) => {
      const located = findInstance(engine, instanceId);
      if (located === undefined) return [];
      const aliases = [
        ...universalNameAliasesFor(located.instance.cardId),
        ...digiXrosOnlyNameAliasesFor(located.instance.cardId),
      ];
      if (located.permanent === undefined) return aliases;
      return [
        ...new Set([
          ...aliases,
          ...engine.continuous.grantedNames(located.permanent.permanentId),
          ...engine.continuous.grantedDigiXrosNames(located.permanent.permanentId),
        ]),
      ];
    },
    canSubstituteMaterial: (permanentId) => engine.continuous.hasKeyword(permanentId, "DigiXrosSubstitute"),
    reservedMaterialInstanceIds: (instance) =>
      preparedDigiXrosMaterials(engine, instance.instanceId).reservedInstanceIds,
    conditionalTrashAllowed: (instance) => conditionalDigiXrosTrashAllowed(engine, instance),
    pendingSelfReduction: (instance) => pendingDigiXrosSelfReduction(engine, instance),
    hasBeforePayCost: (instance) => hasOtherDigiXrosPlayCosts(engine, instance),
    minimumDeferredPlayCost: (instance, baseCost) => minimumDeferredPlayCost(engine, instance, baseCost),
    ruleTrashMaterialCandidates: (playedInstance) => wouldBePlayedRuleTrashMaterials(engine, playedInstance),
    digiXrosExpandedZones: (seat, playedInstanceId) =>
      engine.primitives.digiXrosExpandedZones?.(seat, playedInstanceId) ?? [],
    digiXrosExpandedZoneCounts: (seat, playedInstanceId) =>
      engine.primitives.digiXrosExpandedZoneCounts?.(seat, playedInstanceId) ?? {},
    nextPermanentId: () => nextPermanentId(engine),
    placeMaterialsUnder: (targetPermanentId, instanceIds) =>
      engine.primitives.placePlayMaterialsUnder(targetPermanentId, instanceIds),
    placePendingReducerCards: (playedInstanceId, permanentId) =>
      placePendingReducerCards(engine, playedInstanceId, permanentId),
    placePendingDigivolution: playCardDeps(engine).placePendingDigivolution,
    relocatePermanent: (destPermanentId, sourcePermanentId, opts) =>
      engine.primitives.relocatePermanent(destPermanentId, sourcePermanentId, opts),
    interruptFieldMaterialLeave: async (fieldPermanentIds) => {
      // A DigiXros from a main phase action is not an effect (Q2352, Q4184), so "by effects"
      // clauses must not see these materials leave.
      const prevented = await engine.consultLeavePrevention(fieldPermanentIds, "byRule", undefined, {
        playerAction: true,
        isDigiXros: true,
        isBounce: true,
      });
      materialInterruptPending.push(...takeLeaveReplacementPending(engine));
      return prevented;
    },
    suspendPermanent: async (permanentId) => {
      await engine.primitives.suspend([permanentId]);
    },
    fireTiming: async (_state, _seat, timing, sourceInstanceId, materialCount) =>
      firePlayEntryWindows(
        engine,
        timing,
        sourceInstanceId,
        { digiXrosMaterialCount: materialCount },
        { procedurePending: materialInterruptPending.splice(0) },
      ),
    emit: (event) => engine.hooks.emit(event as ServerEvent),
  };
}

/**
 * Side-effect dependencies for the Assembly play subsystem (§7-3). Memory math is the shared
 * gauge (identical to playCard / DigiXros / digivolve); placement is delegated to the
 * `placePlayMaterialsUnder` primitive; On Play fires through the effect stack scoped to the played instance,
 * plus the board-wide OnEnterFieldAnyone / whenPlayed seams (mirroring digiXrosDeps.fireTiming).
 */
export function assemblyDeps(engine: GameEngine): AssemblyDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  const play = playCardDeps(engine);
  return {
    maxAffordable: mem.maxAffordable,
    payMemory: mem.payMemory,
    adjustedPlayCost: (_state, seat, definition, base) =>
      engine.modifiers.playCostFor({ def: definition, controllerSeat: seat }, base),
    canReducePlayCost: (_state, seat) => !engine.continuous.blocksCostReduction(seat, "play"),
    finalizePlayCost: play.finalizePlayCost,
    hasBeforePayCost: play.hasBeforePayCost,
    minimumDeferredPlayCost: play.minimumDeferredPlayCost,
    placePendingDigivolution: play.placePendingDigivolution,
    nextPermanentId: () => nextPermanentId(engine),
    placeMaterialsUnder: (targetPermanentId, instanceIds) =>
      engine.primitives.placePlayMaterialsUnder(targetPermanentId, instanceIds),
    fireTiming: async (_state, _seat, timing, sourceInstanceId) =>
      firePlayEntryWindows(engine, timing, sourceInstanceId),
    emit: (event) => engine.hooks.emit(event as ServerEvent),
  };
}

/**
 * Dependencies the linkCard verb needs (subsystem: link). The memory gauge is the
 * same seam digivolve uses; `linkRequirementSatisfied` reuses engine engine's own
 * §17-1-3-2-6/7 rule-check predicate so declaration-time legality and the ongoing
 * sweep can never disagree; `link` delegates the actual plug-in to the existing
 * Link primitive (effects/primitives.ts).
 */
export function linkCardDeps(engine: GameEngine): LinkCardDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  return {
    maxAffordable: mem.maxAffordable,
    payMemory: mem.payMemory,
    linkRequirementSatisfied: (host, linkedCard) => {
      const linkHost = linkHostOf(engine.continuous, host);
      return linkHost !== undefined && linkRequirementSatisfied(linkHost, linkedCard);
    },
    linkCostReduction: (targetPermanentId, traits) =>
      engine.continuous.linkCostReductionGrant(
        targetPermanentId,
        traits,
        (key) => engine.tracker.count(`link-cost/${key}`, "replacement") > 0,
      )?.amount ?? 0,
    resolveLinkCostReduction: async (targetPermanentId, traits) => {
      const grant = engine.continuous.linkCostReductionGrant(
        targetPermanentId,
        traits,
        (key) => engine.tracker.count(`link-cost/${key}`, "replacement") > 0,
      );
      if (grant === undefined) return 0;
      if (grant.optional === true) {
        const response = await engine.decisions.request({
          seat: grant.controllerSeat ?? engine.state.turnSeat,
          kind: "optional",
          promptText: `Reduce engine Link cost by ${grant.amount}?`,
          sourceCardId: grant.sourceCardId,
          sourceInstanceId: grant.sourceInstanceId,
          sourcePermanentId: grant.permanentId,
        });
        if (response.kind !== "optional" || !response.accept) return 0;
      }
      if (grant.oncePerTurnKey !== undefined) {
        engine.tracker.register(`link-cost/${grant.oncePerTurnKey}`, "replacement");
      }
      return grant.amount;
    },
    canLeaveBattleArea: (permanentId) =>
      !engine.continuous.hasRestriction(permanentId, "leaveBattleAreaExceptByDeletion"),
    link: (targetPermanentId, instanceIds) => engine.primitives.link(targetPermanentId, instanceIds),
    ruleProcess: () => ruleProcess(engine),
  };
}

/** A field DNA material as its current colors, DNA level and names present it (CR 8-2). */
export function effectiveDnaMaterialDefinition(
  engine: GameEngine,
  material: Permanent,
  result: CardDefinition,
): CardDefinition {
  const printed = lookupDefinition(material.topCard!.cardId)!;
  const effectiveLevel = engine.continuous.dnaLevelFor(material.permanentId, result);
  const names = effectiveNames(engine.continuous, material, printed.nameEn ?? printed.cardId);
  return {
    ...printed,
    colors: effectiveColors(engine.continuous, material.permanentId, printed.colors) as typeof printed.colors,
    ...(effectiveLevel === undefined ? {} : { level: effectiveLevel }),
    nameEn: names.join(" | "),
  };
}

/** Main DNA requires printed DNA requirements; effect-driven DNA keeps its separate cost rules. */
export function dnaDigivolveDeps(engine: GameEngine): DnaDigivolveDeps {
  const mem = memoryDepsFromGauge(engine.memory);
  return {
    maxAffordable: mem.maxAffordable,
    matchingCost: (definition, materials) => matchingDnaDigivolveCost(definition, materials),
    effectiveMaterialDefinitions: (_state, materials, definition) =>
      materials.map((material) => effectiveDnaMaterialDefinition(engine, material, definition)),
    adjustedCost: (_state, materials, definition, printedCost) => {
      let cost = printedCost;
      const target = materials[0];
      if (target !== undefined) {
        const adjustment = engine.modifiers.evoCostFor(target, definition);
        if (adjustment !== undefined) {
          cost = "fixed" in adjustment ? adjustment.fixed : cost + adjustment.delta;
        }
      }
      return Math.max(0, cost - engine.subTriggers.dnaCostReductionFor(materials, definition));
    },
    potentialInteractiveDnaDigivolveReduction: (_state, seat, materials, definition) => {
      const target = materials[0];
      if (target === undefined || engine.continuous.blocksCostReduction(seat, "digivolve")) return 0;
      return engine.subTriggers.potentialInteractiveReductionFor(
        "wouldDigivolve",
        seat,
        target,
        definition,
        {
          hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
          markFired: (key) => engine.tracker.register(key, "replacement"),
        },
        "hand",
      );
    },
    activateInteractiveDnaDigivolveReduction: async (_state, seat, materials, definition, evolvingInstanceId) => {
      const target = materials[0];
      if (target === undefined || engine.continuous.blocksCostReduction(seat, "digivolve")) return 0;
      return engine.subTriggers.activateInteractiveReductionsFor(
        "wouldDigivolve",
        seat,
        target,
        definition,
        evolvingInstanceId,
        (sourcePermanentId, sourceInstanceId) => {
          const source = engine.access.permanentById(sourcePermanentId);
          return source?.topCard === undefined
            ? undefined
            : buildEffectContext(
                engine,
                cardSourceOf(engine, findInstance(engine, sourceInstanceId ?? "")?.instance ?? source.topCard),
                {},
              );
        },
        {
          hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
          markFired: (key) => engine.tracker.register(key, "replacement"),
        },
        materials,
        looseZoneOfInstance(engine.state, evolvingInstanceId),
      );
    },
    materialsRestricted: (_state, materials, definition) =>
      materials.some(
        (material) =>
          engine.continuous.hasRestriction(material.permanentId, "digivolve") ||
          (definition.level === 7 && engine.continuous.hasRestriction(material.permanentId, "digivolveToLevel7")) ||
          (!material.isSuspended && engine.continuous.isUnsuspendedDigivolveProhibited(material.controllerSeat)),
      ),
    dnaDigivolveInto: (materialPermanentIds, resultInstanceId, opts) =>
      engine.primitives.dnaDigivolveInto(materialPermanentIds, resultInstanceId, opts),
  };
}

/**
 * Adapt the engine's capabilities to the turn-phase state machine's narrow port
 * (subsystem: turn-phase-state-machine). The machine itself is fully implemented;
 * the dependencies it calls are filled in as their subsystems land.
 */
export function buildTurnFlowHooks(engine: GameEngine): TurnFlowHooks {
  return {
    beforeTurn: (turn) => engine.hooks.beforeTurn?.(turn),
    fireTiming: async (timing) => engine.fireTiming(timing),
    draw: async (seat, count) => (await drawCards(engine, seat, count)).length,
    deckCount: (seat) => engine.state.players[seat]?.deck.length ?? 0,
    unsuspendForActivePhase: async (seat) => engine.unsuspendForActivePhase(seat),
    runBreedingPhase: async (seat) => runBreedingPhase(engine, seat),
    runMainPhase: async (seat) => {
      engine.mainEntryPending = true;
      try {
        const ending = engine.mainPhase.run(seat);
        engine.projection.syncMainPhaseAffordances();
        return await ending;
      } finally {
        engine.mainEntryPending = false;
        engine.projection.syncMainPhaseAffordances();
      }
    },
    resumeMainPhase: (seat) => resumeMainPhaseInput({ engine, seat }),
    isMainPhaseOpen: () =>
      engine.mainPhase.isOpen && engine.mainPhase.seat === engine.state.turnSeat && !engine.mainEntryPending,
    finalizeMainPhaseEntry: () => {
      engine.mainEntryPending = false;
      const passed = engine.deferredEndPhaseSeat;
      engine.deferredEndPhaseSeat = undefined;
      if (passed !== undefined) applyIntent(engine, passed, { type: "endPhase" });
      // The input controller deliberately opens before asynchronous start-of-main
      // work finishes. A very fast client can therefore submit a legal verb while
      // engine finalizer is still pending. Route through the guarded post-verb check:
      // if that verb has an active effect window, it owns the eventual turn-end
      // check and engine stale entry finalizer must do nothing.
      checkTurnEndAfterVerb(engine);
    },
    isGameOver: () => engine.state.gameOver,
    declareDeckOutLoss: (loserSeat) => {
      // Deck-out: the seat that must draw from an empty deck loses; the opponent
      // wins (security-and-win-check). WinCheck.declareLoss is idempotent.
      engine.win.declareLoss(loserSeat, "deckOut");
    },
    clearDurations: async (boundary) => {
      // Per-turn use limits (maxPerTurn / Once Per Turn) reset at the start of each
      // turn — the engine owns the UseTracker lifecycle (source
      // The per-turn usage ledger is cleared at each turn boundary. This is the
      // intent-protocol-and-room concern of keeping the per-turn ledger correct so
      // activated/triggered effects re-arm.
      if (boundary === "ownerTurnStart") {
        rollTurnActivity(engine.state);
        engine.tracker.resetForNewTurn();
        engine.combat.attackedThisTurn.clear();
        engine.crossedMemoryRushAttackers.clear();
      }
      await sweepDurations(engine, boundary);
    },
  };
}
