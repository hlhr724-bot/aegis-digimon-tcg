import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 5,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT20-077", as: "ace", under: ["EX7-001", "EX7-055"] },
        { card: "EX11-050", as: "scapegoatSource" },
      ],
      deck: ["BT1-010", "BT1-011", "BT1-012"],
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      deck: ["BT1-010", "BT1-011", "BT1-012"],
      eggDeck: ["BT1-001"],
      security: [{ card: "EX13-077", as: "securityDigimon" }],
    },
  },
};

export default fixture;
