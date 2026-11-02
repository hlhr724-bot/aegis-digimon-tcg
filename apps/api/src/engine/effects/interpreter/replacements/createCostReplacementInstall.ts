import type { CardDefinition } from "@aegis/shared/cards/types";
import type { Permanent } from "@aegis/shared/schema/Permanent";
import type { ZoneRef } from "@aegis/shared/effects/ir/filters/zones";
import type { EffectContext } from "#api/engine/effects/context/effectContext";
import type { CostReplacementInstall } from "#api/engine/effects/interpreter/replacements/CostReplacementInstall";
import type { CostReplacementInstallParams } from "#api/engine/effects/interpreter/replacements/CostReplacementInstallParams";
import type { Filter } from "@aegis/shared/effects/ir/filters/filter";
import { evaluateCondition } from "#api/engine/effects/interpreter/conditions";
import { canPayCost, payCost } from "#api/engine/effects/interpreter/costs";
import { definitionMatches } from "#api/engine/effects/interpreter/matching/definition";
import { permanentMatchesFilter } from "#api/engine/effects/interpreter/matching/permanent";
import { candidatePermanents } from "#api/engine/effects/interpreter/targeting/permanents";
import { getCostReductionSummary } from "#api/engine/effects/interpreter/replacements/getCostReductionSummary";

export function createCostReplacementInstall({
  ctx,
  action,
  event,
  replacementBudget,
  self,
  activationIdentity,
  expiresOnTurnEndOf,
  mode,
  amount,
  amountChoices,
  scalesIntoColors,
  nestedCostModifier,
  intoFilter,
  replacementSourceFilter,
  interactiveCost,
  interactiveAdditionalCosts,
  interactiveCosts,
  interactiveOptional,
  ownerSeat,
  residentTiming,
}: CostReplacementInstallParams): CostReplacementInstall {
  const isResidentReductionActive = () =>
    (ctx.residentCostRegistration !== true || ctx.isResidentCostSourceActive?.() !== false) &&
    (residentTiming !== "YourTurn" || ctx.game.state.turnSeat === ownerSeat) &&
    (residentTiming !== "OpponentsTurn" || ctx.game.state.turnSeat !== ownerSeat);
  let appliesTo: CostReplacementInstall["appliesTo"];
  if (mode === "increaseCost") {
    appliesTo = (target) => {
      if (!isResidentReductionActive()) {
        return false;
      }
      const { kind: _digivolvingKind, ...filter } = action.sourceFilter ?? {};
      return permanentMatchesFilter(ctx, target, filter, ctx.source);
    };
  } else if (replacementSourceFilter !== undefined) {
    appliesTo = (target) =>
      isResidentReductionActive() &&
      (!target.inBreeding || isBreedingFilter(replacementSourceFilter)) &&
      permanentMatchesFilter(ctx, target, replacementSourceFilter, ctx.source);
  }
  return {
    ...replacementBudget,
    event,
    sourcePermanentId: self?.permanentId,
    sourceInstanceId: ctx.source.instanceId,
    activationIdentity,
    ...(ctx.activeTiming !== undefined ? { activationTiming: ctx.activeTiming } : {}),
    ...(ctx.activeEffectText !== undefined ? { activationEffectText: ctx.activeEffectText } : {}),
    ...(expiresOnTurnEndOf !== undefined ? { expiresOnTurnEndOf } : {}),
    mode: "reduceCost",
    ...(ctx.residentCostRegistration === true || ctx.continuousPass === true ? { residentReduction: true } : {}),
    amount: mode === "increaseCost" ? -(amount ?? 0) : amount,
    ...(amountChoices !== undefined ? { amountChoices } : {}),
    ...(amountChoices !== undefined
      ? {
          potentialAmount: (target: Permanent) => {
            const projectionCtx = {
              ...ctx,
              trigger: { ...ctx.trigger, subjectPermanentId: target.permanentId },
            } as EffectContext;
            const eligible = amountChoices.filter(
              (choice) => choice.condition === undefined || evaluateCondition(projectionCtx, choice.condition!),
            );
            return Math.max(0, ...eligible.map((choice) => choice.amount));
          },
        }
      : {}),
    ...(scalesIntoColors ? { amountForInto: (def: CardDefinition) => (amount ?? 0) * def.colors.length } : {}),
    description: action.raw ?? ctx.activeEffectText ?? nestedCostModifier?.raw ?? "",
    ...(action.consumeOnActivate === true ? { consumeOnActivate: true } : {}),
    digisorptionRedirect: action.digisorptionRedirect,
    intoMatches: intoFilter !== undefined ? (def) => definitionMatches(intoFilter, def) : undefined,
    ...(appliesTo === undefined ? {} : { appliesTo }),
    ...(interactiveCosts.length > 0 || interactiveOptional || amountChoices !== undefined
      ? {
          controllerSeat: ownerSeat,
          ...(self === undefined ? { activationContext: ctx } : {}),
          appliesTo: (target: Permanent, originZone?: ZoneRef) =>
            isResidentReductionActive() &&
            target.controllerSeat === ownerSeat &&
            !target.inBreeding &&
            (event !== "wouldDigivolve" || isOriginZoneAllowed({ filter: intoFilter, originZone })) &&
            matchesInteractiveCostTarget({ ctx, target, replacementSourceFilter, originZone }),
          activate: async (
            runtimeCtx: EffectContext,
            target: Permanent,
            _into: CardDefinition,
            evolvingInstanceId?: string,
          ) => {
            runtimeCtx.trigger.subjectPermanentId = target.permanentId;
            if (evolvingInstanceId !== undefined) {
              runtimeCtx.reservedCostInstanceIds = new Set([
                ...(runtimeCtx.reservedCostInstanceIds ?? []),
                evolvingInstanceId,
              ]);
            }
            if (interactiveCosts.some((cost) => !canPayCost(runtimeCtx, cost))) {
              return false;
            }
            let selectedAmount = amount ?? 0;
            if (
              interactiveCost?.kind === "suspend" &&
              (interactiveCost.target?.isSelf === true || interactiveCost.target?.filter.isSelfRef === true) &&
              self !== undefined &&
              runtimeCtx.fx.canPayActivationCost?.(self.permanentId, "suspend") === false
            ) {
              return false;
            }
            if (interactiveOptional || action.optional !== false) {
              const askCtx =
                mode === "reduceCost" && amount !== undefined && amount > 0
                  ? { ...runtimeCtx, activeDecisionSummary: getCostReductionSummary({ amount }) }
                  : runtimeCtx;
              const accepted = await runtimeCtx.ask.optional(
                askCtx,
                action.raw ?? nestedCostModifier?.raw ?? "Pay the cost to reduce the cost?",
              );
              if (!accepted) {
                return false;
              }
            }
            if (amountChoices !== undefined) {
              const eligible = amountChoices.filter(
                (choice) => choice.condition === undefined || evaluateCondition(runtimeCtx, choice.condition),
              );
              if (eligible.length === 0) {
                return false;
              }
              const chosen =
                eligible.length === 1
                  ? 0
                  : await runtimeCtx.ask.chooseOption(
                      runtimeCtx,
                      eligible.map((choice) => choice.raw ?? `Reduce the play cost by ${choice.amount}.`),
                    );
              selectedAmount = eligible[chosen]!.amount;
            }
            if (nestedCostModifier?.dynamicFrom === "deletedDigimonPlayCost") {
              if (interactiveCost?.kind !== "deleteOwn" || interactiveCost.target === undefined) {
                return false;
              }
              const reductionBinding = `dynamic-play-cost/${ctx.source.instanceId}/${activationIdentity ?? "effect"}`;
              const playCostByInstanceId = new Map(
                candidatePermanents(runtimeCtx, interactiveCost.target).flatMap((permanent) =>
                  permanent.topCard === undefined
                    ? []
                    : [
                        [
                          permanent.topCard.instanceId,
                          Math.max(0, runtimeCtx.game.definitionOf(permanent.topCard).playCost),
                        ] as const,
                      ],
                ),
              );
              const succeeded = await payCost(runtimeCtx, { ...interactiveCost, bindResultAs: reductionBinding });
              if (!succeeded) {
                return false;
              }
              for (const additionalCost of interactiveAdditionalCosts) {
                if (!(await payCost(runtimeCtx, additionalCost))) {
                  return false;
                }
              }
              return [...(runtimeCtx.boundPlayed?.get(reductionBinding) ?? [])].reduce(
                (total, instanceId) => total + (playCostByInstanceId.get(instanceId) ?? 0),
                0,
              );
            }
            if (action.amountFromPaidCost === true) {
              if (interactiveCost === undefined) {
                return false;
              }
              const paid = { paidCount: 0 };
              const succeeded = await payCost(runtimeCtx, interactiveCost, paid);
              if (!succeeded) {
                return false;
              }
              for (const additionalCost of interactiveAdditionalCosts) {
                if (!(await payCost(runtimeCtx, additionalCost))) {
                  return false;
                }
              }
              return succeeded ? paid.paidCount : false;
            }
            for (const cost of interactiveCosts) {
              const paid = await payCost(runtimeCtx, cost);
              if (!paid) {
                return false;
              }
            }
            return amountChoices === undefined ? true : selectedAmount;
          },
          consumeOnActivate: true,
        }
      : {}),
  };
}

