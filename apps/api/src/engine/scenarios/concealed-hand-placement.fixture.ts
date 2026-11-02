import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "concealed-hand-placement",
  board: {
    0: {
      battleArea: [{ card: "BT3-089", as: "source" }],
      hand: [{ card: "EX10-059", as: "darkness" }],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-014", as: "host" }],
      hand: [
        { card: "BT1-010", as: "known" },
        { card: "BT1-009", as: "hidden" },
      ],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
