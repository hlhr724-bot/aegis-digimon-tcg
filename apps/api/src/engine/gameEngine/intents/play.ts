import { prepareEffectPlayDigiXros } from "../../effects/interpreter/actions/effectPlayDigiXros.js";
import type { DigiXrosPlanInput } from "#api/engine/actions/digiXros";
import { buildEffectContext, cardSourceOf } from "../effectContext.js";
import { clearPreparedDigiXrosPlay, hasOtherDigiXrosPlayCosts } from "../timing/payCost.js";
import { maximumPreparedDigiXrosReduction, prepareDigiXrosPlay } from "../timing/digiXros.js";
import {
  digiXrosRequiresPreparationFor,
  Phase,
  appFusionCostFor,
  type Intent,
  type IntentResult,
  type Seat,
} from "@aegis/shared";
import { effectiveNames } from "../../effects/continuous.js";
import { lookupDefinition } from "../../cards/cardData.js";
import {
  applyActivateEffect,
  type ActivateEffectIntent,
  validateActivateEffect,
} from "../../actions/activateEffect.js";
import { logError } from "../../../logger.js";
import {
  applyAssembly,
  applyDigiXros,
  applyPlayCard,
  type AssemblyIntent,
  type DigiXrosIntent,
  type PlayCardIntent,
  validateAssembly,
  validateDigiXros,
  validatePlayCard,
} from "../../actions/index.js";
import { mapAssemblyReason, mapDigiXrosReason, mapPlayCardReason } from "../rejectionReasons.js";
import type { AppFusionValidation } from "../types.js";
import { activateEffectDeps, assemblyDeps, digiXrosDeps, digivolveDeps, playCardDeps } from "../actionDeps.js";
import type { GameEngine } from "../../GameEngine.js";
import { collectRuleProcessPending, ruleProcess } from "../ruleProcess.js";
import { drainActivatedMainTriggers } from "../timing/fire.js";
import {
  beginResolvingWindow,
  collectDeferredTimingPending,
  endResolvingWindow,
  withPendingPoolDrain,
} from "../windows.js";
import { continueMainVerb } from "./router.js";

/**
 * Route the play-card verb (subsystem: play-card). Validates synchronously to
 * produce the immediate IntentResult the room returns to the client; on success,
 * applies the action. Because applyPlayCard can await player decisions while
 * resolving On Play (or the option activation), it runs as a continuation — its
 * state mutations sync to clients as Colyseus deltas and any prompt arrives on the
 * decision channel, matching the API-CONTRACT "Play a card" flow.
 */
