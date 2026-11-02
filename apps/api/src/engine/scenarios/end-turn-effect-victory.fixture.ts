import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "end-turn-effect-victory",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009"],
      trash: [{ card: "EX10-071", as: "paradise-lost" }],
      battleArea: [{ card: "BT4-115", as: "lucemon" }],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      security: [],
    },
  },
  turnSeat: 0,
  turnCount: 3,
  memory: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
