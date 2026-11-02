import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "alliance-suspension-draws-with-shoto",
  board: {
    0: {
      battleArea: [
        { card: "EX11-062", as: "shoto" },
        { card: "EX11-026", as: "bird" },
      ],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        { card: "AD1-009", as: "attacker" },
        { card: "ST1-03", as: "ally" },
      ],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
