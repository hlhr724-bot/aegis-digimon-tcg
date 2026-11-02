import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "alliance-exceeds-remaining-security",
  board: {
    0: {
      battleArea: [
        { card: "AD1-004", as: "attacker", under: ["ST21-04", "ST21-06"] },
        { card: "BT1-009", as: "firstAlly" },
        { card: "BT1-018", as: "secondAlly" },
      ],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array(8).fill("BT1-009"), security: ["BT1-009"] },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
