import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "execute-security-deletion-reaction-order",
  memory: 5,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  effects: [{ permanent: "tamer", kind: "suspendLock" }],
  board: {
    0: {
      battleArea: [
        { card: "BT26-075", as: "scourge" },
        { card: "BT26-095", as: "tamer", suspended: true, under: [{ card: "ST23-14", as: "cost", faceUp: false }] },
      ],
      hand: ["BT1-009"],
      deck: ["BT1-009", "BT1-009"],
      trash: [{ card: "BT27-073", as: "revived" }],
      security: ["BT1-009"],
    },
    1: { security: ["EX10-053", "BT1-009"], deck: ["BT1-009"] },
  },
};

export default fixture;
