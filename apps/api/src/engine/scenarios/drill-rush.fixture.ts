import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = [{ card: "BT4-038", as: "bushiAgumon" }];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-10"];

const fixture: ScenarioFixture = {
  name: "drill-rush",
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialRedDeckCounts, featured: [["BT4-038", 4]] }),
        placed: ["BT4-038", ...playerSecurity],
        opening: ["ST1-10"],
      }),
    },
    1: {
      hand: opponentHand,
      security: [],
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: opponentHand,
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
