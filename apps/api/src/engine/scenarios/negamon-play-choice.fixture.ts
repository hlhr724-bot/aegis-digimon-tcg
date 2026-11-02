import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "negamon-play-choice",
  board: {
    0: {
      breeding: { card: "EX9-005", as: "negamon" },
      hand: [
        { card: "EX9-047", as: "eyesmon" },
        { card: "BT1-009", as: "unrelated" },
      ],
      trash: ["EX9-048", "EX9-048", "EX9-048", "EX9-048"],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: { deck: ["BT1-009", "BT1-009"], security: ["BT1-009", "BT1-009", "BT1-009"] },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
