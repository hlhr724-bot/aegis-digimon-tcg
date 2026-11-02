import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { medusamonTournamentDeck } from "#api/story/decks/medusamonTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dragonkin-aggro-story-adaptation",
  memory: 4,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["ST18-05", "ST18-06", "ST18-11", "ST18-14", "ST18-13"],
      security: ["ST18-15", "ST18-08", "ST18-06", "ST18-13", "ST18-08"],
      deck: [
        "ST18-06",
        "ST18-08",
        "EX7-074",
        "ST18-05",
        "ST18-08",
        "ST18-15",
        "ST18-07",
        "ST18-07",
        "EX7-074",
        "ST18-15",
        "ST18-15",
        "ST18-05",
        "ST18-11",
        "ST18-13",
        "ST18-14",
        "ST18-04",
        "ST18-11",
        "ST18-07",
        "BT18-045",
        "ST18-10",
        "ST18-12",
        "ST18-06",
        "ST18-13",
        "ST18-04",
        "EX7-074",
        "ST18-12",
        "ST18-10",
        "ST18-10",
        "ST18-04",
        "ST18-14",
        "ST18-10",
        "BT18-045",
        "ST18-07",
        "ST18-12",
        "ST18-14",
        "EX7-074",
        "ST18-11",
      ],
      eggDeck: ["ST18-01", "ST18-01", "ST18-01", "ST18-01"],
      battleArea: [
        {
          card: "ST18-12",
        },
        "ST18-04",
        "ST18-05",
      ],
    },
    "1": {
      hand: ["BT21-008", "BT21-017", "BT24-016", "BT21-081", "BT24-017"],
      security: ["EX11-012", "BT24-018"],
      deck: buildStoryDrawPile({
        counts: medusamonTournamentDeck.mainDeck,
        substitutions: [
          ["EX11-054", "BT18-087", 1],
          ["EX11-012", "BT21-025", 1],
        ],
        placed: [
          "BT21-008",
          "BT21-017",
          "BT24-016",
          "BT21-081",
          "BT24-017",
          "EX11-012",
          "BT24-018",
          "BT18-087",
          "BT21-081",
          "BT21-025",
          "BT21-008",
          "BT21-017",
        ],
      }),
      eggDeck: ["BT21-001", "BT21-001", "BT21-001"],
      battleArea: [
        {
          card: "BT18-087",
        },
        {
          card: "BT21-081",
        },
      ],
      breeding: {
        card: "BT21-025",
        under: ["BT21-001", "BT21-008", "BT21-017"],
      },
    },
  },
};

export default fixture;
