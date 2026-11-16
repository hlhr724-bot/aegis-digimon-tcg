import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "zero-dp-deleted-after-losing-color-buff",
  memory: 8,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX13-035", as: "dpReducer" },
        { card: "EX13-028", as: "firstNamedAlly" },
        { card: "EX13-028", as: "secondNamedAlly" },
        { card: "BT20-017", as: "playWatcher" },
      ],
      hand: [
        { card: "EX13-031", as: "recolorer" },
        { card: "EX13-027", as: "recolorCost" },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-019"),
      security: ["BT1-019", "BT1-019", "BT1-019"],
    },
    1: {
      battleArea: [
        { card: "BT25-055", as: "colorBuffed" },
        { card: "BT1-019", as: "survivor" },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-019"),
      security: [{ card: "BT24-094", as: "colorBuff", faceUp: true }, "BT1-019", "BT1-019"],
    },
  },
};

export default fixture;
