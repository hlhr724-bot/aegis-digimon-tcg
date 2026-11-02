import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 0,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT26-051", as: "host", suspended: true, linked: [{ card: "EX10-024", as: "link" }] }],
      hand: [{ card: "BT25-036", as: "fusion" }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: [{ card: "BT1-010", as: "security" }],
    },
    1: { deck: ["BT1-010"], security: 3 },
  },
};

export default fixture;
