import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "raising-card-alignment",
  board: {
    0: {
      deck: Array<string>(10).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      breeding: { card: "ST1-03", under: ["BT1-001"] },
    },
    1: {
      deck: Array<string>(10).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      breeding: { card: "ST1-08", under: ["BT1-001", "ST1-02", "ST1-07"] },
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
