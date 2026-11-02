import type { EffectContext } from "#api/engine/effects/EffectContext";
import { runtimeCompiledCard } from "#api/engine/effects/interpreter/compiledCards";
import { candidateLooseInstances } from "#api/engine/effects/interpreter/targeting/loose";
import { playableCandidates, isEffectPlayProhibited } from "#api/engine/effects/interpreter/actions/play";
import { scaleFactor } from "#api/engine/effects/interpreter/scaling";
import { availableEffectPlayAssemblyReduction } from "#api/engine/effects/interpreter/actions/effectPlayAssembly";
import { availableEffectPlayDigiXrosReduction } from "#api/engine/effects/interpreter/actions/effectPlayDigiXrosAvailability";

export async function getNegamonPlayCandidates(ctx: EffectContext): Promise<Set<string>> {
  const action = runtimeCompiledCard("EX9-005")
    ?.effects.find((effect) => effect.trigger === "Main" && effect.isBreeding)
    ?.actions.find((candidate) => candidate.kind === "PlayWithoutCost");
  const result = new Set<string>();
  if (!action || action.kind !== "PlayWithoutCost" || !ctx.fx.canAffordEffectPlay) {
    return result;
  }
  const costDelta =
    (action.reduceCostBy ?? 0) + (action.reduceCostByScaling ? scaleFactor(ctx, action.reduceCostByScaling) : 0);
  const candidates = playableCandidates(ctx, action.target, candidateLooseInstances(ctx, action.target, ["hand"]));
  for (const candidate of candidates) {
    if (isEffectPlayProhibited(ctx, candidate)) {
      continue;
    }
    const assemblyReduction = availableEffectPlayAssemblyReduction(ctx, candidate);
    const digiXrosReduction = availableEffectPlayDigiXrosReduction(ctx, candidate);
    const affordable = await ctx.fx.canAffordEffectPlay(candidate.instanceId, {
      controllerSeat: ctx.source.ownerSeat,
      costDelta: costDelta + Math.max(assemblyReduction, digiXrosReduction),
    });
    if (affordable) {
      result.add(candidate.instanceId);
    }
  }
  return result;
}
