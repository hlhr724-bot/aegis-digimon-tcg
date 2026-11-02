export interface TurnPlannerWeights {
  memoryGiven: number;
  opponentSecurity: number;
  ownHand: number;
  ownBoardDp: number;
  ownBoardLevels: number;
  opponentBoardDp: number;
  win: number;
}

export interface TurnPlannerParameters {
  depth: number;
  beam: number;
  weights: TurnPlannerWeights;
}

export const defaultTurnPlannerParameters: TurnPlannerParameters = Object.freeze({
  depth: 3,
  beam: 6,
  weights: Object.freeze({
    memoryGiven: -0.5,
    opponentSecurity: 0,
    ownHand: 0,
    ownBoardDp: 0.3,
    ownBoardLevels: 0,
    opponentBoardDp: -0.3,
    win: 20,
  }),
});
