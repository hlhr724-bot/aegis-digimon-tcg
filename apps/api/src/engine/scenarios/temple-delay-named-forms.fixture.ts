import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "temple-delay-named-forms",
  memory: 3,
  turnSeat: 0,
  turnCount: 8,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-009", as: "attacker", dp: 3000 }],
      security: ["BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        { card: "BT24-093", as: "temple", placedByEffect: true, enterFieldTurnCount: 7 },
        { card: "BT26-103", as: "host", under: [{ card: "BT1-009", as: "under" }] },
      ],
      security: ["BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
