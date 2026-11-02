import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["BT10-050", "ST1-05"];
const opponentHand = ["ST2-05", "ST2-10"];
const opponentSecurity = ["ST2-04"];
const opponentField = ["BT14-011"];

const fixture: ScenarioFixture = {
  name: "drill-piercing",
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
      battleArea: [
        { card: "BT10-050", as: "wezenGammamon" },
        { card: "ST1-05", as: "birdramon" },
      ],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialRedDeckCounts, featured: [["BT10-050", 4]] }),
        placed: [...playerHand, ...playerSecurity, ...playerField],
        opening: ["ST1-10"],
      }),
    },
    1: {
      hand: opponentHand,
      security: opponentSecurity.map((card) => ({ card, as: "opponentSecurity" })),
      battleArea: [{ card: "BT14-011", as: "monochromon" }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({ base: tutorialBlueDeckCounts, featured: [["BT14-011", 4]] }),
        placed: [...opponentHand, ...opponentSecurity, ...opponentField],
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
