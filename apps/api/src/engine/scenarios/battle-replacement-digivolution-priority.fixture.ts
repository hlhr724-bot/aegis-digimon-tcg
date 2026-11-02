import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "battle-replacement-digivolution-priority",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      hand: [{ card: "BT26-060", as: "destroy-mode" }],
      security: ["BT1-009"],
      battleArea: [
        { card: "BT26-085", as: "giant-slayer", dp: 10000 },
        { card: "BT25-086", as: "dan" },
      ],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009"],
      battleArea: [{ card: "EX13-076", as: "paladin", dp: 16000, suspended: true }],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
