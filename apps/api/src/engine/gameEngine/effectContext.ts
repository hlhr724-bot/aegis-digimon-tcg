import { effectEnvironmentSnapshots } from "#api/engine/effects/resolution/effectEnvironmentSnapshots";
import { resolveDerivedDuringAttackStep } from "#api/engine/gameEngine/resolveDerivedDuringAttackStep";
import type { ArmedSubTrigger } from "#api/engine/gameEngine/subTriggerIdentity";
import type { CollectedEffect } from "#api/engine/effects/collect";
import { clearPreparedDigiXrosPlay, preparedDigiXrosMaterials } from "./timing/payCost.js";
import { retirePendingAttackWatchers } from "./subTriggers.js";
import { isTimingActivationDisabled } from "../effects/timingActivation.js";
import {
  EffectTiming,
  Zone,
  buildTriggerKey,
  getCardDefinition,
  requireCardDefinition,
  type CardInstance,
  type Permanent,
  type Seat,
  type ServerEvent,
  type ZoneRef,
} from "@aegis/shared";
import { CardMovePosition } from "@aegis/shared/protocol/CardMovePosition";
import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import { canAttackerDeclare } from "../combat/legality.js";
import { resolveKeywords } from "../combat/keywords.js";
import { effectiveKinds, effectiveNames, effectiveTraits } from "../effects/continuous.js";
import { createCardStateLookup, createEffectContext, createGameAccess } from "../effects/context.js";
import { createCardSource } from "../cards/CardSource.js";
import { type EffectEnvironment } from "../effects/index.js";
import type { CardSource } from "../effects/CardSource.js";
import type {
  DecisionApi,
  EffectContext,
  GameAccess,
  Primitives,
  RemovalCause,
  TriggerInfo,
} from "../effects/EffectContext.js";
import { detachLeaveReplacements, detachTraitTokens } from "../effects/detach.js";
import { partitionLeaveReplacements } from "../effects/verbs/partition.js";
import { guardLeaveReplacements } from "../effects/guard.js";
import { definitionOf } from "../cards/cardData.js";
import { consultLeavePrevention } from "../effects/leavePrevention.js";
import { effectTextMayAskYesNo } from "../decisions/resolverDecisions.js";
import { armorPurgeLeaveReplacements } from "../effects/armorPurge.js";
import { evadeLeaveReplacements } from "../effects/evade.js";
import { barrierLeaveReplacements } from "#api/engine/effects/barrier";
import { fragmentLeaveReplacements } from "#api/engine/effects/fragmentLeaveReplacements";
import { scapegoatLeaveReplacements } from "#api/engine/effects/scapegoatLeaveReplacements";
import { decoyLeaveReplacements } from "#api/engine/effects/decoyLeaveReplacements";
import { listDecoySources } from "#api/engine/effects/listDecoySources";
import { isDecoySourceProtecting } from "#api/engine/effects/isDecoySourceProtecting";
import { KeywordReaction } from "#api/engine/effects/KeywordReaction";
import { requestCardSelection } from "#api/engine/gameEngine/requestCardSelection";
import { emitKeywordDeletionPrevented } from "#api/engine/gameEngine/emitKeywordDeletionPrevented";
import { fragmentCountOf } from "#api/engine/combat/keywords";
import { canPaySuspendCost } from "../combat/legality.js";
import { consultDigivolutionTrashRedirect } from "../effects/digivolutionTrashRedirect.js";
import { findLooseInstance, instanceOnPermanent } from "./intents.js";
import { playEffectInstances } from "../effects/interpreter/actions/effectPlayAssembly.js";
import { effectiveColorsOf } from "./matchLifecycle.js";
import { createPrimitives } from "../effects/primitives.js";
import { resolveSelfWhenTrashedFromDeck } from "../effects/interpreter.js";
import { payBarrierSecurityCost } from "./securityCheck.js";
import { digivolveDeps, playCardDeps } from "./actionDeps.js";
import { collectRuleProcessPending } from "./ruleProcess.js";
import { awaitBlitzAttackDeclaration } from "./blitz.js";
import {
  drainPendingAttackTriggers,
  fireBeforePayCost,
  fireEnteredByEffectTiming,
  fireTiming,
  fireTimingForInstance,
  prepareDigiXrosPlay,
  prepareDigiXrosPlays,
  projectInHandCost,
  projectLooseUseCost,
  reactivateOnPlay,
  resolveDeletionReactions,
  runPendingTimingWindow,
  runTimingWindow,
} from "./timing.js";
import { collectRuleProcessMovements, flushRuleTriggerPool, nextInstanceId, nextPermanentId } from "./ruleProcess.js";
import {
  flushDeferredTimingWindows,
  inContinuousPass,
  parkDeferredSecurityRemovalTriggers,
  parkDeferredTimingWindowsForAttack,
  resolveLeaveReplacementBody,
  settleBetweenEffects,
  shouldDeferNestedTiming,
  takeLeaveReplacementPending,
} from "./windows.js";
import { prepareOptionUsed, withPendingSubTriggers } from "./subTriggers.js";
import type { GameEngine } from "../GameEngine.js";

