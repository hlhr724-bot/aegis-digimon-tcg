import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "trait-card-trash-return",
  board: {
    0: {
      battleArea: [{ card: "BT12-013", as: "burning" }],
      hand: [{ card: "BT18-011", as: "agunimon" }],
      trash: [
        { card: "BT17-094", as: "ancientGuardian" },
        { card: "BT12-009", as: "hybrid" },
        { card: "BT18-017", as: "tenWarriors" },
        { card: "BT18-088", as: "inheritedTamer" },
        { card: "BT18-087", as: "plainTamer" },
        { card: "BT1-009", as: "unrelatedDigimon" },
        { card: "BT1-090", as: "unrelatedOption" },
      ],
      deck: ["BT1-009", "BT1-010", "BT1-011"],
      security: 3,
    },
    1: {
      trash: [{ card: "BT17-094", as: "opponentAncientGuardian" }],
      deck: ["BT1-009", "BT1-010"],
      security: 3,
    },
  },
  turnSeat: 0,
  turnCount: 2,
  memory: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
