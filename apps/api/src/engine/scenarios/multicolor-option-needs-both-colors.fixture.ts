import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "multicolor-option-needs-both-colors",
  board: {
    0: {
      battleArea: [{ card: "BT14-032", as: "chuumon", under: ["BT14-003"] }],
      hand: [
        { card: "BT14-097", as: "curse" },
        { card: "BT14-034", as: "sukamon" },
        { card: "BT11-043", as: "king-sukamon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array<string>(8).fill("BT1-009"), security: 3 },
  },
  memory: 2,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
