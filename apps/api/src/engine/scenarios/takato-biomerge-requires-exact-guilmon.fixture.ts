import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT12-089", as: "takato" },
        { card: "EX8-009", as: "guilmonX", under: ["BT12-007"] },
      ],
      hand: [
        { card: "BT12-018", as: "gallantmon" },
        { card: "BT12-007", as: "guilmon" },
      ],
      trash: [
        { card: "BT12-010", as: "growlmon" },
        { card: "BT12-016", as: "warGrowlmon" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      security: 5,
    },
    1: {
      deck: Array<string>(8).fill("ST1-03"),
      security: 5,
    },
  },
};

export default fixture;
