import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "logimon-own-link",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT25-052", as: "logimon" },
        { card: "BT25-060", as: "rebootmon" },
      ],
      hand: [
        { card: "BT25-007", as: "link" },
        { card: "BT25-007", as: "ownLink" },
        { card: "BT25-089", as: "kazuki" },
      ],
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009"],
    },
    1: { security: ["BT1-009", "BT1-009", "BT1-009"], deck: ["BT1-009", "BT1-009"] },
  },
};

export default fixture;
