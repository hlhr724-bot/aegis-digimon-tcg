import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["EX4-025", "ST1-04", "ST1-05"];
const opponentHand = ["ST2-05", "ST2-10", "ST2-03"];
const opponentSecurity = ["ST2-02", "ST2-04"];

const fixture: ScenarioFixture = {
  name: "drill-alliance",
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      battleArea: [
        { card: "EX4-025", as: "turuiemon" },
        { card: "ST1-04", as: "dracomon", enteredThisTurn: true },
        { card: "ST1-05", as: "birdramon" },
      ],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialRedDeckCounts, featured: [["EX4-025", 4]] }),
        placed: [...playerHand, ...playerSecurity, ...playerField],
        opening: ["ST1-10"],
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
