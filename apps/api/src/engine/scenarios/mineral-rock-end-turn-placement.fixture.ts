import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "mineral-rock-end-turn-placement",
  board: {
    0: {
      battleArea: [{ card: "EX8-055", as: "pyramid" }],
      trash: [
        { card: "EX8-053", as: "mineral" },
        { card: "EX8-046", as: "rock" },
        { card: "BT9-005", as: "egg" },
        { card: "BT1-009", as: "unrelated" },
      ],
      deck: ["BT1-009", "BT1-010"],
      security: 3,
    },
    1: { deck: ["BT1-009", "BT1-010"], security: 3 },
  },
  turnSeat: 0,
  turnCount: 2,
  memory: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
