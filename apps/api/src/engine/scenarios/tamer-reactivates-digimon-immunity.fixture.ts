import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "tamer-reactivates-digimon-immunity",
  memory: 3,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT22-092", as: "jimmy" },
        { card: "BT22-074", as: "flameBase" },
      ],
      hand: [{ card: "BT22-078", as: "boltmon" }],
      deck: Array.from({ length: 12 }, () => "BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT25-035", as: "protectedBase" },
        { card: "BT1-089", as: "tamer", under: [{ card: "BT1-010", as: "immunityCost", faceUp: false }] },
      ],
      hand: [{ card: "BT26-057", as: "bearcatmon" }],
      deck: Array.from({ length: 12 }, () => "BT1-010"),
      security: 3,
    },
  },
};

export default fixture;
