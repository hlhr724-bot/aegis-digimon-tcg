import type { Action } from "@aegis/shared";
import type { EffectContext } from "../../EffectContext.js";
import { hasExactName } from "../matching/definition.js";
import { candidateLooseInstances } from "../targeting/loose.js";
import { candidatePermanents } from "../targeting/permanents.js";

export function canAttemptDigivolveViaPlacement(
  ctx: EffectContext,
  action: Extract<Action, { kind: "DigivolveViaPlacement" }>,
): boolean {
  const { hostFilter, target } = action.placeCost;
  if (candidatePermanents(ctx, { filter: hostFilter, count: 1 }).length === 0) return false;
  const candidates = candidateLooseInstances(ctx, target, ["trash"]);
  const requiredNames = target.requiredNamesExact ?? [];
  if (requiredNames.length > 0) {
    const used = new Set<string>();
    return requiredNames.every((name) => {
      const match = candidates.find(
        (candidate) =>
          !used.has(candidate.instanceId) &&
          hasExactName(ctx.game.definitionOf({ cardId: candidate.cardId } as never), name),
      );
      if (match === undefined) return false;
      used.add(match.instanceId);
      return true;
    });
  }
  const required = target.count === "all" ? 1 : Number(target.count ?? 1);
  return candidates.length >= required;
}
