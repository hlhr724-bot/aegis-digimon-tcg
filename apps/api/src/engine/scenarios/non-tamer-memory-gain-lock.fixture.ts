import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "non-tamer-memory-gain-lock",
  board: {
    0: {
      battleArea: [{ card: "BT3-061", as: "memory-lock" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "ST23-15", as: "option" },
        { card: "ST23-14", as: "tamer" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
