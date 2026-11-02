import { MAX_TOURNAMENT_POINTS, type TournamentPoints } from "#shared/tournaments/TournamentPoints";

function isPointValue(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TOURNAMENT_POINTS;
}

export function isTournamentPoints(value: unknown): value is TournamentPoints {
  if (typeof value !== "object" || value === null) return false;
  const { win, draw, loss } = value as Record<string, unknown>;
  return isPointValue(win) && isPointValue(draw) && isPointValue(loss) && win > draw && draw >= loss;
}
