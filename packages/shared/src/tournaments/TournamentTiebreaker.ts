export const TournamentTiebreaker = {
  OPPONENT_MATCH_WIN_RATE: {
    name: "OPPONENT_MATCH_WIN_RATE",
    value: "opponent_match_win_rate",
    swiss: true,
    roundRobin: false,
  },
  GAME_WIN_RATE: { name: "GAME_WIN_RATE", value: "game_win_rate", swiss: true, roundRobin: true },
  OPPONENT_OPPONENT_MATCH_WIN_RATE: {
    name: "OPPONENT_OPPONENT_MATCH_WIN_RATE",
    value: "opponent_opponent_match_win_rate",
    swiss: true,
    roundRobin: false,
  },
  MATCH_WINS: { name: "MATCH_WINS", value: "match_wins", swiss: false, roundRobin: true },
  HEAD_TO_HEAD: { name: "HEAD_TO_HEAD", value: "head_to_head", swiss: true, roundRobin: true },
  MATCH_WIN_RATE: { name: "MATCH_WIN_RATE", value: "match_win_rate", swiss: true, roundRobin: false },
  OPPONENT_POINTS: { name: "OPPONENT_POINTS", value: "opponent_points", swiss: true, roundRobin: false },
  DEFEATED_OPPONENT_POINTS: {
    name: "DEFEATED_OPPONENT_POINTS",
    value: "defeated_opponent_points",
    swiss: true,
    roundRobin: false,
  },
  GAME_DIFFERENCE: { name: "GAME_DIFFERENCE", value: "game_difference", swiss: true, roundRobin: true },
} as const;

export type TournamentTiebreaker = (typeof TournamentTiebreaker)[keyof typeof TournamentTiebreaker]["value"];
