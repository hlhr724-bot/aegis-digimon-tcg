import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "attack-immunity-lapse-deletes-zero-dp",
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT27-103", as: "ouryuken", enterFieldTurnCount: -1 }],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        { card: "EX13-037", as: "firstDynasmon", enterFieldTurnCount: -1 },
        { card: "EX13-037", as: "secondDynasmon", enterFieldTurnCount: -1 },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
