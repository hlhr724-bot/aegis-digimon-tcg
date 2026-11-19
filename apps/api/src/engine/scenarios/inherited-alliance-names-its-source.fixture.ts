import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "inherited-alliance-names-its-source",
  board: {
    0: {
      battleArea: [
        { card: "EX13-012", as: "attacker", under: [{ card: "ST20-04", as: "allianceSource" }] },
        { card: "BT1-009", as: "firstAlly" },
        { card: "BT1-010", as: "secondAlly" },
      ],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
