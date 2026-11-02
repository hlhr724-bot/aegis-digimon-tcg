import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "linking-returns-low-dp-digimon",
  board: {
    0: {
      eggDeck: ["BT21-001"],
      hand: [{ card: "ST22-12", as: "linkCard" }],
      battleArea: [{ card: "BT21-009", as: "host" }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: ["BT1-010"],
    },
    1: {
      battleArea: [
        { card: "BT1-010", as: "eligible", dp: 5000 },
        { card: "BT1-010", as: "ineligible", dp: 6000 },
        { card: "BT1-010", as: "otherEligible", dp: 4000 },
      ],
      deck: ["BT1-010", "BT1-010"],
      security: ["BT1-010"],
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
