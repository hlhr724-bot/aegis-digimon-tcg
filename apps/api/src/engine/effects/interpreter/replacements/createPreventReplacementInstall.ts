import { DecisionSelectionGoal } from "@aegis/shared/protocol/DecisionSelectionGoal";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ReplacementInstallPrevent } from "#api/engine/effects/context/replacements";
import { effectProvenanceKinds } from "#api/engine/effects/effectProvenance";
import { evaluateCondition } from "#api/engine/effects/interpreter/conditions";
import { canPayCost, payOneCostOption } from "#api/engine/effects/interpreter/costs";
import { printedClause } from "#api/engine/effects/interpreter/describe";
import { runAction } from "#api/engine/effects/interpreter/dispatch";
import { definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import { isPermanentUnaffectable, permanentMatchesFilter } from "#api/engine/effects/interpreter/matching/permanent";
import { trashDelaySource } from "#api/engine/effects/interpreter/optionTrash";
import { playEffectInstances } from "#api/engine/effects/interpreter/actions/effectPlayAssembly";
import { isCannotLeavePlayGrant } from "#api/engine/effects/interpreter/replacements/isCannotLeavePlayGrant";
import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";
import { runWithReplacementSource } from "#api/engine/effects/interpreter/replacements/runWithReplacementSource";

export function createPreventReplacementInstall({
  ctx,
  action,
  event,
  replacementBudget,
  self,
  activationIdentity,
  decodeText,
  nestedPrevent,
  preventCost,
  nestedCostModifierRaw,
}: LeaveReplacementInstallParams): ReplacementInstallPrevent {
  const withReplacementSource = <T>(subCtx: EffectContext, body: () => Promise<T>): Promise<T> =>
    runWithReplacementSource({ ctx, subCtx, decodeText, body });
  const protectsFilter = action.target?.filter ?? action.sourceFilter;
  const protectsSelf =
    protectsFilter === undefined || action.target?.isSelf === true || protectsFilter.isSelfRef === true;
  const ownerSeat = ctx.source.ownerSeat;
  const sourceleaveReason = action.sourceFilter?.leaveReason;
  const leaveCause = action.leaveCause ?? (sourceleaveReason === "effect" ? "byEffect" : "any");
  const exceptDeletion = action.exceptDeletion === true;
  const requiresIntrinsicDelay = (action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true;
  const delayCanActivate = (subCtx: EffectContext): boolean => {
    if (action.requiresDelayArmed !== true && !requiresIntrinsicDelay) return true;
    const delaySource = subCtx.source.permanent();
    if (delaySource === undefined || delaySource.enterFieldTurnCount === subCtx.game.state.turnCount) return false;
    return (
      action.requiresDelayArmed !== true ||
      (subCtx.fx.grantedKeywords?.(delaySource.permanentId) ?? []).some((grant) => grant.keyword === "Delay")
    );
  };
  return {
    ...replacementBudget,
    event,
    sourcePermanentId: self?.permanentId,
    sourceInstanceId: ctx.source.instanceId,
    activationIdentity,
    ...(action.requiresDelayArmed === true || requiresIntrinsicDelay ? { preventionKeyword: "Delay" as const } : {}),
    mode: "prevent",
    exceptDigiXros: action.exceptDigiXros,
    affectsAll: action.affectsAll,
    description: action.raw ?? ctx.activeEffectText ?? nestedCostModifierRaw ?? "",
    causeAllows: (cause, resolvingSeat, isBounce, destination) => {
      if (
        action.leaveDestinations !== undefined &&
        (destination === undefined || !action.leaveDestinations.includes(destination))
      )
        return false;
      if (exceptDeletion && !isBounce) return false;
      switch (leaveCause) {
        case "opponentEffect":
        case "byOpponentEffect":
          return cause === "byEffect" && resolvingSeat !== undefined && resolvingSeat !== ownerSeat;
        case "otherThanYourEffect":
          return !(cause === "byEffect" && resolvingSeat === ownerSeat);
        case "byEffect":
          return cause === "byEffect";
        case "byBattle":
          return cause === "byBattle";
        case "otherThanBattle":
          return cause !== "byBattle";
        case "any":
        default:
          return true;
      }
    },
    protects: (subCtx, leavingId) => {
      const leaving = subCtx.game.permanentById(leavingId);
      if (leaving === undefined) return false;
      if (!delayCanActivate(subCtx)) return false;
      const clauseKinds = subCtx.fx.isBeAffectedBySourceKind === undefined ? [] : effectProvenanceKinds(subCtx);
      if (isPermanentUnaffectable(subCtx, subCtx.source, leaving, clauseKinds)) return false;
      if (protectsSelf) {
        if (subCtx.source.permanent()?.permanentId !== leavingId) return false;
        return (
          action.sourceFilter === undefined ||
          permanentMatchesFilter(subCtx, leaving, action.sourceFilter, subCtx.source)
        );
      }
      if (protectsFilter === undefined) return false;
      if (protectsFilter.controller === "mine" && leaving.controllerSeat !== ownerSeat) return false;
      if (protectsFilter.controller === "opponent" && leaving.controllerSeat === ownerSeat) return false;
      return permanentMatchesFilter(subCtx, leaving, protectsFilter, subCtx.source);
    },
    preventCheck: async (subCtx) =>
      withReplacementSource(subCtx, async () => {
        if (preventCost !== undefined && !canPayCost(subCtx, preventCost)) return false;
        const availablePreventCosts = action.costOptions ?? nestedPrevent?.costOptions;
        if (availablePreventCosts !== undefined && !availablePreventCosts.some((cost) => canPayCost(subCtx, cost))) {
          return false;
        }
        const clauseProvenance = {
          ...(ctx.activeTiming !== undefined ? { activeTiming: ctx.activeTiming } : {}),
          ...(ctx.activeEffectIsInherited === true ? { activeEffectIsInherited: true } : {}),
        };
        const resolveNotice = subCtx.fx.announceEffect?.(subCtx, {
          beforeRemoval: true,
          effectKey: activationIdentity ?? `replacement/${ctx.source.cardId}/prevent`,
          description:
            printedClause(action.raw) ??
            printedClause(ctx.activeEffectText) ??
            subCtx.source.definition.effectText ??
            "",
          timing: clauseProvenance.activeTiming ?? "AllTurns",
          ...(clauseProvenance.activeEffectIsInherited === true ? { isInherited: true } : {}),
        });
        try {
          if (action.optional !== false) {
            const preventReason =
              printedClause(action.raw) ??
              printedClause(preventCost?.raw) ??
              printedClause(subCtx.activeEffectText) ??
              printedClause(subCtx.source.definition.effectText);
            const askCtx = {
              ...subCtx,
              ...(preventReason === undefined ? {} : { activeEffectText: preventReason, ...clauseProvenance }),
              activeDecisionSelectionGoal: DecisionSelectionGoal.PROTECT.value,
            };
            const yes = await askCtx.ask.optional(askCtx, "Prevent leaving the battle area?");
            if (!yes) return false;
          }
          subCtx.onActivationChosen?.();
          subCtx.oncePerTurnActivationChosen = true;
          if (action.digivolveFromTrash === true) {
            const targetId = subCtx.trigger.deletedPermanentId;
            if (targetId === undefined) return false;
            return (
              (await subCtx.fx.digivolveFromInstance(targetId, subCtx.source.instanceId, {
                payCost: false,
                processRulesBeforeWhenDigivolving: true,
              })) !== undefined
            );
          }
          if (action.playAndRelocateSourceUnder !== undefined) {
            const host = subCtx.source.permanent();
            if (host === undefined) return false;
            const owner = subCtx.game.state.players[subCtx.source.ownerSeat]!;
            const candidates = [
              ...(action.playAndRelocateSourceUnder.from.includes("digivolutionCards") ? host.stack : []),
              ...(action.playAndRelocateSourceUnder.from.includes("trash") ? owner.trash : []),
            ].filter((card) =>
              definitionMatches(action.playAndRelocateSourceUnder!.filter, subCtx.game.definitionOf(card)),
            );
            if (candidates.length === 0) return false;
            const selected = await subCtx.ask.selectCards(subCtx, {
              candidates: candidates.map((card) => card.instanceId),
              min: 1,
              max: 1,
            });
            if (selected.length === 0) return false;
            const selectedCards = candidates.filter((card) => selected.includes(card.instanceId));
            const played = await playEffectInstances(subCtx, selectedCards, { payCost: false });
            const playedPermanent = played[0];
            if (playedPermanent === undefined) return false;
            return subCtx.fx.relocatePermanent(playedPermanent.permanentId, host.permanentId, { belowTop: true });
          }
          if (clauseProvenance.activeTiming !== undefined) subCtx.activeTiming ??= clauseProvenance.activeTiming;
          if (clauseProvenance.activeEffectIsInherited === true) subCtx.activeEffectIsInherited ??= true;
          subCtx.activeEffectText ??=
            printedClause(action.raw) ?? printedClause(ctx.activeEffectText) ?? subCtx.source.definition.effectText;
          const runCtx: EffectContext =
            action.requiresDelayArmed === true ? { ...subCtx, delayArmedConsumed: true } : subCtx;
          if (action.requiresDelayArmed === true) {
            const source = subCtx.source.permanent();
            if (source === undefined) return false;
            if (source.enterFieldTurnCount === subCtx.game.state.turnCount) return false;
            const hasDelay = (subCtx.fx.grantedKeywords?.(source.permanentId) ?? []).some((g) => g.keyword === "Delay");
            if (!hasDelay) return false;
            subCtx.fx.revokeKeyword?.(source.permanentId, "Delay");
            const trashed = await trashDelaySource(subCtx, source);
            if (trashed <= 0) return false;
          }
          if ((action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true) {
            const source = subCtx.source.permanent();
            if (source === undefined) return false;
            if (source.enterFieldTurnCount === subCtx.game.state.turnCount) return false;
            const trashed = await trashDelaySource(subCtx, source);
            if (trashed <= 0 && subCtx.source.permanent() !== undefined) return false;
          }
          const preventCosts = action.costOptions ?? nestedPrevent?.costOptions ?? (preventCost ? [preventCost] : []);
          if (preventCosts.length > 0) {
            const paid = await payOneCostOption(subCtx, preventCosts);
            if (!paid) return false;
          }
          for (const inner of action.actions ?? []) {
            if (inner.kind === "Prevent") continue;
            if (inner.kind === "GrantStatic" && isCannotLeavePlayGrant((inner as { grant?: unknown }).grant)) continue;
            const abort = await runAction(runCtx, inner);
            if (abort) break;
          }
          if (nestedPrevent?.condition !== undefined && !evaluateCondition(runCtx, nestedPrevent.condition)) {
            return false;
          }
          return true;
        } finally {
          resolveNotice?.();
        }
      }),
  };
}
