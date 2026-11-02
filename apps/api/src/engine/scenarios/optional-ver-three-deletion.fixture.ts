import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "optional-ver-three-deletion",
  board: {
    0: {
      battleArea: [{ card: "BT26-055", as: "resident" }],
      hand: [
        { card: "BT26-055", as: "giromon" },
        { card: "BT1-009", as: "material" },
      ],
      deck: ["BT1-010", "BT1-010"],
    },
    1: { battleArea: [{ card: "BT1-009", as: "opponent" }], deck: ["BT1-010", "BT1-010"] },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
