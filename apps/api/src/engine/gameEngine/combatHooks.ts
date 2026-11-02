import { EffectDuration, EffectTiming, type CardInstance } from "@aegis/shared";
import { effectiveColorsOf } from "./matchLifecycle.js";
import { printedKeywordsOf, resolveKeywords } from "../combat/keywords.js";
import { permanentIdentityOf } from "#api/engine/effects/stack";
import { effectsOf } from "../effects/collect.js";
import type { CollectedEffect } from "../effects/collect.js";
import { engineRunSecurityCheck, payBarrierSecurityCost } from "./securityCheck.js";
import { counterEligibleSources } from "./intents.js";
import {
  combatTriggerInfo,
  fireTiming,
  fireTimingForPermanent,
  resolveDeletionReactions,
  runTimingWindow,
} from "./timing.js";
import {
  armedAsPendingCollected,
  armedSubTriggers,
  parkArmedForEnclosingWindow,
  prepareFrozenSubTrigger,
  prepareSubTrigger,
  withPendingSubTriggers,
} from "./subTriggers.js";
import {
  collectNestedTimingEffects,
  deferNestedTimingEffects,
  shouldDeferNestedTiming,
  takeLeaveReplacementPending,
} from "#api/engine/gameEngine/windows";
import { runPendingTimingWindow } from "#api/engine/gameEngine/timing/fire";
import { collectPermanentInstances, listCandidateInstances, ruleProcess } from "#api/engine/gameEngine/ruleProcess";
import { cardSourceOf, dropPermanentSubscriptions } from "./effectContext.js";
import { beginBattleScope, endBattleScope, sweepBattleDurations, sweepCombatDurations } from "./turnFlow.js";
import type { GameEngine } from "../GameEngine.js";
import type { CombatHooks } from "../combat/types.js";
import { fireBlockTiming } from "#api/engine/gameEngine/fireBlockTiming";

/**
 * The combat controller's hook seam: everything CombatController calls back into the engine
 * for. Built once in the constructor, BEFORE `engine.combat` exists -- every hook is an
 * arrow read at call time, so a hook that reaches `engine.combat` is still correct.
 */
