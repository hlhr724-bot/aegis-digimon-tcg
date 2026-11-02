import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 3,
  turnSeat: 1,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX9-048", as: "redirector", under: ["EX9-005", "EX9-048"] }],
      security: 5,
      eggDeck: ["BT1-001"],
      deck: Array<string>(8).fill("ST1-03"),
    },
    1: {
      battleArea: [{ card: "ST1-03", as: "attacker", dp: 3000 }],
      security: 5,
      eggDeck: ["BT1-001"],
      deck: Array<string>(8).fill("ST1-03"),
    },
  },
};

export default fixture;
