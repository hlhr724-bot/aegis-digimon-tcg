import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 0,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-014", as: "redMaterial", suspended: true },
        { card: "BT1-051", as: "yellowMaterial", suspended: true },
      ],
      hand: [{ card: "BT16-012", as: "fusion" }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: 3,
    },
    1: { deck: ["BT1-010"], security: 3 },
  },
};

export default fixture;
