import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["BT1-016"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-03"];
const opponentSecurity = ["ST2-10"];

const fixture: ScenarioFixture = {
  name: "drill-jamming",
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      battleArea: [{ card: "BT1-016", as: "tyrannomon" }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialRedDeckCounts, featured: [["BT1-016", 4]] }),
        placed: [...playerHand, ...playerSecurity, ...playerField],
        opening: ["ST1-10", "ST1-09"],
      }),
    },
    1: {
      hand: opponentHand,
      security: opponentSecurity.map((card) => ({ card, as: "plesiomon" })),
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentSecurity],
        opening: ["ST2-10"],
      }),
    },
  },
};

export default fixture;
