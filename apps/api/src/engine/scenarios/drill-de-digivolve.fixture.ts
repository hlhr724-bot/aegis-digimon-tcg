import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = [{ card: "ST15-10", as: "andromon" }];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["ST15-07"];
const opponentHand = ["ST2-05", "ST2-10", "ST2-03"];
const opponentField = ["BT14-011", "ST2-02"];

const fixture: ScenarioFixture = {
  name: "drill-de-digivolve",
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    timed: false,
    opponent: { endBreeding: true, fallbackMain: "end", blockerCard: "BT14-011" },
  },
  board: {
    0: {
      hand: playerHand,
      security: playerSecurity,
      battleArea: [{ card: "ST15-07", as: "tankmon" }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({
          base: tutorialRedDeckCounts,
          featured: [
            ["ST15-10", 4],
            ["ST15-07", 4],
          ],
        }),
        placed: ["ST15-10", ...playerSecurity, ...playerField],
        opening: ["ST1-10", "ST1-09"],
      }),
    },
    1: {
      hand: opponentHand,
      security: [],
      battleArea: [{ card: "BT14-011", as: "monochromon", under: [{ card: "ST2-02", as: "gomamon" }] }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialBlueDeckCounts, featured: [["BT14-011", 4]] }),
        placed: [...opponentHand, ...opponentField],
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
