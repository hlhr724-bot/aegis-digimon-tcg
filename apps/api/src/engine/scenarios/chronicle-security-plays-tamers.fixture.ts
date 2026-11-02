import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "chronicle-security-plays-tamers",
  turnSeat: 1,
  turnCount: 3,
  memory: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: [{ card: "BT20-095", as: "fellowship" }, "BT1-009"],
      hand: [{ card: "EX13-072", as: "hand-tamer" }, "BT1-085", "BT20-095", "BT20-015"],
      trash: [{ card: "BT20-087", as: "trash-tamer" }],
    },
    1: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
      battleArea: [{ card: "BT1-010", as: "fellowship-attacker" }],
    },
  },
};

export default fixture;
