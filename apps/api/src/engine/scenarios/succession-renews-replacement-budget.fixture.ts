import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT24-039", as: "base" }],
      hand: [
        { card: "BT24-101", as: "provider" },
        { card: "BT26-103", as: "successor" },
      ],
      deck: Array<string>(16).fill("ST1-03"),
      security: ["ST1-03", "ST1-03", "ST1-03"],
      eggDeck: ["BT1-001"],
    },
    1: {
      battleArea: [{ card: "EX12-065", as: "kaguya", under: ["ST1-03"] }],
      deck: Array<string>(12).fill("ST1-03"),
      security: ["ST1-16", "ST1-16", "ST1-16"],
    },
  },
};

export default fixture;
