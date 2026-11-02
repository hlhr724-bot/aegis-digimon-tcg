import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "empty-field-with-hand",
  board: {
    0: {
      hand: Array<string>(6).fill("ST1-03"),
      deck: Array<string>(39).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      battleArea: [],
    },
    1: {
      deck: Array<string>(39).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      battleArea: [],
    },
  },
  memory: 0,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
