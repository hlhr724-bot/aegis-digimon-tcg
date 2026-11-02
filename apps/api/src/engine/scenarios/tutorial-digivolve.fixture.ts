import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = [{ card: "ST1-07", as: "greymon" }, "ST1-10"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["ST1-03", "ST1-02"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-10", "ST2-03"];
const opponentSecurity = ["ST2-02"];

const fixture: ScenarioFixture = {
  name: "tutorial-digivolve",
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
        { card: "ST1-03", as: "agumon" },
        { card: "ST1-02", as: "biyomon" },
      ],
      deck: buildStoryDrawPile({
        counts: tutorialRedDeckCounts,
        placed: ["ST1-07", "ST1-10", ...playerSecurity, ...playerField],
        opening: ["ST1-14", "ST1-13"],
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
