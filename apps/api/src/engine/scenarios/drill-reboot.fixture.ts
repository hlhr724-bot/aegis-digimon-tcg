import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02", "ST1-13"];
const playerField = ["BT2-065"];
const opponentHand = ["ST2-04", "ST2-10", "ST2-03"];
const opponentField = ["ST2-05"];

const fixture: ScenarioFixture = {
  name: "drill-reboot",
  memory: 3,
  turnSeat: 1,
  turnCount: 5,
  isFirstPlayersFirstTurn: false,
  presentation: {
    timed: false,
    opponent: { endBreeding: true, main: [{ kind: "attack" }], fallbackMain: "end" },
  },
  board: {
    0: {
      hand: playerHand,
      security: [],
      battleArea: [{ card: "BT2-065", as: "warGreymon", suspended: true }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialRedDeckCounts, featured: [["BT2-065", 4]] }),
        placed: [...playerHand, ...playerField],
        opening: ["ST1-10"],
      }),
    },
    1: {
      hand: opponentHand,
      security: [],
      battleArea: [{ card: "ST2-05", as: "ikkakumon" }],
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentField],
        opening: ["ST2-10", "ST2-04"],
      }),
    },
  },
};

export default fixture;
