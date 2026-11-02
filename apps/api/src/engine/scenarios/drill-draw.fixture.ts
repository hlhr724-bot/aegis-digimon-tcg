import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = [{ card: "BT1-029", as: "gabumon" }];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["ST1-05"];
const opponentHand = ["ST2-05", "ST2-10", "ST2-03"];
const opponentSecurity = ["ST2-04"];

const fixture: ScenarioFixture = {
  name: "drill-draw",
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      battleArea: [{ card: "ST1-05", as: "birdramon" }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({
          base: tutorialRedDeckCounts,
          featured: [
            ["BT1-029", 4],
            ["BT4-038", 4],
          ],
        }),
        placed: ["BT1-029", ...playerSecurity, ...playerField],
        opening: ["ST1-10", "BT4-038"],
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
