import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "end-turn-play-respects-opponent-lock",
  board: {
    0: {
      battleArea: [{ card: "EX13-060", as: "alphamon" }],
      hand: [{ card: "BT20-048", as: "dorumon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "ST1-09", as: "imperialdramon" }],
      hand: [{ card: "BT20-020", as: "fighter-mode" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 6,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      endBreeding: true,
      main: [{ kind: "digivolve", card: "BT20-020", base: "ST1-09" }],
      fallbackMain: "end",
    },
  },
};

export default fixture;
