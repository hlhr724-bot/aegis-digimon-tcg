export type TournamentPoints = {
  win: number;
  draw: number;
  loss: number;
};

export const DEFAULT_TOURNAMENT_POINTS: TournamentPoints = { win: 3, draw: 1, loss: 0 };

export const MAX_TOURNAMENT_POINTS = 10;
