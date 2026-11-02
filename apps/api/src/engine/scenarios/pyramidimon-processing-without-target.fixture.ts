import type { ScenarioFixture } from "#api/engine/scenario/types";

export const pyramidimonProcessingWithoutTarget: ScenarioFixture = {
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT10-064", as: "base", under: [{ card: "BT4-065", as: "rock" }] }],
      hand: [{ card: "EX10-033", as: "pyramidimon" }],
      deck: ["BT1-010", "BT1-011", "BT1-012"],
      security: 3,
      eggDeck: ["BT1-001"],
    },
    1: { breeding: { card: "BT1-010", as: "opponentBreeding" }, deck: ["BT1-010", "BT1-011"], security: 3 },
  },
};

export default pyramidimonProcessingWithoutTarget;