export function handlePlayCard(engine: GameEngine, seat: Seat, intent: PlayCardIntent): IntentResult {
  // A DigiXros declaration (place named materials under the card for a per-material cost
  // reduction) routes to the dedicated DigiXros play subsystem.
  if (intent.digiXros !== undefined) {
    return handleDigiXros(engine, seat, intent as DigiXrosIntent);
  }
  // An Assembly declaration (place the exact named/traited trash-card count under the card for
  // a flat cost reduction, §7-3) routes to the dedicated Assembly play subsystem.
  if (intent.assembly !== undefined) {
    return handleAssembly(engine, seat, intent as AssemblyIntent);
  }
  const instance = engine.state.players[seat]?.hand.find((card) => card.instanceId === intent.instanceId);
  if (instance !== undefined && digiXrosRequiresPreparationFor(instance.cardId)) {
    const deps = playCardDeps(engine);
    // A read-only upper bound permits material-affordable plays without paying for impossible ones.
    const materialReduction = maximumPreparedDigiXrosReduction(engine, instance);
    const check = validatePlayCard(engine.state, seat, intent, {
      ...deps,
      maxAffordable: (state, owner) => deps.maxAffordable(state, owner) + materialReduction,
      hasBeforePayCost: () => hasOtherDigiXrosPlayCosts(engine, instance),
      minimumDeferredPlayCost: () => undefined,
    });
    if (!check.ok) return { ok: false, reason: mapPlayCardReason(check.reason) };
    continueMainVerb(
      engine,
      async () => {
        try {
          const ctx = buildEffectContext(engine, cardSourceOf(engine, instance), {});
          let digiXros: DigiXrosPlanInput | undefined;
          await prepareEffectPlayDigiXros(ctx, [instance], [], {
            capturePlayPlan: (plan) => {
              digiXros = plan;
            },
          });
          const outcome =
            digiXros !== undefined
              ? await applyDigiXros(engine.state, seat, { ...intent, digiXros }, digiXrosDeps(engine))
              : await applyPlayCard(engine.state, seat, intent, deps);
          if (!outcome.ok) engine.hooks.emit({ kind: "actionRejected", intent: "playCard", reason: outcome.reason });
          else if (engine.memory.hasCrossedToOpponent()) {
            const played = engine.state.players[seat]?.battleArea.find(
              (permanent) => permanent.topCard.instanceId === instance.instanceId,
            );
            if (played !== undefined && engine.continuous.hasKeyword(played.permanentId, "Rush"))
              engine.crossedMemoryRushAttackers.add(played.permanentId);
          }
        } finally {
          engine.primitives.consumeDigiXrosPlayExpansions?.(seat, instance.instanceId);
          clearPreparedDigiXrosPlay(engine, instance.instanceId);
        }
      },
      () => {},
      (err) => {
        logError("[engine] prepared DigiXros play failed:", err);
        engine.hooks.emit({
          kind: "actionRejected",
          intent: "playCard",
          reason: err instanceof Error ? err.message : "digixros-apply-error",
        });
      },
    );
    return { ok: true };
  }
  const deps = playCardDeps(engine);
  const check = validatePlayCard(engine.state, seat, intent, deps);
  if (!check.ok) {
    return { ok: false, reason: mapPlayCardReason(check.reason) };
  }
  continueMainVerb(
    engine,
    () => applyPlayCard(engine.state, seat, intent, deps),
    (result) => {
      // Cost selection can invalidate a provisionally accepted play without throwing.
      // Surface that result just like a synchronous validation failure.
      if (!result.ok) {
        engine.hooks.emit({ kind: "actionRejected", intent: "playCard", reason: mapPlayCardReason(result.reason) });
        return;
      }
      if (!engine.memory.hasCrossedToOpponent()) return;
      const played = engine.state.players[seat]?.battleArea.find(
        (permanent) => permanent.topCard?.instanceId === intent.instanceId,
      );
      if (played !== undefined && engine.continuous.hasKeyword(played.permanentId, "Rush")) {
        engine.crossedMemoryRushAttackers.add(played.permanentId);
      }
    },
    (err) => {
      logError("[engine] playCard apply failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "playCard",
        reason: err instanceof Error ? err.message : "play-card-apply-error",
      });
    },
  );
  return { ok: true };
}

/**
 * Route the activateEffect verb (subsystem: intent-protocol-and-room). Validates
 * synchronously for the immediate IntentResult; on success runs the named [Main]
 * ability as a continuation (it may await player decisions, whose prompts arrive on
 * the decision channel and whose state mutations sync as Colyseus deltas), then
 * re-checks the turn-end condition. Mirrors the play/digivolve handler shape.
 */
export function handleActivateEffect(engine: GameEngine, seat: Seat, intent: ActivateEffectIntent): IntentResult {
  const deps = activateEffectDeps(engine);
  const check = validateActivateEffect(engine.state, seat, intent, deps);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  continueMainVerb(
    engine,
    async () => {
      // The [Main] body is one resolving effect: what it triggers waits until it finishes.
      const wasOutermostWindow = beginResolvingWindow(engine);
      let outcome: Awaited<ReturnType<typeof applyActivateEffect>> | undefined;
      try {
        // Deferred watchers are armed from the installed set, so install it before the body runs.
        await engine.recomputeContinuousEffects();
        await withPendingPoolDrain(engine, wasOutermostWindow, async () => {
          outcome = await applyActivateEffect(engine.state, seat, intent, deps);
          if (!wasOutermostWindow) return;
          const rulePending = await collectRuleProcessPending(engine);
          await drainActivatedMainTriggers(engine, [...rulePending, ...collectDeferredTimingPending(engine)]);
        });
      } finally {
        endResolvingWindow(engine, wasOutermostWindow);
      }
      // Settle any rule check the drain left behind (e.g. a stack peel exposing a 0-DP card).
      // The rule check reads the continuous DP tier, and the client reads the projected
      // keywords and attack targets, so both need a recompute after the body: BT13-110's
      // Delay grants ＜Rush＞ as the final instruction of the activated effect.
      await engine.recomputeContinuousEffects();
      await ruleProcess(engine);
      return outcome!;
    },
    (outcome) => {
      if (outcome.ok) {
        engine.hooks.emit({
          kind: "effectActivated",
          receiptOnly: true,
          seat,
          sourceCardId: outcome.outcome.sourceCardId,
          effectKey: outcome.outcome.effectKey,
          description: outcome.outcome.description,
        });
        // Tracker was updated by applyActivateEffect; re-derive the activatable set
        // so the UI reflects the consumed use immediately (maxPerTurn exhausted).
        engine.projection.syncActivatableEffects();
        // An ability that paid or gained memory changes what the hand can afford.
        engine.projection.syncHandAffordances();
      }
    },
    (err) => {
      logError("[engine] activateEffect apply failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "activateEffect",
        reason: err instanceof Error ? err.message : "activate-effect-apply-error",
      });
    },
  );
  return { ok: true };
}

