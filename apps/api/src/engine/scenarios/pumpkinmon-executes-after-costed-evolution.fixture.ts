import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "pumpkinmon-executes-after-costed-evolution",
  board: {
    0: {
      battleArea: [{ card: "BT24-046", as: "garurumon" }],
      hand: [
        { card: "BT26-030", as: "pumpkinmon" },
        { card: "BT1-009", as: "payment" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array<string>(8).fill("BT1-009"), security: ["BT1-009", "BT1-009", "BT1-009"] },
  },
  memory: 2,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