export function effectAccess(engine: GameEngine): GameAccess {
  engine.gameAccess ??= createGameAccess(
    engine.state,
    (id) => engine.continuous.linkMaxDelta(id),
    (id, traits) => engine.continuous.linkCostReduction(id, traits),
    (id, keyword) => {
      const permanent = engine.access.permanentById(id);
      return (
        (permanent !== undefined && resolveKeywords(permanent, engine.continuous).includes(keyword)) ||
        (keyword.toLowerCase() === "piercing" && engine.modifiers.hasPierce(id))
      );
    },
    (seat) => engine.tracker.count(`seat:${seat}`, "digivolvedThisTurn") > 0,
    (permanentId, timing) => isTimingActivationDisabled(engine.continuous, permanentId, timing),
    (permanent) => effectiveColorsOf(engine, permanent),
    (instanceId) => engine.continuous.hasColorWaiver(instanceId),
    (instanceId) => engine.continuous.colorRequirementAlternatives(instanceId),
    (permanent) => canAttackerDeclare(engine.access, permanent.controllerSeat, permanent, engine.continuous) === null,
    (permanentId, printedTraits) => effectiveTraits(engine.continuous, permanentId, printedTraits),
    (permanentId, printedKinds) => effectiveKinds(engine.continuous, permanentId, printedKinds),
    (seat, base, evolving, sourceZone) =>
      engine.digivolveSupport.matchBaseGrantedDigivolve(seat, base, evolving, sourceZone),
    undefined,
    (id, traits) =>
      engine.continuous.linkCostReductionGrant(
        id,
        traits,
        (key) => engine.tracker.count(`link-cost/${key}`, "replacement") > 0,
      ),
    (permanent, printedName) => effectiveNames(engine.continuous, permanent, printedName),
    (id) => engine.combat.battleOpponentOf(id),
  );
  engine.gameAccess.runtimeCallbacks = engine.runtimeCallbacks;
  engine.gameAccess.runtimeObjects = engine.runtimeObjects;
  return engine.gameAccess;
}

export function effectPrimitives(engine: GameEngine, ownerSeat: Seat): Primitives {
  // `gainMemory` is written from the resolving card's perspective ("gain N memory").
  // Most windows belong to the turn player, but Security and opponent-turn effects may
  // resolve for the non-turn player. Bind the convenience verb to the source owner here;
  // explicit cross-seat effects continue to use `gainMemoryForSeat` directly.
  engine.primitivesBySeat[ownerSeat] ??= {
    ...engine.primitives,
    gainMemory: (amount: number) => engine.primitives.gainMemoryForSeat(ownerSeat, amount),
  };
  return engine.primitivesBySeat[ownerSeat];
}

export function buildEffectContext(
  engine: GameEngine,
  source: CardSource,
  trigger: TriggerInfo,
  askOverride?: DecisionApi,
): EffectContext {
  const context = createEffectContext({
    source,
    trigger,
    game: effectAccess(engine),
    fx: effectPrimitives(engine, source.ownerSeat),
    ask: askOverride ?? engine.decisionApi,
    usage: engine.tracker,
  });
  return context;
}

