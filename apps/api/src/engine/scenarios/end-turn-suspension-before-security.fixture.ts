import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "end-turn-suspension-before-security",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX13-062", as: "craniamon", under: ["P-245"] }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 5,
    },
    1: {
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: [{ card: "EX11-041", as: "oblivimon", faceUp: true }],
    },
  },
};

export default fixture;
