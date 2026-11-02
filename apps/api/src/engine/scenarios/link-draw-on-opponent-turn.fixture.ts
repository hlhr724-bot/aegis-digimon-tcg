import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "link-draw-on-opponent-turn",
  memory: 3,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX10-073", as: "host" }],
      hand: [{ card: "P-190", as: "linkCard" }],
      deck: [{ card: "BT1-013", as: "linkDraw" }, { card: "BT1-014", as: "turnDraw" }, "BT1-010"],
      eggDeck: ["BT1-001"],
      security: ["BT1-010"],
    },
    1: {
      hand: ["BT1-010"],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      eggDeck: ["BT1-001"],
      security: ["BT1-010"],
    },
  },
  presentation: { opponent: { endBreeding: true, fallbackMain: "end" } },
};

export default fixture;
