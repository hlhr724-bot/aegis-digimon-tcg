import { MatchedTriggerHistory } from "#api/engine/effects/interpreter/subtriggers/MatchedTriggerHistory";
import { createSubTriggerInstall } from "#api/engine/effects/interpreter/subtriggers/createSubTriggerInstall";
import { trackSubTriggerInstallCallbacks } from "#api/engine/effects/interpreter/subtriggers/trackSubTriggerInstallCallbacks";
import { getDecisionEffectSummary } from "#api/engine/effects/interpreter/getDecisionEffectSummary";

// Arming a watcher that fires on a later game event.

import { effectProvenanceKinds } from "../../effectProvenance.js";
import type { EffectContext, SubTriggerEventName } from "../../EffectContext.js";

import { runAction } from "../dispatch.js";

import { unsupported } from "../errors.js";
import { quotedGrantedClause, soleLinkingClause, triggerLabel } from "../describe.js";

import { resolvePermanentTargets } from "../targeting/permanents.js";

import { Phase } from "@aegis/shared";
import type { Action } from "@aegis/shared";

import { subscribeLaterEntrants } from "./laterEntrants.js";

export const SUBTRIGGER_EVENT_MAP: Record<string, SubTriggerEventName | undefined> = {
  whenAttacking: "whenAttacking",
  whenOpponentAttacks: "whenOpponentAttacks",
  whenBlocked: "whenBlocked",
  whenBlockerActivated: "whenBlockerActivated",
  // Fired when an in-flight attack's target is redirected (＜Raid＞ / RedirectAttack).
  // The attacker is the event subject; a watcher gates on it via sourceFilter isSelfRef.
  whenAttackTargetSwitched: "whenAttackTargetSwitched",
  whenAttackTargetChanged: "whenAttackTargetSwitched",
  whenAttackTargetChanges: "whenAttackTargetSwitched",
  whenAttackTargetsChange: "whenAttackTargetSwitched",
  whenAttackTargetSwitch: "whenAttackTargetSwitched",
  whenSuspended: "whenSuspended",
  whenUnsuspended: "whenUnsuspended",
  // "whenUnsuspends" is a duplicate spelling introduced by earlier hand-fixed IR (BT24-028,
  // BT25-060). Canonical name is "whenUnsuspended" (matches the `whenSuspended` sibling's
  // tense); the two card files are normalized to it, but the map keeps this alias so any
  // other raw IR carrying the variant spelling still resolves instead of hitting
  // `unsupported()`.
  whenUnsuspends: "whenUnsuspended",
  whenBattleWon: "whenBattleWon",
  whenDeletesInBattle: "whenDeletesInBattle",
  whenOneOfYoursDigivolves: "whenOneOfYoursDigivolves",
  whenAnyDigivolves: "whenAnyDigivolves",
  whenHatch: "whenHatch",
  whenMovedFromBreeding: "whenMovedFromBreeding",
  whenOpponentMovedFromBreeding: "whenOpponentMovedFromBreeding",
  onDeletionOf: "onDeletionOf",
  // GainTriggeredEffect uses printed timing names, while the deletion bus uses the
  // event-shaped spelling. Both describe the same deleted-permanent payload.
  OnDeletion: "onDeletionOf",
  whenSecurityRemoved: "whenSecurityRemoved",
  whenCardTrashedFromSecurity: "whenCardTrashedFromSecurity",
  whenEffectTrashesFromSecurity: "whenEffectTrashesFromSecurity",
  whenSecurityBattleEnded: "whenSecurityBattleEnded",
  // Alias used by the ST15 hand-authored module; both spellings share the
  // same security-removal payload and fire sites.
  whenSecurityCardRemoved: "whenSecurityRemoved",
  whenEffectRemovesFromSecurity: "whenEffectRemovesFromSecurity",
  whenAddSecurity: "whenAddSecurity",
  whenFaceUpCardsAddedToOpponentSecurity: "whenFaceUpCardsAddedToOpponentSecurity",
  onAddDigivolutionCards: "onAddDigivolutionCards",
  whenPlayed: "whenPlayed",
  whenOptionPlayed: "whenOptionPlayed",
  whenOptionInBattleAreaTrashed: "whenOptionInBattleAreaTrashed",
  // Legacy wording for a deletion-driven watcher. The deletion seam carries the
  // same subject permanent payload and source filters still narrow it precisely.
  whenEffectDeletes: "onDeletionOf",
  // Parser wording for "place [Option] in the battle area". The placement primitive emits
  // `whenOptionPlayed` as the canonical engine event (distinct from using its [Main] effect).
  whenPlacedInBattleArea: "whenOptionPlayed",
  whenLeavesPlay: "whenLeavesPlay",
  whenLinked: "whenLinked",
  whenLinkTrashed: "whenLinkTrashed",
  whenDigivolutionTrashed: "whenDigivolutionTrashed",
  whenDigimonTopTrashed: "whenDigimonTopTrashed",
  onDigivolutionCardDiscarded: "onDigivolutionCardDiscarded",
  onDigivolutionCardsDiscardedBatch: "onDigivolutionCardsDiscardedBatch",
  onDigiBurstCardDiscarded: "onDigiBurstCardDiscarded",
  onDigivolutionCardReturnToDeckBottom: "onDigivolutionCardReturnToDeckBottom",
  whenTrashedFromHand: "whenTrashedFromHand",
  whenHandTrashed: "whenHandTrashed",
  onDiscardLibrary: "onDiscardLibrary",
  whenOptionUsed: "whenOptionUsed",
  whenEffectAddsToHand: "whenEffectAddsToHand",
  whenEffectAddsToOpponentHand: "whenEffectAddsToOpponentHand",
  whenEffectAddsToDeck: "whenEffectAddsToDeck",
  whenCardReturnsFromTrashToHand: "whenCardReturnsFromTrashToHand",
  whenCardReturnsFromTrashToDeck: "whenCardReturnsFromTrashToDeck",
  whenDigimonReturnsToHand: "whenDigimonReturnsToHand",
  whenEffectSuspends: "whenEffectSuspends",
  whenOpponentDraws: "whenOpponentDraws",
  // ＜Delay＞ watcher event (BT19-099): "when one of your Millenniummon would leave the battle
  // area". Maps to whenLeavesPlay; sourceFilter on the SubTrigger restricts the leaving Digimon.
  whenDigimonWouldLeave: "whenLeavesPlay",
  startOfYourMainPhase: "startOfYourMainPhase",
  // GainTriggeredEffect in card IR may encode the trigger with a capital 'S' (runtime record output).
  StartOfYourMainPhase: "startOfYourMainPhase",
  // A gained printed [End of Your Turn] clause uses the same live end-of-turn bus as
  // hand-authored EndOfYourTurn effects; runGainTriggeredEffect adds the granted owner's
  // turn/battle-area gate below so it cannot fire on the granter's turn (EX10-058, Q5159).
  EndOfYourTurn: "endOfTurn",
  endOfTurn: "endOfTurn",
  endOfOpponentTurn: "endOfOpponentTurn",
  // "When [matching Digimon] WOULD BE returned to hand/deck" — fires before the return executes.
  // sourceFilter.returnDestination optionally restricts which destinations arm the watcher (CAP-C-11).
  wouldBeReturned: "wouldBeReturned",
  // "When [this card] is trashed by an effect [while in the battle area]" (BT19-093; CAP-E8).
  whenTrashedByEffect: "whenTrashedByEffect",
  // "When this card is trashed from the deck" (BT19-097; CAP-H-01). Fires per milled card;
  // sourceFilter.isSelfRef gates on the milled card ID matching the watcher's source card ID.
  whenTrashedFromDeck: "whenTrashedFromDeck",
  // "When your Digimon checks a face-up security card" (BT20-055; CAP-H-03). Fires at
  // security-check time when the revealed card was already face-up before the check.
  whenCheckedFaceUpSecurity: "whenCheckedFaceUpSecurity",
};

