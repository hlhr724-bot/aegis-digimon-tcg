import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "knightmon-buffs-later-entrants",
  board: {
    0: {
      battleArea: [
        { card: "ST13-12", as: "knightmon" },
        { card: "BT2-075", as: "plain" },
      ],
      hand: [
        { card: "BT27-084", as: "option" },
        { card: "ST13-12", as: "laterKnight" },
      ],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array(8).fill("BT1-009"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