/**
 * Route a DigiXros play (subsystem: digiXros). Validates the material/expander declaration
 * synchronously for the immediate IntentResult; on success applies it as a continuation (the
 * placement + On Play can await player decisions), matching the playCard router.
 */
export function handleDigiXros(engine: GameEngine, seat: Seat, intent: DigiXrosIntent): IntentResult {
  const deps = digiXrosDeps(engine);
  const check = validateDigiXros(engine.state, seat, intent, deps);
  if (!check.ok) {
    return { ok: false, reason: mapDigiXrosReason(check.reason) };
  }
  continueMainVerb(
    engine,
    async () => {
      try {
        if (digiXrosRequiresPreparationFor(check.instance.cardId)) await prepareDigiXrosPlay(engine, intent.instanceId);
        const outcome = await applyDigiXros(engine.state, seat, intent, deps);
        if (!outcome.ok)
          engine.hooks.emit({ kind: "actionRejected", intent: "playCard", reason: mapDigiXrosReason(outcome.reason) });
        return outcome;
      } finally {
        engine.primitives.consumeDigiXrosPlayExpansions?.(seat, intent.instanceId);
        clearPreparedDigiXrosPlay(engine, intent.instanceId);
      }
    },
    () => {},
    (err) => {
      logError("[engine] digiXros apply failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "playCard",
        reason: err instanceof Error ? err.message : "digixros-apply-error",
      });
    },
  );
  return { ok: true };
}

/**
 * Route an Assembly play (subsystem: assembly; §7-3). Validates the trash-material declaration
 * synchronously for the immediate IntentResult; on success applies it as a continuation (the
 * placement + On Play can await player decisions), matching the digiXros/playCard routers.
 */
export function handleAssembly(engine: GameEngine, seat: Seat, intent: AssemblyIntent): IntentResult {
  const deps = assemblyDeps(engine);
  const check = validateAssembly(engine.state, seat, intent, deps);
  if (!check.ok) {
    return { ok: false, reason: mapAssemblyReason(check.reason) };
  }
  continueMainVerb(
    engine,
    () => applyAssembly(engine.state, seat, intent, deps),
    () => {},
    (err) => {
      logError("[engine] assembly apply failed:", err);
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "playCard",
        reason: err instanceof Error ? err.message : "assembly-apply-error",
      });
    },
  );
  return { ok: true };
}

/**
 * Route the digivolve verb (subsystem: digivolve). Validates synchronously to
 * produce the immediate IntentResult the room returns to the client; on success,
 * applies the action. Because applyDigivolve can await player decisions while
 * resolving When Digivolving, it runs as a continuation — its state mutations sync
 * to clients as Colyseus deltas and any prompt arrives on the decision channel,
 * matching the API-CONTRACT "Digivolve" flow.
 */