/**
 * Install a delayed/triggered sub-effect on the engine's sub-trigger bus. The body
 * runs the sub-effect's actions when the engine fires the matching event. A "raw"
 * event (one the parser could not classify) is a loud gap.
 */
export async function runSubTrigger(
  ctx: EffectContext,
  action: Extract<Action, { kind: "SubTrigger" }>,
): Promise<void> {
  const event = SUBTRIGGER_EVENT_MAP[action.event];
  if (event === undefined) {
    unsupported(ctx, action, `SubTrigger event "${action.event}" is not a known game event`);
    return;
  }
  // The watcher anchors on the SOURCE by default ("when THIS Digimon attacks"). When the
  // clause grants the trigger to a CHOSEN OTHER permanent ("give 1 of your opponent's
  // Digimon '[Start of Your Main Phase] This Digimon attacks'", documented behavior), `action.on`
  // resolves to that permanent and the watcher is installed on IT — so the sub-effect's
  // "this Digimon" / controller scope resolve to the GRANTED permanent, not the granter.
  const playerScoped = action.playerScoped === true;
  if (playerScoped && action.on !== undefined) {
    unsupported(ctx, action, "player-scoped SubTrigger cannot also target a permanent anchor");
    return;
  }
  const self = ctx.source.permanent();
  const isLinkedSource = self?.linked?.some((card) => card.instanceId === ctx.source.instanceId) === true;
  const isInheritedSource =
    !isLinkedSource && self?.stack?.some((card) => card.instanceId === ctx.source.instanceId) === true;
  const printedWatcherClause =
    action.printedClause ??
    (action.raw?.startsWith("[") === true ? action.raw : undefined) ??
    (isLinkedSource && event === "whenLinked" ? soleLinkingClause(ctx.source.definition.linkEffect) : undefined);
  const printedTiming =
    isLinkedSource && event === "whenLinked" && soleLinkingClause(printedWatcherClause) !== undefined
      ? "WhenLinking"
      : ctx.activeTiming;
  let anchorPermanentId = playerScoped ? undefined : self?.permanentId;
  let expiresOnTurnEndOf: typeof ctx.source.ownerSeat | undefined;
  if (action.on !== undefined) {
    // Q6740: a granted trigger can be given to a permanent that is currently unaffected by
    // effects; grantedEffectAffectableGate suppresses it at fire time instead. Mirrors
    // runGainTriggeredEffect, which already preserves the selection.
    const targetIds = await resolvePermanentTargets(ctx, action.on, { preserveUnaffectableSelection: true });
    const grantTo = targetIds[0];
    if (grantTo === undefined) return; // no eligible permanent chosen => nothing is granted
    anchorPermanentId = grantTo;
    // A granted watcher with an until-owner-turn-end lifecycle
    // expires when the GRANTED permanent's owner's turn ends. The duration ref names the
    // window relative to the granter; `untilOpponentTurnEnd` (the opponent's turn end) is the
    // owner's-turn-end of the chosen opponent permanent.
    if (action.duration === "untilOpponentTurnEnd" || action.duration === "untilYourTurnEnd") {
      const granted = ctx.game.permanentById(grantTo);
      if (granted !== undefined) expiresOnTurnEndOf = granted.controllerSeat;
    }
  }
  if (playerScoped) {
    if (action.duration === "untilOpponentTurnEnd" || action.duration === "endOfOpponentTurn") {
      expiresOnTurnEndOf = ctx.game.opponentOf(ctx.source.ownerSeat);
    } else if (action.duration === "untilYourTurnEnd") {
      expiresOnTurnEndOf = ctx.source.ownerSeat;
    } else if (action.duration === "forTheTurn") {
      expiresOnTurnEndOf = ctx.source.ownerSeat;
    } else {
      unsupported(ctx, action, "player-scoped SubTrigger requires a turn-end duration");
      return;
    }
  }
  const params = {
    ctx,
    action,
    event,
    playerScoped,
    isLinkedSource,
    isInheritedSource,
    printedWatcherClause,
    printedTiming,
    anchorPermanentId,
    expiresOnTurnEndOf,
    matchedEvents: new MatchedTriggerHistory(),
    sourceSelfInstanceId: ctx.source.instanceId,
    bindsPrintedSource:
      action.on === undefined ||
      (ctx.continuousPass === true && (action.on.isSelf === true || action.on.filter?.isSelfRef === true)),
    linkedSelfSourceAtInstall:
      ctx.source.permanent()?.linked?.some((card) => card.instanceId === ctx.source.instanceId) === true,
  };
  const install = createSubTriggerInstall(params);
  trackSubTriggerInstallCallbacks({ params, install });
  ctx.fx.subscribeSubTrigger(install);
}

