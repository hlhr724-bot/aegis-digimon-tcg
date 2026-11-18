import type { Action } from "@aegis/shared";
import type { EffectContext } from "#api/engine/effects/EffectContext";
import { resolveFilteredPlayCandidates } from "#api/engine/effects/interpreter/actions/resolveFilteredPlayCandidates";

type OptionalPlayPreviewCard = { instanceId: string; cardId: string };

type GetOptionalPlayPreviewCardsParams = {
  ctx: EffectContext;
  action: Action;
};

function hasPreviewablePlayShape(action: Extract<Action, { kind: "PlayWithoutCost" }>): boolean {
  return (
    action.cost === undefined &&
    action.additionalCost === undefined &&
    !action.additionalCosts?.length &&
    action.requiresDelayArmed !== true &&
    action.fromOwnDigivolutionStack !== true &&
    action.target?.chooser !== "opponent" &&
    action.target?.isSelf !== true &&
    action.target?.filter?.isSelfRef !== true
  );
}

export async function getOptionalPlayPreviewCards({
  ctx,
  action,
}: GetOptionalPlayPreviewCardsParams): Promise<OptionalPlayPreviewCard[] | undefined> {
  if (action.kind !== "PlayWithoutCost" || !hasPreviewablePlayShape(action)) {
    return undefined;
  }
  const { candidates, target } = await resolveFilteredPlayCandidates({ ctx, action });
  if (candidates.length !== 1 || target.count !== 1 || target.totalPlayCostBudget !== undefined) {
    return undefined;
  }
  const readableInstanceIds = new Set<string>();
  for (const seat of [0, 1] as const) {
    for (const card of ctx.game.player(seat).trash) {
      readableInstanceIds.add(card.instanceId);
    }
  }
  for (const card of ctx.game.player(ctx.source.ownerSeat).hand) {
    readableInstanceIds.add(card.instanceId);
  }
  if (!candidates.every((candidate) => readableInstanceIds.has(candidate.instanceId))) {
    return undefined;
  }
  return candidates.map(({ instanceId, cardId }) => ({ instanceId, cardId }));
}
