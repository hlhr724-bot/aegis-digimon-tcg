import { EffectTiming, type CardInstance } from "@aegis/shared";
import { createCardSource, type CardStateLookup } from "#api/engine/cards/CardSource";
import type { UseTracker } from "#api/engine/effects/kernel";
import { getEffectModule } from "#api/engine/effects/registry";
import type { FieldCardRole } from "#api/engine/gameEngine/oncePerTurnUsage/FieldCardRole";

type Params = {
  instance: CardInstance;
  role: FieldCardRole;
  tracker: UseTracker;
  lookup: CardStateLookup;
};

const EFFECT_TIMINGS = [
  ...new Set(Object.values(EffectTiming).filter((timing): timing is EffectTiming => typeof timing === "number")),
];

const WATCHER_LEDGERS = ["subtrigger", "replacement"];

export function hasUsedOncePerTurnEffect({ instance, role, tracker, lookup }: Params): boolean {
  if (!instance.cardId || !tracker.hasUsesFor(instance.instanceId)) return false;
  const module = getEffectModule(instance.cardId);
  if (module === undefined) return false;
  const source = createCardSource(instance, lookup);
  return EFFECT_TIMINGS.some((timing) => {
    if (module.hasTiming?.(timing) === false) return false;
    return module
      .effectsForTiming(timing, source)
      .some(
        (effect) =>
          effect.maxPerTurn > 0 &&
          effect.isInherited === role.isInherited &&
          effect.isLinked === role.isLinked &&
          (tracker.count(instance.instanceId, effect.effectKey) >= effect.maxPerTurn ||
            WATCHER_LEDGERS.some((ledger) => tracker.count(`${instance.instanceId}/${effect.effectKey}`, ledger) > 0)),
      );
  });
}