export function buildCombatHooks(engine: GameEngine): CombatHooks {
  return {
    emit: engine.hooks.emit,
    // Forward the FULL combat trigger so "when engine blocks" / "when engine deletes in
    // battle" watchers read the right ids (previously only deletedPermanentId survived).
    fireTiming: async (timing, trigger) => {
      // [When Attacking] must be scoped to the attacking permanent only — a global fire
      // would collect every permanent's [When Attacking] effect, including the opponent's,
      // on any attack. The `attackerPermanentId` is always present in a CombatTrigger.
      if (
        (timing === EffectTiming.OnUseAttack || timing === EffectTiming.OnBattleDeleteOpponent) &&
        trigger.attackerPermanentId !== undefined
      ) {
        const att = engine.access.permanentById(trigger.attackerPermanentId);
        if (att !== undefined) {
          await fireTimingForPermanent(engine, timing, att, combatTriggerInfo(engine, trigger));
          return;
        }
      }
      await fireTiming(engine, timing, {
        subjectPermanentId: trigger.subjectPermanentId,
        suspendedPermanentId: trigger.suspendedPermanentId,
        ...combatTriggerInfo(engine, trigger),
      });
    },
    fireAttackTiming: async (trigger, allianceCount, opts = {}) => {
      const includeSubTriggers = opts.includeSubTriggers === true;
      const attacker =
        trigger.attackerPermanentId === undefined
          ? undefined
          : engine.access.permanentById(trigger.attackerPermanentId);
      const top = attacker?.topCard;
      if (attacker === undefined || top === undefined) {
        await fireTiming(engine, EffectTiming.OnUseAttack, combatTriggerInfo(engine, trigger));
        return { allianceResolvedInWindow: false, raidResolvedInWindow: false, subTriggersResolvedInWindow: false };
      }
      // Attack declaration opens several trigger channels as one event. Bring continuous
      // watchers up to date before capturing any channel so every resident source is judged
      // from the same event-time board snapshot.
      await engine.recomputeContinuousEffects();
      // Each ＜Alliance＞ instance enters the attacker's [When Attacking] window as one more
      // simultaneous trigger, so the controller orders it against the printed effects instead
      // of always resolving it last (Q5257). Distinct effectKeys keep the two instances
      // independent in the resolver's `resolved` ledger; each is optional and may be declined
      // on its own. `resolveAllianceEffect` re-reads the board when it runs, so an instance
      // ordered after a derived On Play / DNA evolution sees the post-evolution allies.
      const gainedAllianceCount = engine.continuous.gainedKeywordCount(attacker.permanentId, "Alliance");
      const allianceSource = cardSourceOf(engine, top);
      const gainedKeywordSource = {
        ...allianceSource,
        gainedOnPermanentId: attacker.permanentId,
        permanent: () => engine.access.permanentById(attacker.permanentId),
        isOnBattleArea: () => engine.access.permanentById(attacker.permanentId)?.inBreeding === false,
      };
      const retainedAllianceGrants = engine.continuous.captureContinuousKeywordGrantsFromOtherSources(
        attacker.permanentId,
        "Alliance",
        top.instanceId,
      );
      const retainedAllianceGrantAt = (index: number) => retainedAllianceGrants[index - gainedAllianceCount];
      const allianceEffects: CollectedEffect[] = Array.from({ length: allianceCount }, (_, index) => ({
        source:
          index < gainedAllianceCount || retainedAllianceGrantAt(index) !== undefined
            ? gainedKeywordSource
            : allianceSource,
        timing: EffectTiming.OnUseAttack,
        effect: {
          effectKey: `${top.instanceId}/alliance/${index}`,
          description:
            "＜Alliance＞: By suspending 1 of your other Digimon, this Digimon gets that Digimon's DP and ＜Security A. +1＞.",
          // Not `optional`: the ally prompt itself carries the decline (a null response),
          // exactly as the legacy path does. Marking it optional would insert a second,
          // separate "use engine effect?" decision that ＜Alliance＞ does not have. The
          // "by suspending" clause still lets the effect order offer a Yes/No preset.
          optional: false,
          isInherited: false,
          isSecurity: false,
          isLinked: false,
          maxPerTurn: -1,
          canTrigger: () => true,
          // ＜Alliance＞ TRIGGERS with the attack whether or not an ally is available right
          // now (CR §15-4): it takes its place in the ordered set, and the controller may
          // put it after an effect that first creates the ally. `resolveAllianceEffect`
          // re-reads the board and does nothing when no ally is there at resolution time.
          canActivate: () =>
            index < gainedAllianceCount
              ? engine.continuous.gainedKeywordCount(attacker.permanentId, "Alliance") > index
              : (retainedAllianceGrantAt(index)?.() ?? true),
          resolve: async (ctx) => engine.combat.resolveAllianceEffect(attacker.permanentId, ctx.presetOptionalAnswer),
        },
      }));
      // ＜Raid＞ is one more simultaneous [When Attacking] trigger: the controller orders it
      // against the printed effects (Q4926, Q5444), and the opponent's [Opponent's Turn]
      // redirect waits for it under turn-player priority (Q2118). `resolveRaidEffect`
      // re-checks the keyword, so an attacker that lost it meanwhile does nothing (Q5444).
      // The single Raid choice may also be backed by inherited/continuous or gained
      // copies. Keep only copies present at declaration: a newly revealed printed
      // Raid cannot replace Omnimon's discarded pending copy (§15-4-4-3/4).
      const retainsRaidGrant = engine.continuous.capturePendingKeywordGrants(attacker.permanentId, "Raid");
      let pendingPrintedRaid = printedKeywordsOf(allianceSource.definition.effectText).includes("Raid");
      const retainsDeclaredRaid = () => {
        pendingPrintedRaid &&=
          engine.access.permanentById(attacker.permanentId)?.topCard?.instanceId === top.instanceId;
        const grantRetained = retainsRaidGrant?.() === true;
        return pendingPrintedRaid || grantRetained;
      };
      const raidEffects: CollectedEffect[] =
        opts.raidTriggered === true
          ? [
              {
                source: retainsRaidGrant !== undefined ? gainedKeywordSource : cardSourceOf(engine, top),
                timing: EffectTiming.OnUseAttack,
                effect: {
                  effectKey: `${top.instanceId}/keyword/Raid`,
                  description:
                    "＜Raid＞: You may switch the attack target to the opponent's highest-DP unsuspended Digimon.",
                  // Not `optional`: the target prompt itself carries the decline, as with ＜Alliance＞.
                  // The "may" clause still lets the effect order offer a Yes/No preset.
                  optional: false,
                  isInherited: false,
                  isSecurity: false,
                  isLinked: false,
                  maxPerTurn: -1,
                  canTrigger: () => true,
                  canActivate: () => retainsDeclaredRaid() && engine.combat.canResolveRaid(attacker.permanentId),
                  announce: () => engine.combat.hasRaidTarget(attacker.permanentId),
                  resolve: async (ctx) =>
                    engine.combat.resolveRaidEffect(attacker.permanentId, ctx.presetOptionalAnswer),
                },
              },
            ]
          : [];
      const attackPayload = opts.subTriggerPayload ?? combatTriggerInfo(engine, trigger);
      const suspensionPayload =
        opts.suspendedPermanentId === undefined
          ? undefined
          : {
              ...attackPayload,
              subjectPermanentId: opts.suspendedPermanentId,
              suspendedPermanentId: opts.suspendedPermanentId,
            };
      const attackCandidates = listCandidateInstances(engine);
      const allyAttackEffects = collectNestedTimingEffects(
        engine,
        EffectTiming.OnAllyAttack,
        { ...attackPayload, ...(suspensionPayload ?? {}) },
        attackCandidates,
      );
      // Suspending the attacker and declaring the attack are the same game event. Effects
      // triggered by either part share one activation order (§11-2-8, §15-4-3), including
      // [On Tapped] timing effects and the `whenSuspended` watcher bus.
      const suspensionEffects =
        suspensionPayload === undefined
          ? []
          : collectNestedTimingEffects(engine, EffectTiming.OnTappedAnyone, suspensionPayload, attackCandidates);
      const pendingAttackEffects = [...allyAttackEffects, ...suspensionEffects, ...allianceEffects, ...raidEffects];
      if (shouldDeferNestedTiming(engine)) {
        // An effect-directed declaration joins its enclosing pool. Keyword instances
        // must join the printed effects too, so the controller can order Alliance after
        // an effect that creates its ally (Q5257).
        for (const effect of pendingAttackEffects) {
          const entry = {
            ...effect,
            triggerInfo: effect.triggerInfo ?? attackPayload,
            activationIdentity: attackPayload,
          };
          entry.sourceIdentityAtDefer = permanentIdentityOf(entry.source) ?? null;
          engine.pendingNestedTimingEffects.push(entry);
        }
        await fireTimingForPermanent(engine, EffectTiming.OnUseAttack, attacker, attackPayload);
        if (includeSubTriggers) {
          for (const event of suspensionPayload === undefined
            ? (["whenAttacking", "whenOpponentAttacks"] as const)
            : (["whenSuspended", "whenAttacking", "whenOpponentAttacks"] as const)) {
            parkArmedForEnclosingWindow(
              engine,
              armedSubTriggers(engine, engine.subTriggers.subscriptionsFor(event), {
                ...attackPayload,
                ...(suspensionPayload ?? {}),
              }),
            );
          }
        }
        return {
          allianceResolvedInWindow: allianceCount > 0,
          raidResolvedInWindow: raidEffects.length > 0,
          subTriggersResolvedInWindow: includeSubTriggers,
        };
      }
      const timingWindow = async () =>
        fireTimingForPermanent(engine, EffectTiming.OnUseAttack, attacker, attackPayload, pendingAttackEffects);
      const subTriggerPayload = opts.subTriggerPayload ?? combatTriggerInfo(engine, trigger);
      if (includeSubTriggers) {
        await withPendingSubTriggers(
          engine,
          suspensionPayload === undefined
            ? ["whenAttacking", "whenOpponentAttacks"]
            : ["whenSuspended", "whenAttacking", "whenOpponentAttacks"],
          suspensionPayload === undefined ? subTriggerPayload : { ...subTriggerPayload, ...suspensionPayload },
          timingWindow,
          {
            onlyInitiallyArmed: true,
            busTrigger: () =>
              suspensionPayload === undefined ? subTriggerPayload : { ...subTriggerPayload, ...suspensionPayload },
          },
        );
      } else {
        await timingWindow();
      }
      return {
        allianceResolvedInWindow: allianceCount > 0,
        raidResolvedInWindow: raidEffects.length > 0,
        subTriggersResolvedInWindow: includeSubTriggers,
      };
    },
    fireSubTrigger: async (event, payload) => engine.fireSubTrigger(event, payload),
    prepareSubTrigger: (event, payload) => prepareSubTrigger(engine, event, payload),
    armedSubTriggerCount: (event, payload) =>
      armedSubTriggers(engine, engine.subTriggers.subscriptionsFor(event), payload).length,
    withPendingAttackSubTriggers: (payload, runWindows) =>
      withPendingSubTriggers(engine, ["whenAttacking", "whenOpponentAttacks"], payload, runWindows, {
        onlyInitiallyArmed: true,
      }),
    withPendingSuspensionSubTriggers: (payload, runWindows) =>
      withPendingSubTriggers(engine, ["whenSuspended"], payload, runWindows, { onlyInitiallyArmed: true }),
    fireBlockTiming: (block) => fireBlockTiming(engine, block),
    prepareFrozenSubTrigger: (event, payload) => prepareFrozenSubTrigger(engine, event, payload),
    refreshContinuousEffects: () => engine.recomputeContinuousEffects(),
    resolveDeletionReactions: async (trigger, candidates, transientCandidates = []) => {
      const winner =
        trigger.deletingPermanentId === undefined
          ? undefined
          : engine.access.permanentById(trigger.deletingPermanentId);
      if (winner !== undefined) {
        // Battle victory and deletion reactions trigger together. Snapshot the winner's
        // printed effects before the turn player chooses their shared resolution order.
        const scoped: CardInstance[] = [];
        collectPermanentInstances(engine, winner, scoped);
        deferNestedTimingEffects(
          engine,
          EffectTiming.OnBattleDeleteOpponent,
          {
            ...combatTriggerInfo(engine, trigger),
            attackerPermanentId: winner.permanentId,
          },
          scoped,
        );
      }
      await resolveDeletionReactions(
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
      );
    },
    effectiveColorsOf: (permanentId) => {
      const permanent = engine.access.permanentById(permanentId);
      return permanent === undefined ? [] : effectiveColorsOf(engine, permanent);
    },
    keywordReactionsInLeavePrevention: true,
    consultLeavePrevention: async (permanentIds, opts) => {
      return engine.consultLeavePrevention(permanentIds, "byBattle", undefined, {
        ...opts,
        holdTriggered: true,
      });
    },
    resolveAvertedBattleReactions: async (resolveBattleWon) => {
      const triggered = takeLeaveReplacementPending(engine);
      if (triggered.length === 0) {
        await resolveBattleWon?.();
        return;
      }
      if (shouldDeferNestedTiming(engine)) {
        engine.pendingNestedTimingEffects.push(...triggered);
        await resolveBattleWon?.();
        return;
      }
      await resolveBattleWon?.({ deferIntoDeletionWindow: true });
      const battleWon = engine.pendingBattleWonSubTriggers.splice(0);
      await runPendingTimingWindow(engine, [...armedAsPendingCollected(engine, battleWon), ...triggered]);
    },
    dropPermanentSubscriptions: (permanentId) => dropPermanentSubscriptions(engine, permanentId),
    snapshotCustomEffectGrants: (departingInstanceIds) =>
      engine.continuous.listCustomEffectGrants().map((grant) => {
        if (!departingInstanceIds.includes(grant.instanceId)) return grant;
        const activeAtDeletion = grant.isActive?.() ?? true;
        return { ...grant, isActive: () => activeAtDeletion };
      }),
    snapshotStackEffectConferrals: () => [...engine.continuous.listStackEffectConferrals()],
    checkSecurity: async (defenderSeat, attackerPermanentId, reason, options) =>
      engineRunSecurityCheck(engine, defenderSeat, attackerPermanentId, reason, options),
    // The pierce read seam: combat consults both the temporary modifier ledger and
    // the resolved printed/continuous keyword state. Printed ＜Piercing＞ lives in the
    // latter; only effect-granted, battle-scoped Piercing lives in the former.
    hasPierce: (permanentId) =>
      engine.modifiers.hasPierce(permanentId) ||
      (() => {
        const permanent = engine.access.permanentById(permanentId);
        return permanent !== undefined && resolveKeywords(permanent, engine.continuous).includes("Piercing");
      })(),
    addDpModifier: (permanentId, delta) =>
      engine.modifiers.addDpModifier(engine.state, permanentId, delta, EffectDuration.UntilEndAttack),
    addSecurityAttack: (permanentId) =>
      engine.continuous.addKeywordGrant(permanentId, "SecurityAttack", EffectDuration.UntilEndAttack, 1),
    trashTopSecurityForBarrier: (seat, isAttackBattle) => payBarrierSecurityCost(engine, seat, isAttackBattle),
    sweepEndOfAttack: () => sweepCombatDurations(engine),
    afterAttackEnded: async () => {
      if (
        engine.activeWindowToken !== undefined ||
        engine.effectResolutionDepth > 0 ||
        engine.optionResolutionDepth > 0 ||
        engine.optionMainDepth > 0
      )
        return;
      await ruleProcess(engine);
    },
    deferEndOfAttack: (trigger) => {
      if (engine.activeWindowToken === undefined) return undefined;
      const endOfAttackWindow = {
        timing: EffectTiming.OnEndAttack,
        trigger: {
          subjectPermanentId: trigger.subjectPermanentId,
          suspendedPermanentId: trigger.suspendedPermanentId,
          ...combatTriggerInfo(engine, trigger),
        },
        transientCandidates: [],
      };
      engine.deferredTimingWindows.push(endOfAttackWindow);
      return () => {
        const index = engine.deferredTimingWindows.indexOf(endOfAttackWindow);
        if (index < 0) return false;
        engine.deferredTimingWindows.splice(index, 1);
        return true;
      };
    },
    beginBattleScope: () => beginBattleScope(engine),
    sweepEndOfBattle: (scopeId) => sweepBattleDurations(engine, scopeId),
    endBattleScope: (scopeId) => endBattleScope(engine, scopeId),
    recomputeBattleEffects: () => engine.recomputeContinuousEffects(),
    continuous: engine.continuous,
    hasKeyword: (permanentId, keyword) => {
      const permanent = engine.access.permanentById(permanentId);
      return permanent !== undefined && resolveKeywords(permanent, engine.continuous).includes(keyword);
    },
    // Q5257: ＜Alliance＞ printed twice on the same Digimon (typically once on the top card
    // and once inherited from a digivolution source) is TWO independent keywords, each
    // suspending its own ally for its own DP/security benefit. A printed keyword reaches the
    // permanent as one continuous grant per granting effect, so the grants ARE the instances;
    // the fallback covers a permanent that has the keyword through some path that leaves no
    // countable grant, which is always a single instance.
    allianceCount: (permanentId) => {
      const permanent = engine.access.permanentById(permanentId);
      if (permanent?.topCard === undefined) return 0;
      const granted = engine.continuous
        .grantedKeywords(permanentId)
        .filter((grant) => grant.keyword === "Alliance").length;
      if (granted > 0) return granted;
      return resolveKeywords(permanent, engine.continuous).includes("Alliance") ? 1 : 0;
    },
    combineAllianceTiming: (permanentId) => {
      const permanent = engine.access.permanentById(permanentId);
      if (permanent?.topCard === undefined) return false;
      // An inherited [When Attacking] effect is as simultaneous with ＜Alliance＞ as a printed
      // one (Q5257), so the digivolution cards and link cards count too. Reading only the top
      // card left an attacker whose sole When Attacking effect is inherited on the legacy
      // path, where Alliance always resolved last and could never be ordered against it.
      return [permanent.topCard, ...permanent.stack, ...permanent.linked].some(
        (card) => effectsOf(EffectTiming.OnUseAttack, cardSourceOf(engine, card)).length > 0,
      );
    },
    // Shared "pick one of these, or pass" decision channel for ＜Raid＞'s redirect choice and
    // ＜Scapegoat＞'s sacrifice choice (both battle-path consumers of combat/controller.ts) —
    // the same generic selectCards decision `ask.selectInstances` uses in primitives.ts, so no
    // bespoke per-keyword protocol intent is needed.
    selectOptionalInstance: async (seat, candidateInstanceIds, promptText, source, selectionGoal) => {
      if (candidateInstanceIds.length === 0) return undefined;
      const response = await engine.decisions.request({
        seat,
        kind: "selectCards",
        promptText,
        ...source,
        options: { candidateInstanceIds, min: 0, max: 1, ...(selectionGoal === undefined ? {} : { selectionGoal }) },
      });
      return response.kind === "selectCards" ? response.instanceIds[0] : undefined;
    },
    // ＜Fragment＞'s "choose exactly N, or decline" cost decision (§16-37): the same
    // selectCards decision channel as selectOptionalInstance, but requiring the full count
    // (a partial pick reads as a decline — no partial trash).
    selectOptionalInstances: async (seat, candidateInstanceIds, count, promptText, source, selectionGoal) => {
      if (candidateInstanceIds.length < count) return undefined;
      const response = await engine.decisions.request({
        seat,
        kind: "selectCards",
        promptText,
        ...source,
        options: {
          candidateInstanceIds,
          min: 0,
          max: count,
          ...(selectionGoal === undefined ? {} : { selectionGoal }),
        },
      });
      if (response.kind !== "selectCards") return undefined;
      return response.instanceIds.length === count ? response.instanceIds : undefined;
    },
    armorPurge: async (permanentId) => {
      await engine.primitives.armorPurge(permanentId);
    },
    trashDigivolutionCards: async (hostPermanentId, instanceIds, provenance) => {
      await engine.primitives.trashDigivolutionCards(hostPermanentId, instanceIds, provenance);
    },
    ascendToSecurity: async (instanceId) => {
      await engine.primitives.ascendToSecurity(instanceId);
    },
    materialSave: async (permanentId) => {
      await engine.primitives.materialSave(permanentId);
    },
    // §11-3 Counter Timing: whether the defending seat has anything to activate,
    // so `runCounterWindow` can skip the round trip when nothing is eligible.
    counterEligible: (seat) => counterEligibleSources(engine, seat),
  };
}
