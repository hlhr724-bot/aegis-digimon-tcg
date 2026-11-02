import { getPrimitivesRuntimeState } from "#api/engine/effects/verbs/snapshot/getPrimitivesRuntimeState";
import type { GameEngine } from "#api/engine/GameEngine";

import { ENGINE_SNAPSHOT_FIELDS } from "#api/engine/snapshot/ENGINE_SNAPSHOT_FIELDS";

type Params = { engine: GameEngine };

export function assertEngineSnapshotBoundary({ engine }: Params): void {
  for (const key of Reflect.ownKeys(engine)) {
    if (typeof key !== "string" || !ENGINE_SNAPSHOT_FIELDS.has(key)) {
      throw new Error(`Unclassified engine snapshot field: ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(engine, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error(`Unsupported engine snapshot accessor: ${key}`);
    }
  }
  const pending = {
    effectBodyTokens: engine.effectBodyTokens.length,
    activeWindowToken: engine.activeWindowToken !== undefined,
    mainVerbContinuationsInFlight: engine.mainVerbContinuationsInFlight,
    counterResolutionInFlight: engine.counterResolutionInFlight,
    optionResolutionDepth: engine.optionResolutionDepth,
    optionMainDepth: engine.optionMainDepth,
    effectResolutionDepth: engine.effectResolutionDepth,
    mainEntryPending: engine.mainEntryPending,
    deferredEndPhaseSeat: engine.deferredEndPhaseSeat !== undefined,
    pendingPoolDrainDepth: engine.pendingPoolDrainDepth,
    attackStepPauseDepth: engine.attackStepPauseDepth,
    subTriggerWindowDepth: engine.subTriggerWindowDepth,
    pendingWindowSubTriggers: engine.pendingWindowSubTriggers.length,
    pendingDeletionSubTriggers: engine.pendingDeletionSubTriggers.length,
    pendingBattleWonSubTriggers: engine.pendingBattleWonSubTriggers.length,
    parkedEntrySubTriggers: engine.parkedEntrySubTriggers.length,
    pendingNestedTimingEffects: engine.pendingNestedTimingEffects.length,
    payingPlayCost: engine.payingPlayCost,
    digivolveCostSubTriggers: engine.digivolveCostSubTriggers !== undefined,
    pendingPlayCostDeletionEffects: engine.pendingPlayCostDeletionEffects.length,
    pendingLeaveReplacementEffects: engine.pendingLeaveReplacementEffects.length,
    deferredSecurityRemovalTriggers: engine.deferredSecurityRemovalTriggers.length,
    flushingDeferredSecurityRemovalTriggers: engine.flushingDeferredSecurityRemovalTriggers,
    pendingEffectReaders: engine.pendingEffectReaders.size,
    deferredTimingWindows: engine.deferredTimingWindows.length,
    flushingDeferredTimingWindows: engine.flushingDeferredTimingWindows,
    pendingPlayReducerPlacements: engine.pendingPlayReducerPlacements.size,
    preparedDigiXrosCosts: engine.preparedDigiXrosCosts.size,
    pendingSelfReducerRelocations: engine.pendingSelfReducerRelocations.size,
    pendingBlitzAttack: engine.pendingBlitzAttack !== undefined,
    recomputeInFlight: engine.recomputeInFlight !== undefined,
    recomputeQueued: engine.recomputeQueued,
    activeReplacementKeys: engine.preventReentryGuard.activeReplacementKeys.size,
    decoyCostPermanentIds: engine.decoyCostPermanentIds.size,
    ruleProcessing: engine.ruleProcessing,
    drawingDigivolutionBonus: engine.drawingDigivolutionBonus,
    turnEndWindowSeat: engine.turnEndWindowSeat !== undefined,
    resolvingBarrierSecurityCost: engine.resolvingBarrierSecurityCost,
    deferredRuleSubTriggers: engine.deferredRuleSubTriggers.length,
    ruleTriggerPool: engine.ruleTriggerPool !== undefined,
    securityCheckDepth: engine.securityCheckDepth,
    continuousScope: engine.continuousScope.getStore() === true,
    consumedSubTriggerKeys: engine.consumedSubTriggerKeys.size,
    breedingOpen: engine.breeding.isOpen,
    mainClosed: !engine.mainPhase.isOpen,
    mainSeatMismatch: engine.mainPhase.seat !== engine.state.turnSeat,
    mainEnded: engine.mainPhase.hasEnded,
    manual: engine.manual !== undefined,
  };
  const active = Object.entries(pending).filter(([, value]) => value !== false && value !== 0);
  if (active.length !== 0) {
    throw new Error(`Engine snapshot requires settled Main input: ${active.map(([key]) => key).join(", ")}`);
  }
  engine.turnMachine.getRuntimeState();
  engine.combat.getRuntimeState();
  engine.decisions.getRuntimeState();
  engine.mulligan.getRuntimeState();
  engine.memory.snapshot();
  getPrimitivesRuntimeState({ primitives: engine.primitives });
  engine.modifiers.getRuntimeState();
  engine.continuous.getRuntimeState();
  engine.subTriggers.getRuntimeState();
}
