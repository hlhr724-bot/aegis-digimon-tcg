import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02", "ST1-13"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerBreeding = ["ST1-04"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-10", "ST2-03"];
const opponentSecurity = ["ST2-02"];

const fixture: ScenarioFixture = {
  name: "tutorial-hatch",
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      breeding: { card: "ST1-04", as: "dracomon", under: ["ST1-01"] },
      eggDeck: [{ card: "ST1-01", as: "next-egg" }, "ST1-01", "ST1-01"],
      deck: buildStoryDrawPile({
        counts: tutorialRedDeckCounts,
        placed: [...playerHand, ...playerSecurity, ...playerBreeding],
        opening: ["ST1-14", "ST1-10"],
      }),
    },
    1: {
      hand: opponentHand,
      security: opponentSecurity,
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentSecurity],
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
