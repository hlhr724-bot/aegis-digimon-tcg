import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "play-cost-deletion-watchers-wait-for-play",
  board: {
    0: {
      hand: [
        { card: "BT13-083", as: "gizmonAt" },
        { card: "BT27-075", as: "protoGizmon" },
        { card: "BT27-048", as: "stegomon" },
        { card: "BT1-085", as: "spareOption" },
      ],
      battleArea: [
        { card: "BT2-070", as: "tapirmon" },
        { card: "BT27-098", as: "kurata" },
        { card: "BT27-102", as: "bioHybrid" },
      ],
      breeding: { card: "BT1-003", as: "egg" },
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array(12).fill("BT1-009"), security: 3 },
  },
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
