import { CardKind, EffectTiming, type CardInstance } from "@aegis/shared";
import type { GameEngine } from "../../GameEngine.js";
import { effectsOf } from "../../effects/collect.js";
import { canPayCost } from "../../effects/interpreter/costs.js";
import {
  potentialWouldBePlayedSelfReduction,
  wouldBePlayedSelfReducersFor,
} from "../../effects/interpreter/registration/reducers.js";
import { buildEffectContext, cardSourceOf } from "../effectContext.js";
import { crossPermanentPlayReducerWatchers, pendingPlayTarget, residentPlayCostEffects } from "./playReducers.js";

/**
 * Prove impossibility without paying a cost or suppressing an unknown reduction route.
 * This bound covers a single self reducer. Other pay-time effects can change its
 * payment resources or memory, so those continue through authoritative resolution.
 */
export function minimumDeferredPlayCost(
  engine: GameEngine,
  instance: CardInstance,
  baseCost: number,
): number | undefined {
  const source = cardSourceOf(engine, instance);
  const seat = source.ownerSeat;
  if (!source.definition.kinds.includes(CardKind.Option) && engine.continuous.blocksCostReduction(seat, "play"))
    return baseCost;
  const breeding = engine.state.players[seat]?.breeding;
  const breedingEffects = [breeding?.topCard, ...Array.from(breeding?.stack ?? [])].some(
    (card, index) =>
      card !== undefined &&
      effectsOf(EffectTiming.BeforePayCost, cardSourceOf(engine, card)).some(
        (effect) => effect.costWindow === undefined && (index === 0 || effect.isInherited),
      ),
  );
  if (breedingEffects || crossPermanentPlayReducerWatchers(engine, instance, seat).length > 0) return undefined;
  const residentEffects = residentPlayCostEffects(engine, seat);
  const reducers = wouldBePlayedSelfReducersFor(instance.cardId);
  const directEffects = effectsOf(EffectTiming.BeforePayCost, source).filter(
    (effect) => effect.costWindow !== "digivolve",
  );
  const trigger = {
    wouldBePlayedInstanceId: instance.instanceId,
    wouldBePlayedCardId: instance.cardId,
    wouldBePlayedAsOption: source.definition.kinds.includes(CardKind.Option),
  };
  const ctx = {
    ...buildEffectContext(engine, source, trigger),
    selections: new Map<string, string>(),
  };
  const inertEffects =
    directEffects.every((effect) => effect.canAttemptPlayCostReduction?.(ctx) === false) &&
    residentEffects.every(
      ({ effect, source: residentSource }) =>
        effect.canAttemptPlayCostReduction?.({
          ...buildEffectContext(engine, residentSource, trigger),
          selections: new Map<string, string>(),
        }) === false,
    );
  const hasSubscriptions =
    engine.subTriggers.hasInteractiveReductionsFor("wouldBePlayed", seat) ||
    engine.subTriggers.hasPassiveReductionsFor("wouldBePlayed");
  if (hasSubscriptions) {
    // Automatic discounts and proven unavailable payments cannot enable a currently
    // unrelated subscription. A payable or unknown cost still requires resolution.
    const stableReducers = reducers.every(
      (reducer) =>
        reducer.pay === undefined &&
        reducer.costActions === undefined &&
        reducer.amountPerPaid === undefined &&
        (reducer.cost === undefined || (reducer.cost.kind === "suspend" && !canPayCost(ctx, reducer.cost))),
    );
    if (!inertEffects || !stableReducers) return undefined;
    const target = pendingPlayTarget(instance, source, trigger.wouldBePlayedAsOption);
    if (
      engine.subTriggers.hasApplicablePlayReductions(
        seat,
        target,
        source.definition,
        {
          hasFired: (key) => engine.tracker.count(key, "replacement") > 0,
          markFired: () => {},
        },
        "hand",
      )
    )
      return undefined;
  }
  if (residentEffects.length > 0) {
    // Every pay-time body must be an isolated sacrifice with no candidate. If any
    // body can change the board, another currently empty payment may become valid.
    return reducers.length === 0 && inertEffects ? baseCost : undefined;
  }
  if (directEffects.length > 0) {
    // A sole sacrifice reducer with no target cannot change resources or grant a discount.
    // Other effects and any available target retain authoritative payment resolution.
    return directEffects.length === 1 &&
      reducers.length === 0 &&
      directEffects[0]!.canAttemptPlayCostReduction?.(ctx) === false
      ? baseCost
      : undefined;
  }
  if (reducers.length === 0) return baseCost;
  if (reducers.length !== 1) return undefined;
  const reducer = reducers[0]!;
  if (reducer.pay !== undefined || reducer.costActions !== undefined || reducer.amountPerPaid !== undefined)
    return undefined;
  if (reducer.cost !== undefined) {
    // Only this fixed-count cost is independent of memory and zone-changing payments.
    if (reducer.cost.kind !== "suspend") return undefined;
    return Math.max(0, baseCost - (canPayCost(ctx, reducer.cost) ? Math.max(0, reducer.amount) : 0));
  }
  return Math.max(0, baseCost - potentialWouldBePlayedSelfReduction(ctx, reducer));
}