/**
 * Grant a triggered effect to a chosen permanent (CAP-C-16, BT21-077).
 *
 * Resolves the target permanent(s) from the action, then installs a SubTrigger watcher
 * anchored on EACH granted permanent so that "this Digimon" / controller scope inside the
 * `gainedActions` body resolve to the GRANTED permanent (not the granter). The watcher fires
 * when `gainedTrigger` matches a live SubTrigger bus event.
 *
 * Duration: `untilOpponentTurnEnd` expires at the end of the granted permanent's controller's
 * own turn (the granter's opponent's turn end = the OPPONENT Digimon owner's turn end).
 * The `expiresOnTurnEndOf` field on the watcher handles the sweep.
 *
 * "StartOfYourMainPhase" maps to `startOfYourMainPhase` via SUBTRIGGER_EVENT_MAP, which is
 * already fired by GameEngine at `OnStartMainPhase`. The `ownerMainPhaseGate` inside the
 * existing SubTrigger machinery restricts it to the granted permanent's owner's phase.
 */
export async function runGainTriggeredEffect(
  ctx: EffectContext,
  action: Extract<Action, { kind: "GainTriggeredEffect" }>,
): Promise<void> {
  const event = SUBTRIGGER_EVENT_MAP[action.gainedTrigger];
  const sourceFilter = action.sourceFilter;
  if (event === undefined) {
    unsupported(
      ctx,
      action,
      `GainTriggeredEffect gainedTrigger "${action.gainedTrigger}" is not a known SubTrigger event`,
    );
    return;
  }
  const targetIds = await resolvePermanentTargets(ctx, action.target, { preserveUnaffectableSelection: true });
  const attacksAtStartOfMainPhase =
    action.gainedTrigger === "StartOfYourMainPhase" && action.gainedActions.some((gained) => gained.kind === "Attack");
  const forcedAttackClause = "[Start of Your Main Phase] This Digimon attacks.";
  const grantingSeat = ctx.source.ownerSeat;
  const grantingKinds = (ctx.effectSourceKinds ?? effectProvenanceKinds(ctx)).filter(
    (kind) => kind === "Digimon" || kind === "Option",
  );
  const arm = (targetPermanentId: string): void => {
    const anchorPermanentId = targetPermanentId;
    const grantedPerm = ctx.game.permanentById(targetPermanentId);
    if (grantedPerm === undefined) return;
    let expiresOnTurnEndOf: typeof ctx.source.ownerSeat | undefined;
    if (action.duration === "forTheTurn") expiresOnTurnEndOf = ctx.game.state.turnSeat;
    if (action.duration === "untilYourTurnEnd") expiresOnTurnEndOf = ctx.source.ownerSeat;
    if (action.duration === "untilOpponentTurnEnd") {
      expiresOnTurnEndOf = ctx.game.opponentOf(ctx.source.ownerSeat);
    }
    const grantedAfterOwnersMainPhaseStarted =
      ctx.game.state.turnSeat === grantedPerm.controllerSeat && ctx.game.state.phase === Phase.Main;
    const grantedTurnCount = ctx.game.state.turnCount;
    // `startOfYourMainPhase` requires the watcher to fire only during the GRANTED permanent's
    // owner's main phase; the ownerMainPhaseGate in runSubTrigger handles this via isOwnersTurn()
    // on the watcher's context, which is anchored on the GRANTED permanent. Gate is always added
    const ownerMainPhaseGate =
      event === "startOfYourMainPhase"
        ? (subCtx: EffectContext): boolean =>
            !(grantedAfterOwnersMainPhaseStarted && subCtx.game.state.turnCount === grantedTurnCount) &&
            subCtx.source.isOwnersTurn() &&
            subCtx.source.isOnBattleArea()
        : undefined;
    const ownerTurnEndGate =
      event === "endOfTurn"
        ? (subCtx: EffectContext): boolean => subCtx.source.isOwnersTurn() && subCtx.source.isOnBattleArea()
        : undefined;
    const grantedPermanentDeletionGate =
      event === "onDeletionOf"
        ? (subCtx: EffectContext): boolean => subCtx.trigger.deletedPermanentId === targetPermanentId
        : undefined;
    // A gained "when this Digimon deletes ... in battle" trigger belongs to the
    // granted permanent, not to every attacker controlled by the same player.
    // The combat controller only publishes this event after the attacker survives
    // and the battled defender is deleted, so this identity gate completes the
    // printed condition without duplicating combat semantics here.
    const grantedPermanentBattleDeleteGate =
      event === "whenDeletesInBattle"
        ? (subCtx: EffectContext): boolean => subCtx.trigger.attackerPermanentId === targetPermanentId
        : undefined;
    const grantedPermanentAttackGate =
      event === "whenAttacking"
        ? (subCtx: EffectContext): boolean => subCtx.trigger.attackerPermanentId === targetPermanentId
        : undefined;
    const whenDeletesInBattleSelfGate =
      event === "whenDeletesInBattle" && sourceFilter?.isSelfRef === true && anchorPermanentId !== undefined
        ? (subCtx: EffectContext): boolean => subCtx.trigger.attackerPermanentId === anchorPermanentId
        : undefined;
    const whenSuspendedSelfGate =
      event === "whenSuspended" && anchorPermanentId !== undefined
        ? (subCtx: EffectContext): boolean => {
            const suspendedIds =
              subCtx.trigger.subjectPermanentIds ??
              (subCtx.trigger.suspendedPermanentId !== undefined ? [subCtx.trigger.suspendedPermanentId] : []);
            return suspendedIds.includes(anchorPermanentId);
          }
        : undefined;
    const immunityAtTriggerGate = (subCtx: EffectContext): boolean => {
      const current = subCtx.game.permanentById(targetPermanentId);
      if (current === undefined || current.controllerSeat === grantingSeat) return true;
      if (subCtx.fx.isUnaffectableByOpponentEffects?.(targetPermanentId) === true) return false;
      return !grantingKinds.some((kind) => subCtx.fx.isBeAffectedBySourceKind?.(targetPermanentId, kind) === true);
    };
    const gates = [
      ownerMainPhaseGate,
      ownerTurnEndGate,
      grantedPermanentDeletionGate,
      grantedPermanentBattleDeleteGate,
      grantedPermanentAttackGate,
      whenDeletesInBattleSelfGate,
      whenSuspendedSelfGate,
      immunityAtTriggerGate,
    ].filter((g): g is (subCtx: EffectContext) => boolean => g !== undefined);
    const matches = gates.length === 0 ? undefined : (subCtx: EffectContext): boolean => gates.every((g) => g(subCtx));
    const gainedActions = action.gainedActions;
    // The watcher fires on the recipient, so the granting card's text is only reachable here.
    const grantedText =
      action.raw ??
      quotedGrantedClause(ctx.activeEffectText) ??
      quotedGrantedClause(ctx.source.definition.effectText) ??
      quotedGrantedClause(ctx.source.definition.inheritedEffectText);
    ctx.fx.subscribeSubTrigger({
      event,
      decisionSummary: getDecisionEffectSummary({ actions: gainedActions }),
      activationDeferred: true,
      sourcePermanentId: targetPermanentId,
      once: action.once === true,
      // A gained trigger is armed by a resolved effect and lasts for its printed duration;
      // it is not itself a static watcher even when the granting clause was reached through
      // a continuously installed SubTrigger.
      continuous: false,
      ...(grantedText !== undefined
        ? { grantedEffectText: grantedText, printedClause: `[Granted] ${grantedText}` }
        : {
            printedClause: `[Granted] ${triggerLabel(action.gainedTrigger)}: ${ctx.source.definition.nameEn}`,
          }),
      ...(matches ? { matches } : {}),
      // A gained [On Deletion] activates after the recipient and its stack reach
      // trash (CR 15-13-3), alongside the ordinary deletion effects. watchesSelf
      // instead denotes a "when this Digimon is deleted" reaction that runs before
      // leave prevention (Q2212); using it here makes stack cards unavailable.
      ...(expiresOnTurnEndOf !== undefined ? { expiresOnTurnEndOf } : {}),
      ...(attacksAtStartOfMainPhase
        ? {
            publicBadge: "attackAtStartOfMainPhase" as const,
            publicBadgeGrantingSeat: grantingSeat,
            publicBadgeSourceKinds: grantingKinds,
            printedTiming: "[Start of Your Main Phase]",
            // This clause belongs to the effect granted onto the recipient, not to the
            // recipient's own printed text. The client strips the marker and presents the
            // supplied clause beside the recipient instead of looking it up on the wrong card.
            printedClause: `[Granted] ${forcedAttackClause}`,
          }
        : {}),
      description: action.raw ?? `GainTriggeredEffect(${action.gainedTrigger}) on ${targetPermanentId}`,
      run: async (subCtx) => {
        // The target prompt belongs to the recipient's granted effect. Subscription
        // labels alone do not reach decisions opened by its nested Attack action.
        if (attacksAtStartOfMainPhase) {
          subCtx.activeTiming = "[Start of Your Main Phase]";
          subCtx.activeEffectText = forcedAttackClause;
        }
        for (const a of gainedActions) {
          const abort = await runAction(subCtx, a);
          if (abort) break;
        }
      },
    });
  };
  for (const targetPermanentId of targetIds) arm(targetPermanentId);
  if (action.includeLaterEntrants === true) {
    subscribeLaterEntrants(ctx, {
      filter: action.target.filter,
      duration: action.duration,
      label: "GainTriggeredEffect",
      alreadyGranted: targetIds,
      grant: arm,
    });
  }
}
