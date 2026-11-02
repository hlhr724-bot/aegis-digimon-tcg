import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { Action } from "@aegis/shared/effects/ir/actions/action";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { ReplacementInstallInstead } from "#api/engine/effects/context/replacements";
import { canPayCost, payCost } from "#api/engine/effects/interpreter/costs";
import { runAction } from "#api/engine/effects/interpreter/dispatch";
import { definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import { permanentMatchesFilter } from "#api/engine/effects/interpreter/matching/permanent";
import { trashDelaySource } from "#api/engine/effects/interpreter/optionTrash";
import { canAttemptDnaDigivolve } from "#api/engine/effects/interpreter/actions/dna";
import type { LeaveReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/LeaveReplacementInstallParams";
import { runWithReplacementSource } from "#api/engine/effects/interpreter/replacements/runWithReplacementSource";

export function createInsteadReplacementInstall({
  ctx,
  action,
  event,
  replacementBudget,
  self,
  activationIdentity,
  decodeText,
}: LeaveReplacementInstallParams): ReplacementInstallInstead {
  const withReplacementSource = <T>(subCtx: EffectContext, body: () => Promise<T>): Promise<T> =>
    runWithReplacementSource({ ctx, subCtx, decodeText, body });
  const intoFilter = action.into;
  return {
    ...replacementBudget,
    event,
    sourcePermanentId: self?.permanentId,
    sourceInstanceId: ctx.source.instanceId,
    activationIdentity,
    mode: "instead",
    exceptDigiXros: action.exceptDigiXros,
    description: action.raw ?? decodeText ?? ctx.activeEffectText ?? event,
    digisorptionRedirect: action.digisorptionRedirect,
    causeAllows: (cause, resolvingSeat) => {
      switch (action.leaveCause ?? "any") {
        case "opponentEffect":
        case "byOpponentEffect":
          return cause === "byEffect" && resolvingSeat !== undefined && resolvingSeat !== ctx.source.ownerSeat;
        case "byBattle":
          return cause === "byBattle";
        case "byEffect":
          return cause === "byEffect";
        case "otherThanBattle":
          return cause !== "byBattle";
        case "otherThanYourEffect":
          return !(cause === "byEffect" && resolvingSeat !== undefined && resolvingSeat === ctx.source.ownerSeat);
        case "any":
          return true;
        default:
          return true;
      }
    },
    appliesTo: (_subCtx, leavingPermanentId) => {
      const candidate = _subCtx.game.permanentById(leavingPermanentId);
      if (candidate === undefined) return false;
      if ((action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true) {
        const delaySource = _subCtx.source.permanent();
        if (delaySource === undefined || delaySource.enterFieldTurnCount === _subCtx.game.state.turnCount) return false;
      }
      const filter = action.sourceFilter ?? action.target?.filter;
      if (event === "wouldDigivolve" && candidate.inBreeding && !doesFilterReachBreeding(filter ?? {})) {
        return false;
      }
      if (filter !== undefined) {
        if (filter.controller === "mine" && candidate.controllerSeat !== ctx.source.ownerSeat) return false;
        if (filter.controller === "opponent" && candidate.controllerSeat === ctx.source.ownerSeat) return false;
        if (!permanentMatchesFilter(_subCtx, candidate, filter, _subCtx.source)) return false;
      }
      if (intoFilter !== undefined) {
        const intoCardId = _subCtx.trigger.digivolvingIntoCardId;
        const into = intoCardId === undefined ? undefined : getCardDefinition(intoCardId);
        if (into === undefined || !definitionMatches(intoFilter, into)) return false;
      }
      const nestedActions = action.actions ?? [];
      const dnaDigivolveActions = nestedActions.filter(
        (nested): nested is Extract<Action, { kind: "DnaDigivolve" }> => nested.kind === "DnaDigivolve",
      );
      if (
        (action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic !== true &&
        dnaDigivolveActions.length > 0 &&
        dnaDigivolveActions.length === nestedActions.length &&
        !dnaDigivolveActions.some((dna) => canAttemptDnaDigivolve(_subCtx, dna))
      )
        return false;
      return true;
    },
    ...(event === "wouldBePlayed"
      ? {
          appliesToPending: (subCtx: EffectContext, target: Permanent): boolean => {
            const filter = action.sourceFilter ?? action.target?.filter;
            if (filter === undefined) return true;
            if (filter.controller === "mine" && target.controllerSeat !== subCtx.source.ownerSeat) return false;
            if (filter.controller === "opponent" && target.controllerSeat === subCtx.source.ownerSeat) return false;
            return permanentMatchesFilter(subCtx, target, filter, subCtx.source);
          },
        }
      : {}),
    apply: (subCtx) =>
      withReplacementSource(subCtx, async () => {
        const tracksDigiXrosExpansion = (action.actions ?? []).some(
          (nested) => nested.kind === "DigiXrosMaterialZoneExpansion",
        );
        const hasOptionalDigiXrosCost = (action.actions ?? []).some(
          (nested) => nested.kind === "DigiXrosMaterialZoneExpansion" && nested.cost !== undefined,
        );
        if (
          (action.actions ?? []).some(
            (nested) =>
              nested.kind === "DigiXrosMaterialZoneExpansion" &&
              nested.cost !== undefined &&
              !canPayCost(subCtx, nested.cost),
          )
        )
          return false;
        const expansionCountBefore = tracksDigiXrosExpansion
          ? subCtx.fx.digiXrosPlayExpansionCount?.(subCtx.source.ownerSeat, subCtx.trigger.wouldBePlayedInstanceId)
          : undefined;
        const nestedActions = action.actions ?? [];
        const dnaDigivolveActions = nestedActions.filter(
          (candidate): candidate is Extract<Action, { kind: "DnaDigivolve" }> => candidate.kind === "DnaDigivolve",
        );
        const isIntrinsicDelay = (action as { delayArmedIntrinsic?: boolean }).delayArmedIntrinsic === true;
        const onlyDnaDigivolves = dnaDigivolveActions.length > 0 && dnaDigivolveActions.length === nestedActions.length;
        if (
          onlyDnaDigivolves &&
          !isIntrinsicDelay &&
          !dnaDigivolveActions.some((candidate) => canAttemptDnaDigivolve(subCtx, candidate))
        ) {
          return false;
        }
        const replacementCost = action.cost;
        if (
          replacementCost !== undefined &&
          typeof replacementCost !== "number" &&
          !canPayCost(subCtx, replacementCost)
        ) {
          return false;
        }
        if (isIntrinsicDelay) {
          const delaySource = subCtx.source.permanent();
          if (delaySource === undefined || delaySource.enterFieldTurnCount === subCtx.game.state.turnCount)
            return false;
          if (!(await subCtx.ask.optional(subCtx, action.raw ?? "Trash this card to activate its ＜Delay＞ effect?"))) {
            return false;
          }
          const trashed = await trashDelaySource(subCtx, delaySource);
          if (trashed <= 0 && subCtx.source.permanent() !== undefined) return false;
        } else if (
          (action.optional === true || hasOptionalDigiXrosCost) &&
          !(await subCtx.ask.optional(subCtx, action.raw ?? "Use this effect?"))
        ) {
          return false;
        }
        if (
          replacementCost !== undefined &&
          typeof replacementCost !== "number" &&
          !(await payCost(subCtx, replacementCost))
        ) {
          return false;
        }
        for (const a of nestedActions) {
          const abort = await runAction(subCtx, a);
          if (abort) break;
        }
        if (onlyDnaDigivolves) return subCtx.lastDigivolveResult === true;
        if (tracksDigiXrosExpansion && expansionCountBefore !== undefined) {
          return (
            (subCtx.fx.digiXrosPlayExpansionCount?.(subCtx.source.ownerSeat, subCtx.trigger.wouldBePlayedInstanceId) ??
              expansionCountBefore) > expansionCountBefore
          );
        }
        const declinedEveryChoice =
          action.optional !== true &&
          !isIntrinsicDelay &&
          replacementCost === undefined &&
          subCtx.oncePerTurnActivationDeclined === true &&
          subCtx.oncePerTurnActivationChosen !== true;
        return !declinedEveryChoice;
      }),
  };
}

function doesFilterReachBreeding(filter: Filter): boolean {
  if (filter.isSelfRef === true) {
    return true;
  }
  if (Array.isArray(filter.zone)) {
    return filter.zone.includes("breeding");
  }
  return filter.zone === "breeding";
}