/** Find a card instance that is loose or anywhere in a battle-area permanent. */
function findInstanceAnywhere(engine: GameEngine, instanceId: string): CardInstance | undefined {
  const loose = findLooseInstance(engine, instanceId);
  if (loose !== undefined) return loose;
  for (const player of engine.state.players) {
    for (const permanent of player.battleArea) {
      const found = instanceOnPermanent(engine, permanent, instanceId);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

async function playForKeywordEffect(
  engine: GameEngine,
  sourceInstanceId: string,
  instanceIds: readonly string[],
  opts: { playedFromZone?: ZoneRef } = {},
): Promise<Permanent[]> {
  const source = findInstanceAnywhere(engine, sourceInstanceId);
  const playedCards = instanceIds
    .map((instanceId) => findInstanceAnywhere(engine, instanceId))
    .filter((card): card is CardInstance => card !== undefined)
    .map(({ instanceId, cardId, ownerSeat }) => ({ instanceId, cardId, ownerSeat }));
  if (source === undefined) return engine.primitives.playInstances([...instanceIds], { ...opts, payCost: false });
  const ctx = buildEffectContext(engine, cardSourceOf(engine, source), {});
  // Partition interrupts another player's removal effect. Attribute its plays to the
  // keyword owner so restrictions such as Crimson Blaze see the player performing them.
  ctx.fx.enterEffectResolution?.(
    ctx.source.ownerSeat,
    getCardDefinition(source.cardId)?.kinds ?? [],
    ctx.source.permanent()?.permanentId,
  );
  try {
    return await playEffectInstances(ctx, playedCards, { ...opts, payCost: false });
  } finally {
    ctx.fx.leaveEffectResolution?.();
  }
}

/** Resolve the CardSource for a CardInstance against live state (placement/turn lookup). */
export function cardSourceOf(engine: GameEngine, instance: CardInstance): CardSource {
  const cached = engine.cardSourceByInstance.get(instance);
  if (cached !== undefined) return cached;
  engine.cardStateLookup ??= createCardStateLookup(engine.state);
  engine.cardStateLookup.runtimeObjects = engine.runtimeObjects;
  const source = createCardSource(instance, engine.cardStateLookup);
  engine.cardSourceByInstance.set(instance, source);
  return source;
}

/**
 * The framework environment a timing resolution runs against: authoritative state,
 * the effect verbs (fx), the player-decision API (ask), and the per-turn use ledger
 * (shared with activateEffect so maxPerTurn accounting is unified).
 */
export function effectEnvironment(engine: GameEngine, trigger: TriggerInfo): EffectEnvironment {
  const environment: EffectEnvironment = {
    runtimeObjects: engine.runtimeObjects,
    runtimeCallbacks: engine.runtimeCallbacks,
    state: engine.state,
    fx: engine.primitives,
    fxForSource: (source) => effectPrimitives(engine, source.ownerSeat),
    ask: engine.decisionApi,
    tracker: engine.tracker,
    continuous: engine.continuous,
    hasKeyword: (id, keyword) =>
      engine.continuous.hasKeyword(id, keyword) ||
      (keyword.toLowerCase() === "piercing" && engine.modifiers.hasPierce(id)),
    digivolvedThisTurn: (seat) => engine.tracker.count(`seat:${seat}`, "digivolvedThisTurn") > 0,
    effectiveColors: (permanent) => effectiveColorsOf(engine, permanent),
    colorRequirementWaived: (instanceId) => engine.continuous.hasColorWaiver(instanceId),
    colorRequirementAlternatives: (instanceId) => engine.continuous.colorRequirementAlternatives(instanceId),
    canDeclareAttack: (permanent) =>
      canAttackerDeclare(engine.access, permanent.controllerSeat, permanent, engine.continuous) === null,
    battleOpponentOf: (id) => engine.combat.battleOpponentOf(id),
    baseGrantedDigivolve: (seat, base, evolving, sourceZone) =>
      engine.digivolveSupport.matchBaseGrantedDigivolve(seat, base, evolving, sourceZone),
    triggerInfo: trigger,
  };
  effectEnvironmentSnapshots.set(environment, new Map(Object.entries(environment)));
  return environment;
}

/**
 * CR §3-1-3-1-2: a card that leaves the field returns as a new card, so its [Once Per Turn]
 * effects are available again (EX12-065 replayed by ＜Fortitude＞, KB Q6866). A card still on
 * the field is the same Digimon (§3-4-5, KB Q4253) and keeps its counts. Forgetting at the
 * departure, not after the deletion reactions, keeps the use ＜Fortitude＞'s replay then spends.
 */
export function forgetUsesOfCardsLeavingField(engine: GameEngine, event: ServerEvent): void {
  if (event.kind !== "cardsMoved") return;
  const onField = (zone: string): boolean => zone === Zone.BattleArea || zone === Zone.Breeding;
  const fromField =
    onField(event.from) ||
    event.from === CardMovePosition.DIGIVOLUTION_CARDS.value ||
    event.from === CardMovePosition.LINKED_CARDS.value;
  if (!fromField || onField(event.to)) return;
  for (const instanceId of event.instanceIds) engine.tracker.forgetInstance(instanceId);
}

/** Expire the effects a card was granted before it left the field once it re-enters (KB Q1148). */
export function trackGrantsOfCardsCrossingField(engine: GameEngine, event: ServerEvent): void {
  if (event.kind !== "cardsMoved") return;
  const onField = (zone: string): boolean => zone === Zone.BattleArea || zone === Zone.Breeding;
  if (onField(event.from) && !onField(event.to)) engine.continuous.markCustomEffectGrantsLeftField(event.instanceIds);
  if (!onField(event.from) && onField(event.to)) {
    engine.continuous.dropCustomEffectGrantsOfReenteringCards(event.instanceIds);
  }
}

/**
 * Single-sourced per-permanent teardown for every deletion seam. When a permanent
 * leaves the field its three per-permanent ledgers must be dropped together: the
 * modifier ledger (DP/keyword/cost modifiers), the continuous-rule store, and the
 * SubTrigger registry (delayed watchers + reduceCost/prevent REPLACEMENTS). The
 * effect-driven `deletePermanent` primitive does engine inline; combat and the security
 * check delete through raw state access and so route their cleanup here, so a stale
 * watcher or replacement from a source that died in battle/security cannot fire or
 * discount after the source is gone. Mirrors the DNA-digivolve material teardown.
 */
export function dropPermanentSubscriptions(engine: GameEngine, permanentId: string): void {
  engine.modifiers.dropPermanent(permanentId);
  engine.continuous.dropPermanent(permanentId);
  engine.subTriggers.dropPermanent(permanentId);
}

/**
 * Consult active "prevent" leave/delete replacements for the permanents an effect is about to
 * remove (subsystem: delayed-and-rule-effects). Delegates to the standalone
 * `consultLeavePrevention` (testable in isolation), supplying engine engine's registry,
 * permanent lookup, and context builder. Returns the subset whose removal was prevented;
 * default-safe (empty when no prevent replacement is active).
 */
export async function engineConsultLeavePrevention(
  engine: GameEngine,
  permanentIds: string[],
  cause: RemovalCause = "byEffect",
  resolvingSeat?: Seat,
  opts?: {
    isBounce?: boolean;
    destination?: ZoneRef;
    insteadOnly?: boolean;
    playerAction?: boolean;
    isDigiXros?: boolean;
    keywordPreventions?: { interruptsEffect: boolean };
    holdTriggered?: boolean;
  },
): Promise<Set<string>> {
  // Immediate reactions must observe the rebuilt continuous registry, never its
  // clear-before-refill interval during an overlapping effect-resolution flow.
  await engine.recomputeContinuousEffects();
  const pendingBefore = new Set(engine.pendingNestedTimingEffects);
  const prevented = await consultLeavePrevention(
    {
      subTriggers: engine.subTriggers,
      resolveInsteadBody: async (replacement, ctx, body) => {
        const host = ctx.source.permanent();
        const announced = {
          seat: ctx.source.ownerSeat,
          sourceCardId: ctx.source.cardId,
          sourceInstanceId: ctx.source.instanceId,
          sourcePermanentId: host?.permanentId,
          effectKey: `replacement/${replacement.id}`,
          description: replacement.description,
          timing: replacement.event,
          ...(host !== undefined && host.topCard?.instanceId !== ctx.source.instanceId ? { isInherited: true } : {}),
        };
        engine.hooks.emit({
          kind: "effectTriggered",
          ...announced,
          ...(engine.securityCheckDepth > 0 ? { duringSecurityCheck: true } : {}),
        });
        try {
          return await resolveLeaveReplacementBody(engine, body);
        } finally {
          engine.hooks.emit({ kind: "effectResolved", ...announced });
        }
      },
      resolvePreventBody: (body) => resolveLeaveReplacementBody(engine, body, { asEffectBody: true }),
      keywordReplacements: (ids) => [
        ...partitionLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasPartition: (id) => engine.continuous.hasKeyword(id, "Partition"),
          select: async (_ctx, candidate) => {
            const response = await engine.decisions.request({
              seat: candidate.seat,
              kind: "selectCards",
              promptText: "＜Partition＞: play the specified digivolution cards without paying their costs?",
              sourceCardId: candidate.partitionSourceCardId,
              sourceInstanceId: candidate.partitionSourceInstanceId,
              options: {
                candidateInstanceIds: [candidate.matchedInstanceIds[0]!],
                min: 0,
                max: 1,
                selectionContext: "partitionActivation",
                visibleInstanceIds: candidate.matchedInstanceIds,
              },
            });
            return response.kind === "selectCards" ? response.instanceIds : [];
          },
          play: (source, materialIds) =>
            playForKeywordEffect(engine, source, materialIds, { playedFromZone: "digivolutionCards" }),
        }),
        ...detachLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasDetach: (id) => engine.continuous.hasKeyword(id, "Detach"),
          traitTokens: (id) => {
            const permanent = engine.access.permanentById(id);
            if (permanent?.topCard === undefined) return [];
            const printed = detachTraitTokens(definitionOf(permanent.topCard));
            const granted = engine.continuous.keywordGrantSources(id, "Detach").flatMap((source) => {
              const definition = source.sourceCardId === undefined ? undefined : getCardDefinition(source.sourceCardId);
              return detachTraitTokens({ effectText: source.effectText ?? definition?.effectText });
            });
            return [...new Set([...printed, ...granted])];
          },
          definitionOf: (card) => definitionOf(card),
          trash: (paymentIds) => engine.primitives.trash(paymentIds),
        }),
        ...guardLeaveReplacements(
          [...engine.state.players].flatMap((player) => player.battleArea.map((permanent) => permanent.permanentId)),
          {
            permanentById: (id) => engine.access.permanentById(id),
            isBattleAreaDigimon: (permanent) => engine.access.isBattleAreaDigimon(permanent, engine.continuous),
            hasGuard: (id) => engine.continuous.hasKeyword(id, "Guard"),
          },
        ),
      ],
      keywordPreventionReplacements: (ids, interruptsEffect) => [
        ...barrierLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasBarrier: (id) => engine.continuous.hasKeyword(id, "Barrier"),
          grantSourceInstanceIds: (id) =>
            engine.continuous
              .keywordGrantSources(id, "Barrier")
              .flatMap((source) => (source.sourceInstanceId === undefined ? [] : [source.sourceInstanceId])),
          securityCount: (seat) => engine.access.securityCount(seat),
          decide: (seat, permanentId) => engine.combat.runBarrierDecision(seat, permanentId),
          paySecurity: (seat) => payBarrierSecurityCost(engine, seat, interruptsEffect),
        }),
        ...armorPurgeLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasArmorPurge: (id) => engine.continuous.hasKeyword(id, "Armor Purge"),
          purge: (id) => engine.primitives.armorPurge(id),
        }),
        ...evadeLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasEvade: (id) => engine.continuous.hasKeyword(id, "Evade"),
          canSuspend: (permanent) => canPaySuspendCost(permanent, engine.continuous),
          decide: (seat, permanentId) => engine.combat.runEvadeDecision(seat, permanentId),
          suspend: async (permanentId, seat) =>
            (await engine.primitives.suspend([permanentId], { byEffectSeat: seat })).length > 0,
        }),
        ...fragmentLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          fragmentCount: (id) => {
            const permanent = engine.access.permanentById(id);
            if (permanent?.topCard === undefined || !engine.continuous.hasKeyword(id, "Fragment")) {
              return undefined;
            }
            return fragmentCountOf(permanent.topCard.cardId, engine.continuous.grantedKeywords(id));
          },
          select: (seat, candidateInstanceIds, { min, max }, promptText, source) =>
            requestCardSelection(engine, {
              seat,
              candidateInstanceIds,
              min,
              max,
              promptText,
              source,
              selectionGoal: DecisionSelectionGoal.PROTECT.value,
            }),
          trash: (hostPermanentId, instanceIds, provenance) =>
            engine.primitives.trashDigivolutionCards(hostPermanentId, instanceIds, provenance),
          announce: (saved) => emitKeywordDeletionPrevented(engine, { keyword: "Fragment", saved }),
        }),
        ...scapegoatLeaveReplacements(ids, {
          permanentById: (id) => engine.access.permanentById(id),
          hasScapegoat: (id) => engine.continuous.hasKeyword(id, "Scapegoat"),
          sacrificeCandidates: (holder) =>
            engine.access
              .battleAreaPermanents(holder.controllerSeat)
              .filter(
                (permanent) =>
                  permanent.permanentId !== holder.permanentId &&
                  permanent.topCard !== undefined &&
                  engine.access.isBattleAreaDigimon(permanent, engine.continuous),
              ),
          select: async (seat, candidateInstanceIds, min, promptText, source) =>
            (
              await requestCardSelection(engine, {
                seat,
                candidateInstanceIds,
                min,
                max: 1,
                promptText,
                source,
                selectionGoal: DecisionSelectionGoal.PROTECT.value,
              })
            )[0],
          announce: (saved, sacrifice) =>
            emitKeywordDeletionPrevented(engine, { keyword: "Scapegoat", saved, paid: sacrifice }),
        }),
        ...decoyLeaveReplacements(
          [...engine.state.players].flatMap((player) => player.battleArea.map((permanent) => permanent.permanentId)),
          {
            permanentById: (id) => engine.access.permanentById(id),
            isBattleAreaDigimon: (permanent) => engine.access.isBattleAreaDigimon(permanent, engine.continuous),
            hasDecoy: (id) => engine.continuous.hasKeyword(id, "Decoy"),
            isDecoyCost: (id) => engine.decoyCostPermanentIds.has(id),
            protectingSource: (holder, target) => {
              const targetDefinition = requireCardDefinition(target.topCard.cardId);
              return listDecoySources(engine.continuous, holder).find((source) =>
                isDecoySourceProtecting(source, targetDefinition),
              );
            },
            select: async (seat, candidateInstanceIds, min, promptText, source) => {
              const response = await engine.decisions.request({
                seat,
                kind: "selectCards",
                promptText,
                sourceCardId: source.sourceCardId,
                options: { candidateInstanceIds, min, max: 1, timing: "Static", effectText: source.effectText },
              });
              return response.kind === "selectCards" ? response.instanceIds : [];
            },
            deleteAsCost: async (holderId) => {
              engine.decoyCostPermanentIds.add(holderId);
              try {
                return (await engine.primitives.deletePermanent([holderId], "byEffect")) > 0;
              } finally {
                engine.decoyCostPermanentIds.delete(holderId);
              }
            },
          },
        ),
      ],
      permanentById: (id) => engine.access.permanentById(id),
      buildContext: (srcPerm, leavingId) =>
        buildEffectContext(engine, cardSourceOf(engine, srcPerm.topCard!), {
          deletedPermanentId: leavingId,
          deletedPermanentIds: permanentIds,
        }),
      buildInstanceContext: (sourceInstanceId, leavingId) => {
        const sourceInstance = findLooseInstance(engine, sourceInstanceId);
        return sourceInstance === undefined
          ? undefined
          : buildEffectContext(engine, cardSourceOf(engine, sourceInstance), {
              deletedPermanentId: leavingId,
              deletedPermanentIds: permanentIds,
            });
      },
      turnSeat: engine.state.turnSeat,
      // Shared once-per-turn replacement ledger, keyed in the shared per-turn UseTracker
      // (reset at each turn start alongside every other Once-Per-Turn limit).
      oncePerTurnFired: (key) => engine.tracker.count(key, "replacement") > 0,
      markOncePerTurnFired: (key) => engine.tracker.register(key, "replacement"),
      // ＜Guard＞ is the one prevention keyword that resolves as a replacement subscription
      // rather than inline in the deletion paths, so its announcement is wired here.
      keywordPrevented: (activationIdentity, sourcePermanentId, sourceCardId, savedPermanentId, preventionKeyword) => {
        const keyword = preventionKeyword ?? (activationIdentity === KeywordReaction.GUARD.value ? "Guard" : undefined);
        if (keyword === undefined) return;
        const saved = engine.access.permanentById(savedPermanentId);
        if (saved === undefined) return;
        engine.hooks.emit({
          kind: "deletionPrevented",
          keyword,
          seat: saved.controllerSeat,
          permanentId: saved.permanentId,
          ...(keyword === "Armor Purge" && sourceCardId !== undefined
            ? { cardId: sourceCardId }
            : saved.topCard === undefined
              ? {}
              : { cardId: saved.topCard.cardId }),
          ...(sourcePermanentId === undefined ? {} : { paidPermanentId: sourcePermanentId }),
          ...(sourceCardId === undefined ? {} : { paidCardId: sourceCardId }),
        });
      },
      orderReplacements: async (replacements, seat) => {
        // Each row has to name the card whose printed clause it is. A would-leave
        // replacement usually lives in the INHERITED box of a digivolution card, so the
        // permanent's top card is the wrong answer: it names a Digimon the clause is not
        // printed on. The source instance is carried alongside the key (`triggerCardIds`)
        // rather than parsed out of it, and the key is prefixed with that instance so two
        // copies of the same card under the same permanent stay separately addressable.
        const keyed = replacements.map((replacement) => {
          const sourceInstance =
            replacement.sourceInstanceId === undefined
              ? undefined
              : findLooseInstance(engine, replacement.sourceInstanceId);
          const sourcePermanent =
            replacement.sourcePermanentId === undefined
              ? undefined
              : engine.access.permanentById(replacement.sourcePermanentId);
          const cardId = sourceInstance?.cardId ?? sourcePermanent?.topCard?.cardId;
          const anchorInstanceId = sourceInstance?.instanceId ?? sourcePermanent?.topCard?.instanceId ?? "";
          // A clause printed on a card that is NOT the permanent's top card is being read
          // from the digivolution (or linked) cards, which is the inherited text box.
          const isInherited =
            sourceInstance !== undefined &&
            sourcePermanent !== undefined &&
            sourcePermanent.topCard?.instanceId !== sourceInstance.instanceId;
          return {
            replacement,
            cardId: cardId ?? replacement.sourceInstanceId ?? replacement.sourcePermanentId ?? "source",
            isInherited,
            key: buildTriggerKey(anchorInstanceId, `replacement/${replacement.id}/${cardId ?? "source"}`),
          };
        });
        const response = await engine.decisions.request({
          seat,
          kind: "orderTriggers",
          promptText: "Choose the order for simultaneous would-leave effects.",
          options: {
            triggerKeys: keyed.map(({ key }) => key),
            triggerCardIds: keyed.map(({ cardId }) => cardId),
            triggerDescriptions: keyed.map(({ replacement }) => replacement.description),
            triggerIsInherited: keyed.map(({ isInherited }) => isInherited),
            acceptsResolutionPlan: true,
            acceptsIndexedResolutionPlan: true,
            triggerIsOptional: keyed.map(({ replacement }) => effectTextMayAskYesNo(replacement.description)),
          },
        });
        if (response.kind !== "orderTriggers" || response.order.length === 0) return { order: replacements };
        const byKey = new Map(keyed.map((entry) => [entry.key, entry.replacement]));
        const chosen = response.order.flatMap((key) => byKey.get(key) ?? []);
        const presetAnswers = new Map(
          Object.entries(response.optionalAnswers ?? {}).flatMap(([key, accept]) => {
            const replacement = byKey.get(key);
            return replacement === undefined ? [] : [[replacement.id, accept] as const];
          }),
        );
        return {
          order: [...chosen, ...replacements.filter((replacement) => !chosen.includes(replacement))],
          presetAnswers,
        };
      },
    },
    permanentIds,
    cause,
    resolvingSeat,
    {
      isBounce: opts?.isBounce,
      destination: opts?.destination,
      playerAction: opts?.playerAction,
      isDigiXros: opts?.isDigiXros,
      insteadOnly: opts?.insteadOnly,
      keywordPreventions: opts?.keywordPreventions,
      holdTriggered: opts?.holdTriggered,
      holdCardTriggered: cause === "byBattle",
      reentryGuard: engine.preventReentryGuard,
    },
  );
  // No [On Deletion] window follows a bounce or a fully averted leave, so what the replacement
  // triggered activates now instead of waiting for one. A DigiXros material interrupt is the
  // exception: it happens inside the play procedure, so its caller hands what it triggered to
  // the played Digimon's [On Play] window (CR §15-4-3-2, §15-8-3-2).
  if (cause === "byBattle") {
    const triggered = engine.pendingNestedTimingEffects.filter(
      (pending) => !pendingBefore.has(pending) && pending.timing === EffectTiming.WhenDigivolving,
    );
    const transferred = new Set(triggered);
    engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter(
      (pending) => !transferred.has(pending),
    );
    engine.pendingLeaveReplacementEffects.push(...triggered);
  }
  const averted =
    opts?.isBounce === true || opts?.insteadOnly === true || permanentIds.every((id) => prevented.has(id));
  if (averted && opts?.isDigiXros !== true && opts?.holdTriggered !== true && !engine.ruleProcessing)
    await runPendingTimingWindow(engine, takeLeaveReplacementPending(engine));
  return prevented;
}

