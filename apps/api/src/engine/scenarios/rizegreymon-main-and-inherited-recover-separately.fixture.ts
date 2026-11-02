import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "rizegreymon-main-and-inherited-recover-separately",
  board: {
    0: {
      battleArea: [
        { card: "BT21-042", as: "geogreymon" },
        { card: "BT13-095", as: "first-marcus" },
        { card: "BT13-095", as: "second-marcus" },
      ],
      hand: [
        { card: "BT21-044", as: "rizegreymon" },
        { card: "BT13-018", as: "shinegreymon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-084", "BT1-084", "BT1-084"],
    },
  },
  memory: 6,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
