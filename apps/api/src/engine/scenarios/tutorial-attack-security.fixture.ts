import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { tutorialBlueDeckCounts } from "#api/tutorial/tutorialBlueDeckCounts";
import { tutorialRedDeckCounts } from "#api/tutorial/tutorialRedDeckCounts";

const playerHand = ["ST1-02", "ST1-03"];
const playerSecurity = ["ST1-04", "ST1-02", "ST1-03"];
const playerField = ["ST1-05", "ST1-04"];
const opponentHand = ["ST2-04", "ST2-05", "ST2-10", "ST2-03"];
const opponentSecurity = ["ST2-02"];

const fixture: ScenarioFixture = {
  name: "tutorial-attack-security",
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
        { card: "ST1-05", as: "birdramon" },
        { card: "ST1-04", as: "dracomon" },
      ],
      deck: buildStoryDrawPile({
        counts: tutorialRedDeckCounts,
        placed: [...playerHand, ...playerSecurity, ...playerField],
        opening: ["ST1-02"],
      }),
    },
    1: {
      hand: opponentHand,
      security: opponentSecurity.map((card) => ({ card, as: "opponent-security" })),
      deck: buildStoryDrawPile({
        counts: tutorialBlueDeckCounts,
        placed: [...opponentHand, ...opponentSecurity],
        opening: ["ST2-04"],
      }),
    },
  },
};

export default fixture;