/**
 * Consult active digivolution-card-trash "redirect" replacements (subsystem:
 * delayed-and-rule-effects; BT10-084 Tactimon, KB Q2002-Q2008) for a trash operation about to
 * target `hostPermanentIds`. Delegates to the standalone `consultDigivolutionTrashRedirect`
 * (testable in isolation), supplying engine engine's registry, permanent lookup, and context
 * builder. Returns the redirected host id, or undefined when nothing changed.
 */
export function engineConsultDigivolutionTrashRedirect(
  engine: GameEngine,
  hostPermanentIds: string[],
): Promise<string | undefined> {
  return consultDigivolutionTrashRedirect(
    {
      subTriggers: engine.subTriggers,
      permanentById: (id) => engine.access.permanentById(id),
      buildContext: (srcPerm) => buildEffectContext(engine, cardSourceOf(engine, srcPerm.topCard!), {}),
    },
    hostPermanentIds,
  );
}

/**
 * Build the concrete effect Primitives bound to engine match (subsystem boundary:
 * effect-primitives owns the verbs, intent-protocol-and-room owns the decision
 * channel they call). The SelectionPort adapts the DecisionManager into the
 * seat-keyed form selection verbs use.
 */
export function buildPrimitives(engine: GameEngine): Primitives {
  const attackStepParents: { watchers: ReadonlySet<ArmedSubTrigger>; nested: ReadonlySet<CollectedEffect> }[] = [];
  // `combat` is assigned after the primitives are built (the controller is itself
  // wired with engine engine's fireTiming seam), so expose it lazily via a getter; the
  // attack verbs only dereference it at call time, by which point it is set.
  const getCombat = () => engine.combat;
  return createPrimitives({
    runtimeCallbacks: engine.runtimeCallbacks,
    state: engine.state,
    // Match setup installs the streams after this adapter is constructed.
    // Resolve them at effect execution so security shuffles replay the match seed.
    rngForSeat: (seat) => {
      const random = engine.rngForSeat?.(seat);
      if (!random) throw new Error("Security shuffle requires an initialized match random stream");
      return random;
    },
    artsDigivolve: (seat, instance, definition, duringAttack) =>
      engine.digivolveSupport.resolveArtsDigivolve(seat, instance, definition, duringAttack),
    beginEffectBody: () => {
      engine.effectBodyTokens.push(++engine.windowTokenSeq);
      engine.effectResolutionDepth += 1;
    },
    finishEffectBody: () => {
      engine.effectBodyTokens.pop();
      engine.effectResolutionDepth = Math.max(0, engine.effectResolutionDepth - 1);
    },
    drainPendingAttackTriggers: () => drainPendingAttackTriggers(engine),
    awaitBlitzAttackDeclaration: (seat, attackerPermanentId, candidates, provenance) =>
      awaitBlitzAttackDeclaration(engine, seat, attackerPermanentId, candidates, provenance),
    resolveAttackTimingWindow: async (drain, options) => {
      // An effect-directed attack pauses its enclosing effect bodies while the
      // attack's pending effects resolve. State-based rules run between those
      // effects, even though the enclosing card will resume after combat.
      const pausedDepth = engine.effectResolutionDepth;
      const pausedOptionDepth = engine.optionResolutionDepth;
      const pausedOptionMainDepth = engine.optionMainDepth;
      engine.effectResolutionDepth = 0;
      engine.optionMainDepth = 0;
      try {
        parkDeferredSecurityRemovalTriggers(engine);
        parkDeferredTimingWindowsForAttack(engine);
        const initialRulePending = await collectRuleProcessPending(engine);
        engine.pendingNestedTimingEffects.push(...initialRulePending);
        // Settle the already-armed watcher tier before exposing the Option's older
        // printed entry/attack effects. Then settle the interrupted Option's rule
        // check in that same parent pool before Counter Timing/security can proceed.
        await drain();
        engine.optionResolutionDepth = 0;
        const remainingRulePending = await collectRuleProcessPending(engine);
        engine.pendingNestedTimingEffects.push(...remainingRulePending);
        await drain();
        // The ordering effect's own drain only sees its window's timing. An Option used inside
        // another effect (Planet Punch through EX12-077) can Arts Digivolve the attacker, and
        // that [When Digivolving] is parked in the nested pool; it still resolves before
        // Counter Timing and security.
        const offeredBeforeCounter = new Set(engine.pendingNestedTimingEffects);
        await drainPendingAttackTriggers(engine);
        // No declaration effect may become legal later during a block or battle.
        retirePendingAttackWatchers(engine);
        // Retire the exhausted parent remainder only after rule processing and every
        // declaration pool have finished; intermediate drains may enable its costs.
        if (options?.retireUnactivatable) {
          await drain(options);
          engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter(
            (pending) => !offeredBeforeCounter.has(pending),
          );
        }
      } finally {
        engine.effectResolutionDepth = pausedDepth;
        engine.optionResolutionDepth = pausedOptionDepth;
        engine.optionMainDepth = pausedOptionMainDepth;
      }
    },
    // Called only from inside `runAttackSteps`, where the depth is already 0, so
    // `flushDeferredTimingWindows`'s own depth guard passes. `activeWindowToken` is
    // deliberately left set: ending the ordering effect's window here would discard the
    // pending pools it still needs after combat (Q3944).
    settleBetweenAttackSteps: async () => {
      await settleBetweenEffects(engine);
      const parents = attackStepParents.at(-1);
      if (parents !== undefined)
        await resolveDerivedDuringAttackStep({ engine, olderWatchers: parents.watchers, olderNested: parents.nested });
    },
    runAttackSteps: async (body) => {
      // CR §11-1: an attack ordered by an effect interrupts that effect. Triggers arising in
      // Counter Timing, the block window, the battle and End of Attack each resolve as their
      // own windows before the attack advances; the ordering effect resumes only afterwards.
      // Without this pause `shouldDeferNestedTiming` parks every one of those triggers in the
      // nested pending pool, where nothing drains them until the attack is already over
      // (a defender's Blast Digivolve [When Digivolving] resolving after combat).
      const pausedDepth = engine.effectResolutionDepth;
      const pausedOptionDepth = engine.optionResolutionDepth;
      const pausedOptionMainDepth = engine.optionMainDepth;
      engine.effectResolutionDepth = 0;
      engine.optionResolutionDepth = 0;
      engine.optionMainDepth = 0;
      engine.attackStepPauseDepth += 1;
      attackStepParents.push({
        watchers: new Set(engine.pendingWindowSubTriggers),
        nested: new Set(engine.pendingNestedTimingEffects),
      });
      try {
        await flushDeferredTimingWindows(engine);
        await body();
        await settleBetweenEffects(engine);
      } finally {
        attackStepParents.pop();
        engine.attackStepPauseDepth -= 1;
        engine.effectResolutionDepth = pausedDepth;
        engine.optionResolutionDepth = pausedOptionDepth;
        engine.optionMainDepth = pausedOptionMainDepth;
      }
    },
    baseGrantedDigivolve: (seat, base, evolving, sourceZone) =>
      engine.digivolveSupport.matchBaseGrantedDigivolve(seat, base, evolving, sourceZone),
    emit: (event) => engine.hooks.emit(event),
    inSecurityCheck: () => engine.securityCheckDepth > 0,
    nextPermanentId: () => nextPermanentId(engine),
    nextInstanceId: () => nextInstanceId(engine),
    memory: engine.memory,
    modifiers: engine.modifiers,
    continuous: engine.continuous,
    subTriggers: engine.subTriggers,
    decoyCostPermanentIds: engine.decoyCostPermanentIds,
    securityDp: engine.securityDp,
    deletionMaxDp: engine.deletionMaxDp,
    dpDeleteBudget: engine.dpDeleteBudget,
    win: engine.win,
    fireTiming: (timing, trigger) => fireTiming(engine, timing, trigger),
    resolveDeletionReactions: (trigger, candidates, transientCandidates = []) =>
      resolveDeletionReactions(
        engine,
        trigger,
        candidates,
        (deletionTrigger, simultaneousPending = []) =>
          simultaneousPending.length > 0 || candidates.length > 0
            ? runTimingWindow(
                engine,
                EffectTiming.OnDestroyedAnyone,
                deletionTrigger,
                transientCandidates,
                simultaneousPending,
              )
            : fireTiming(engine, EffectTiming.OnDestroyedAnyone, deletionTrigger, transientCandidates),
        transientCandidates,
      ),
    prepareOptionUsed: (usedInstanceId, usedOptionCost) => prepareOptionUsed(engine, usedInstanceId, usedOptionCost),
    fireSubTrigger: (event, payload, sourceScope) => engine.fireSubTrigger(event, payload, sourceScope),
    trashTopSecurityForBarrier: (seat) => payBarrierSecurityCost(engine, seat, false),
    recomputeContinuousEffects: () => engine.recomputeContinuousEffects(),
    recomputeContinuousDerivedEffects: () => engine.recomputeContinuousDerivedEffects(),
    forgetCardUses: (instanceIds) => {
      for (const instanceId of instanceIds) engine.tracker.forgetInstance(instanceId);
    },
    processRulesBeforeWhenDigivolving: async () => {
      await engine.recomputeContinuousEffects();
      if (engine.ruleProcessing || engine.ruleTriggerPool !== undefined) {
        // A trash replacement is entered from the active rule pass. Run only the DP
        // movement processes: the outer pass owns the pooled reactions and its latch.
        await engine.ruleChecks.deleteZeroDpDigimon();
      } else {
        const pool = await collectRuleProcessMovements(engine);
        if (!engine.state.gameOver) await flushRuleTriggerPool(engine, pool);
      }
    },
    finalizeEffectPlayCost: async (
      instanceId,
      baseCost,
      useAsOption,
      originZone,
      projectOnly,
      simultaneousPlayCount,
      reservedInstanceIds,
    ) => {
      // A selected security card can still be face down in its origin zone.
      // Locate only engine instance; do not expose hidden security to timing scans.
      const instance =
        originZone === "security"
          ? Array.from(engine.state.players)
              .flatMap((player) => Array.from(player.security))
              .find((card) => card.instanceId === instanceId)
          : findLooseInstance(engine, instanceId);
      return instance === undefined
        ? baseCost
        : fireBeforePayCost(
            engine,
            instance,
            baseCost,
            useAsOption,
            originZone,
            projectOnly,
            simultaneousPlayCount,
            reservedInstanceIds,
          );
    },
    clearPreparedDigiXrosPlay: (instanceId) => clearPreparedDigiXrosPlay(engine, instanceId),
    placePendingPlayCosts: (instanceId, permanentId) =>
      playCardDeps(engine).placePendingDigivolution?.(instanceId, permanentId) ?? Promise.resolve(),
    preparedDigiXrosMaterials: (instanceId) => preparedDigiXrosMaterials(engine, instanceId),
    prepareDigiXrosPlay: (instanceId) => prepareDigiXrosPlay(engine, instanceId),
    prepareDigiXrosPlays: (instanceIds, simultaneousPlayCount) =>
      prepareDigiXrosPlays(engine, instanceIds, simultaneousPlayCount),
    playForKeywordEffect: (sourceInstanceId, instanceIds, opts) =>
      playForKeywordEffect(engine, sourceInstanceId, instanceIds, opts),
    payAlternatePlacement: async (seat, requirement, evolving) =>
      (await digivolveDeps(engine).payAlternatePlacement?.(engine.state, seat, requirement, evolving)) ?? true,
    finalizeEffectDigivolveCost: async (target, evolvingInstanceId, into, baseCost, baseAsDigimon, costDelta = 0) => {
      const deps = digivolveDeps(engine);
      const adjusted = deps.adjustedDigivolveCost?.(engine.state, target, baseCost, into, {
        consumeOnce: true,
        costDelta,
      });
      const passiveCost = adjusted ?? baseCost + costDelta;
      const interactiveReduction =
        (await deps.activateInteractiveDigivolveReduction?.(
          engine.state,
          target.controllerSeat,
          target,
          into,
          evolvingInstanceId,
          baseAsDigimon,
        )) ?? 0;
      return Math.max(0, passiveCost - interactiveReduction);
    },
    effectiveLooseUseCost: (instanceId, controllerSeat) => projectLooseUseCost(engine, instanceId, controllerSeat),
    inHandCost: (instanceId, controllerSeat) => projectInHandCost(engine, instanceId, controllerSeat),
    fireLinkEvent: async (instanceIds, targetPermanentId) => {
      const watcherTrigger = { subjectPermanentId: targetPermanentId, linkedCardInstanceIds: instanceIds };
      const fireWhenLinkingWindows = async (): Promise<void> => {
        for (const instanceId of instanceIds) {
          await fireTimingForInstance(engine, EffectTiming.OnLinking, instanceId, {
            subjectPermanentId: targetPermanentId,
            linkedInstanceIds: instanceIds,
          });
        }
      };
      // Inside a resolving effect both halves already wait in the enclosing pool together.
      if (shouldDeferNestedTiming(engine)) {
        await engine.fireSubTrigger("whenLinked", watcherTrigger);
        await fireWhenLinkingWindows();
        return;
      }
      // The host's watchers and the linked card's [When Linking] are simultaneous (Q4528):
      // an attack declared by either one pauses for the other before Counter Timing.
      await withPendingSubTriggers(engine, ["whenLinked"], watcherTrigger, fireWhenLinkingWindows, {
        onlyInitiallyArmed: true,
      });
    },
    resolveSelfWhenTrashedFromDeck: async (instanceId, byEffectCardId) => {
      const instance = findLooseInstance(engine, instanceId);
      if (instance === undefined) return;
      await resolveSelfWhenTrashedFromDeck(
        buildEffectContext(engine, cardSourceOf(engine, instance), {
          trashedFromDeckCardId: instance.cardId,
          trashedFromDeckInstanceId: instanceId,
          ...(byEffectCardId === undefined ? {} : { trashedFromDeckByEffectCardId: byEffectCardId }),
        }),
      );
    },
    dnaDigivolveMemoryGains: (materialPermanentIds, into) =>
      engine.subTriggers.dnaMemoryGainsFor(materialPermanentIds, into),
    fireDiscardedFromSecurity: async (instanceIds) => {
      for (const instanceId of instanceIds) {
        await fireTimingForInstance(engine, EffectTiming.OnDiscardSecurity, instanceId);
      }
    },
    reactivateOnPlay: (permanentId, opts) => reactivateOnPlay(engine, permanentId, opts),
    fireEnteredByEffect: (timing, instanceId, ownerSeat, opts) =>
      fireEnteredByEffectTiming(engine, timing, instanceId, ownerSeat, opts),
    fireWhenDigivolving: (seat, permanent, previousLevel, isDnaDigivolve) =>
      digivolveDeps(engine).fireWhenDigivolving!(
        engine.state,
        seat,
        permanent,
        previousLevel,
        undefined,
        isDnaDigivolve,
      ),
    prepareAppFusion: async (seat, target, result, into) => {
      const deps = digivolveDeps(engine);
      await deps.prepareDigivolveCost?.(engine.state, seat, target, result, into);
    },
    appFusionTargetAllowed: (seat, target, result) => {
      const deps = digivolveDeps(engine);
      return (
        deps.digivolveBaseRestricted?.(engine.state, target, result) !== true &&
        deps.digivolveIntoAllowed?.(engine.state, target, result) !== false
      );
    },
    fireWouldDigivolve: (seat, target, into) =>
      digivolveDeps(engine).fireWouldDigivolve!(engine.state, seat, target, into),
    consultLeavePrevention: (ids, cause, resolvingSeat, opts) =>
      engine.consultLeavePrevention(ids, cause, resolvingSeat, opts),
    interruptDigiXrosMaterialLeave: async (fieldPermanentIds, resolvingSeat) => {
      const prevented = await engine.consultLeavePrevention(fieldPermanentIds, "byEffect", resolvingSeat, {
        isDigiXros: true,
        isBounce: true,
      });
      return { prevented, triggered: takeLeaveReplacementPending(engine) };
    },
    resolveHeldTriggeredEffects: (effects) => runPendingTimingWindow(engine, effects),
    consultDigivolutionTrashRedirect: (ids) => engineConsultDigivolutionTrashRedirect(engine, ids),
    get combat() {
      return getCombat();
    },
    ask: {
      selectInstances: async (seat, candidateInstanceIds, min, max, promptText, provenance) => {
        const response = await engine.decisions.request({
          seat,
          kind: "selectCards",
          promptText,
          sourceCardId: provenance?.sourceCardId,
          sourceInstanceId: provenance?.sourceInstanceId,
          sourcePermanentId: provenance?.sourcePermanentId,
          options: {
            candidateInstanceIds,
            min,
            max,
            timing: provenance?.timing,
            effectText: provenance?.effectText,
            effectTextPart: provenance?.effectTextPart,
            effectTextEmphasis: provenance?.effectTextEmphasis,
            isInherited: provenance?.isInherited,
            selectionContext: provenance?.selectionContext,
            visibleInstanceIds: provenance?.visibleInstanceIds,
            ...(provenance?.selectionGoal === undefined ? {} : { selectionGoal: provenance.selectionGoal }),
          },
        });
        return response.kind === "selectCards" ? response.instanceIds : [];
      },
    },
    controllerSeat: () => engine.state.turnSeat,
    inContinuousPass: () => inContinuousPass(engine),
    inResolvingWindow: () => engine.activeWindowToken !== undefined,
    turnEndWindowSeat: () => engine.turnEndWindowSeat,
    oncePerTurnFired: (key) => engine.tracker.count(key, "replacement") > 0,
    markOncePerTurnFired: (key) => engine.tracker.register(key, "replacement"),
    noteLinked: (instanceIds) => {
      for (const instanceId of instanceIds) engine.justLinked.add(instanceId);
    },
  });
}
