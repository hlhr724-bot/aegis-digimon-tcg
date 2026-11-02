import type { BotUnit, BotView } from "#api/bot/view";

interface SelectAllianceAllyParams {
  view: BotView;
  attackerId: string;
  eligibleAllyIds?: readonly string[];
}

export function selectAllianceAlly({
  view,
  attackerId,
  eligibleAllyIds,
}: SelectAllianceAllyParams): BotUnit | undefined {
  if (view.opponentBoard.length === 0) return undefined;
  return view.board.reduce<BotUnit | undefined>((best, ally) => {
    if (
      ally.permanentId === attackerId ||
      ally.suspended ||
      ally.inBreeding ||
      ally.cannotSuspend ||
      (eligibleAllyIds === undefined && ally.dp <= 0) ||
      (eligibleAllyIds !== undefined && !eligibleAllyIds.includes(ally.permanentId))
    )
      return best;
    return best === undefined || ally.dp > best.dp ? ally : best;
  }, undefined);
}
