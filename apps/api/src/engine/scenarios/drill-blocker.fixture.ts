import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02", "ST1-13"];
const playerField = ["BT14-011"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-10"];
const opponentField = ["ST2-02"];

const fixture: ScenarioFixture = {
  name: "drill-blocker",
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
      battleArea: [{ card: "BT14-011", as: "monochromon" }],
      deck: buildStoryDrawPile({
        counts: tutorialRedDeckCounts,
        placed: [...playerHand, ...playerField],
        opening: ["ST1-10"],
      }),
    },
    1: {
      hand: opponentHand,
      security: [],
      battleArea: [{ card: "ST2-02", as: "gomamon" }],
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentField],
        opening: ["ST2-10", "ST2-05"],
      }),
    },
  },
};

export default fixture;
