import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { buildDrillDeckCounts } from "#api/tutorial/buildDrillDeckCounts";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = [{ card: "ST3-09", as: "angewomon" }];
const playerField = ["ST3-06"];
const opponentHand = ["ST2-04", "ST2-10", "ST2-03"];
const opponentField = ["ST2-05"];

const fixture: ScenarioFixture = {
  name: "drill-recovery",
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    timed: false,
    opponent: { endBreeding: true, main: [{ kind: "attack" }], fallbackMain: "end" },
  },
  board: {
    0: {
      hand: playerHand,
      security: [],
      battleArea: [{ card: "ST3-06", as: "gatomon", enteredThisTurn: true }],
      deck: buildStoryDrawPile({
        counts: buildDrillDeckCounts({
          base: tutorialRedDeckCounts,
          featured: [
            ["ST3-09", 4],
            ["ST3-06", 4],
            ["ST3-02", 4],
          ],
        }),
        placed: ["ST3-09", ...playerField],
        opening: ["ST1-10", "ST1-09", "ST3-02"],
      }),
    },
    1: {
      hand: opponentHand,
      security: [],
      battleArea: [{ card: "ST2-05", as: "ikkakumon" }],
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentField],
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
