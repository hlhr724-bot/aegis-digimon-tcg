import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { deepSaversTournamentDeck } from "#api/story/decks/deepSaversTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "guardians-deep-close-story-adaptation",
  memory: 3,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["EX8-047", "EX8-048", "EX8-051", "EX8-067", "EX8-053"],
      security: ["EX8-067", "EX8-048"],
      deck: [
        "EX8-047",
        "EX8-050",
        "EX8-046",
        "EX8-046",
        "EX8-048",
        "EX8-053",
        "EX8-055",
        "P-144",
        "P-144",
        "EX8-070",
        "EX8-067",
        "EX8-067",
        "EX8-046",
        "EX8-050",
        "EX8-053",
        "EX8-055",
        "EX7-038",
        "EX8-050",
        "P-144",
        "P-107",
        "EX8-049",
        "P-107",
        "EX8-047",
        "EX8-053",
        "EX7-038",
        "EX8-070",
        "EX8-051",
        "EX8-049",
        "EX8-049",
        "EX8-046",
        "EX8-055",
        "EX8-049",
        "EX8-070",
        "P-144",
        "EX8-051",
        "EX8-055",
        "EX8-070",
        "EX8-050",
      ],
      eggDeck: ["EX8-005", "EX8-005", "EX8-005"],
      battleArea: [
        {
          card: "EX10-063",
        },
        {
          card: "EX10-063",
        },
      ],
      breeding: {
        card: "EX8-051",
        under: ["EX8-005", "EX8-047", "EX8-048"],
      },
    },
    "1": {
      hand: ["EX8-018", "EX8-021", "EX8-024", "BT19-082", "EX8-027"],
      security: ["EX8-018", "EX8-021", "EX8-024", "EX8-027", "LM-028"],
      deck: buildStoryDrawPile({
        counts: deepSaversTournamentDeck.mainDeck,
        substitutions: [
          ["BT11-085", "EX8-017", 2],
          ["BT11-085", "EX8-020", 2],
        ],
        placed: [
          "EX8-018",
          "EX8-021",
          "EX8-024",
          "BT19-082",
          "EX8-027",
          "EX8-018",
          "EX8-021",
          "EX8-024",
          "EX8-027",
          "LM-028",
          "EX8-020",
          "EX8-017",
          "EX8-027",
          "EX8-017",
          "EX8-020",
          "EX8-024",
        ],
      }),
      eggDeck: ["EX8-002", "EX8-002", "EX8-002"],
      battleArea: [
        {
          card: "EX8-020",
          under: ["EX8-017"],
        },
      ],
      breeding: {
        card: "EX8-027",
        under: ["EX8-002", "EX8-017", "EX8-020", "EX8-024"],
      },
    },
  },
};

export default fixture;
