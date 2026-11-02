import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "bacchusmon-suspends-opponent-evolution",
  board: {
    0: {
      battleArea: [{ card: "BT25-077", as: "bacchusmon", suspended: true }],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "opponent" }],
      hand: [{ card: "BT1-019", as: "evolution" }],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 5,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      endBreeding: true,
      fallbackMain: "end",
      main: [{ kind: "digivolve", card: "BT1-019", base: "BT1-009" }],
    },
    holdBotAfterTurn: 5,
  },
};

export default fixture;