function isBreedingFilter(filter: Filter): boolean {
  if (filter.isSelfRef === true) {
    return true;
  }
  return isOriginZoneAllowed({ filter: { zone: filter.zone ?? [] }, originZone: "breeding" });
}

type OriginZoneParams = { filter: Filter | undefined; originZone: ZoneRef | undefined };

function isOriginZoneAllowed({ filter, originZone }: OriginZoneParams): boolean {
  if (filter?.zone === undefined) {
    return true;
  }
  if (originZone === undefined) {
    return false;
  }
  if (Array.isArray(filter.zone)) {
    return filter.zone.includes(originZone);
  }
  return filter.zone === originZone;
}

type TargetParams = {
  ctx: EffectContext;
  target: Permanent;
  replacementSourceFilter: Filter | undefined;
  originZone: ZoneRef | undefined;
};

function matchesInteractiveCostTarget({ ctx, target, replacementSourceFilter, originZone }: TargetParams): boolean {
  if (!target.permanentId.startsWith("pending-play-") || target.topCard === undefined) {
    return permanentMatchesFilter(ctx, target, replacementSourceFilter ?? {}, ctx.source);
  }
  return (
    (replacementSourceFilter?.isSelfRef !== true || target.topCard.instanceId === ctx.source.instanceId) &&
    definitionMatches(replacementSourceFilter ?? {}, ctx.game.definitionOf(target.topCard)) &&
    isOriginZoneAllowed({ filter: replacementSourceFilter, originZone })
  );
}
