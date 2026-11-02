import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "chiropmon-placement-evolution",
  board: {
    0: {
      battleArea: [
        { card: "BT27-073", as: "chiropmon" },
        { card: "BT26-095", as: "makoto" },
      ],
      hand: [{ card: "BT27-080", as: "scourge" }],
      trash: ["BT27-077"],
      deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
