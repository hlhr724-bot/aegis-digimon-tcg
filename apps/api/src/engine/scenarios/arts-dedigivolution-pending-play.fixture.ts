import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT9-092", as: "whiteTamer" }],
      hand: [{ card: "EX13-066", as: "mickey" }],
      trash: [{ card: "BT23-076", as: "blanc" }],
      security: ["ST1-03", "ST1-03", "ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
      eggDeck: ["BT1-001"],
    },
    1: {
      battleArea: [{ card: "BT13-065", as: "platinum" }],
      security: ["ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
    },
  },
};

export default fixture;
