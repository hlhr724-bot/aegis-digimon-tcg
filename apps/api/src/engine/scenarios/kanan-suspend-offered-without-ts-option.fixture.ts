import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "kanan-suspend-offered-without-ts-option",
  board: {
    0: {
      battleArea: [{ card: "BT26-090", as: "kanan" }],
      hand: [
        { card: "BT24-085", as: "danAndKanan" },
        { card: "BT24-031", as: "elecmon" },
        { card: "BT25-039", as: "sirenmon" },
        { card: "BT25-047", as: "floramon" },
      ],
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 0,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
