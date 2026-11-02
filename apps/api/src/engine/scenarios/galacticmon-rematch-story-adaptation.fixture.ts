import { medusamonTournamentDeck } from "#api/story/decks/medusamonTournamentDeck";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "galacticmon-rematch-story-adaptation",
  memory: 4,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["BT21-008", "BT21-017", "BT24-016", "BT21-081", "BT24-017"],
      security: [],
      deck: buildStoryDrawPile({
        counts: medusamonTournamentDeck.mainDeck,
        substitutions: [
          ["BT24-008", "BT21-007", 1],
          ["P-189", "BT21-015", 1],
          ["EX11-012", "BT21-026", 1],
        ],
        placed: [
          "BT21-008",
          "BT21-017",
          "BT24-016",
          "BT21-081",
          "BT24-017",
          "BT21-026",
          "BT21-007",
          "BT21-015",
          "BT21-024",
          "P-035",
          "P-035",
        ],
      }),
      eggDeck: ["BT21-001", "BT21-001", "BT21-001"],
      battleArea: [
        {
          card: "BT21-026",
          as: "warGreymon",
          under: ["BT21-001", "BT21-007", "BT21-015", "BT21-024"],
        },
        {
          card: "P-035",
          as: "firstBoost",
        },
        {
          card: "P-035",
          as: "secondBoost",
        },
      ],
    },
    "1": {
      hand: ["BT11-061", "BT18-065", "P-094", "BT18-092", "BT11-111"],
      security: ["BT18-060", "P-094", "BT11-061", "BT18-092", "BT11-111"],
      deck: [
        "BT4-109",
        "BT11-105",
        "BT11-061",
        "BT11-061",
        "BT11-061",
        "BT11-061",
        "BT18-092",
        "BT11-061",
        "BT11-061",
        "BT18-071",
        "BT11-061",
        "BT11-065",
        "BT18-060",
        "BT18-060",
        "BT11-061",
        "P-094",
        "BT11-105",
        "BT4-109",
        "BT18-065",
        "BT11-061",
        "BT18-065",
        "BT11-061",
        "BT18-065",
        "BT11-105",
        "BT18-060",
        "BT18-071",
        "BT11-105",
        "P-094",
      ],
      eggDeck: ["BT7-005", "BT7-005", "BT7-005"],
      battleArea: [
        {
          card: "BT11-111",
          under: ["BT11-061", "BT11-061", "BT11-061", "BT11-061", "BT11-061", "BT11-061", "BT11-061", "BT11-061"],
        },
        {
          card: "BT18-092",
        },
      ],
      breeding: {
        card: "BT11-065",
        under: ["BT7-005", "BT11-061"],
      },
    },
  },
};

export default fixture;