export function validateAppFusion(
  engine: GameEngine,
  seat: Seat,
  intent: Extract<Intent, { type: "appFusion" }>,
): AppFusionValidation {
  if (engine.state.turnSeat !== seat) return { ok: false, reason: "not-your-turn" };
  if (engine.state.phase !== Phase.Main) return { ok: false, reason: "wrong-phase" };
  const player = engine.state.players[seat];
  const source = player?.battleArea.find(({ permanentId }) => permanentId === intent.permanentId);
  const result = player?.hand.find(({ instanceId }) => instanceId === intent.instanceId);
  if (source === undefined || source.topCard === undefined || result === undefined) {
    return { ok: false, reason: "illegal-target" };
  }
  const linked = source.linked.find(({ instanceId }) => instanceId === intent.linkedInstanceId);
  if (linked === undefined) return { ok: false, reason: "illegal-target" };
  const printedName = lookupDefinition(source.topCard.cardId)?.nameEn;
  const topNames = printedName === undefined ? [] : effectiveNames(engine.continuous, source, printedName);
  const linkedName = lookupDefinition(linked.cardId)?.nameEn;
  const resultDefinition = lookupDefinition(result.cardId);
  const deps = digivolveDeps(engine);
  // App Fusion uses the same resulting stack transition as ordinary digivolution;
  // active base restrictions therefore apply before any cost or zone mutation.
  if (deps.digivolveBaseRestricted?.(engine.state, source, result) === true) {
    return { ok: false, reason: "illegal-target" };
  }
  if (deps.digivolveIntoAllowed?.(engine.state, source, result) === false) {
    return { ok: false, reason: "illegal-target" };
  }
  const printedCost =
    topNames.length === 0 || linkedName === undefined || resultDefinition === undefined
      ? undefined
      : appFusionCostFor(result.cardId, { topNames, linkedNames: [linkedName] });
  if (printedCost === undefined || resultDefinition === undefined) return { ok: false, reason: "illegal-target" };
  const passiveCost =
    deps.adjustedDigivolveCost?.(engine.state, source, printedCost, resultDefinition, { consumeOnce: false }) ??
    printedCost;
  const potentialReduction =
    deps.potentialInteractiveDigivolveReduction?.(engine.state, seat, source, resultDefinition) ?? 0;
  const projectedCost = Math.max(0, passiveCost - potentialReduction);
  if (deps.maxAffordable(engine.state, seat) < projectedCost) return { ok: false, reason: "insufficient-memory" };
  return { ok: true, source, result, resultDefinition, linked, printedCost, projectedCost };
}

export function handleAppFusion(
  engine: GameEngine,
  seat: Seat,
  intent: Extract<Intent, { type: "appFusion" }>,
): IntentResult {
  const check = validateAppFusion(engine, seat, intent);
  if (!check.ok) return check;
  const { source, result, resultDefinition, printedCost } = check;
  const originalTopInstanceId = source.topCard!.instanceId;
  const originalLinkedInstanceId = intent.linkedInstanceId;
  const samePublicAppFusionSnapshot = (): boolean => {
    const currentSource = engine.state.players[seat]?.battleArea.find(
      ({ permanentId }) => permanentId === intent.permanentId,
    );
    const currentResult = engine.state.players[seat]?.hand.find(({ instanceId }) => instanceId === intent.instanceId);
    return (
      currentSource === source &&
      currentSource?.controllerSeat === seat &&
      currentSource.topCard?.instanceId === originalTopInstanceId &&
      currentSource.linked.some(({ instanceId }) => instanceId === originalLinkedInstanceId) &&
      currentResult === result
    );
  };
  const deps = digivolveDeps(engine);

  continueMainVerb(
    engine,
    async () => {
      await deps.prepareDigivolveCost?.(engine.state, seat, source, result, resultDefinition);
      if (!samePublicAppFusionSnapshot()) return undefined;
      const adjusted =
        deps.adjustedDigivolveCost?.(engine.state, source, printedCost, resultDefinition, { consumeOnce: true }) ??
        printedCost;
      const interactiveReduction =
        (await deps.activateInteractiveDigivolveReduction?.(
          engine.state,
          seat,
          source,
          resultDefinition,
          result.instanceId,
        )) ?? 0;
      if (!samePublicAppFusionSnapshot()) return undefined;
      const finalCost = Math.max(0, adjusted - interactiveReduction);
      if (deps.maxAffordable(engine.state, seat) < finalCost) return undefined;
      await deps.fireWouldDigivolve?.(engine.state, seat, source, resultDefinition);
      if (!samePublicAppFusionSnapshot()) return undefined;
      return engine.primitives.appFuseInto(intent.permanentId, intent.instanceId, intent.linkedInstanceId, finalCost, {
        publicEntry: true,
      });
    },
    () => {},
    (err) =>
      engine.hooks.emit({
        kind: "actionRejected",
        intent: "appFusion",
        reason: err instanceof Error ? err.message : "app-fusion-apply-error",
      }),
  );
  return { ok: true };
}
