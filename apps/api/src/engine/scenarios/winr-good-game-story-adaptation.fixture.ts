import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { natureSpiritsTournamentDeck } from "#api/story/decks/natureSpiritsTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "winr-good-game-story-adaptation",
  memory: 3,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["BT19-045", "BT18-046", "BT18-052", "BT19-084", "BT19-053"],
      security: [
        {
          card: "BT19-048",
          faceUp: true,
        },
        {
          card: "BT18-046",
          faceUp: true,
        },
        {
          card: "BT18-056",
          faceUp: true,
        },
        {
          card: "BT18-052",
          faceUp: true,
        },
        "BT1-083",
      ],
      deck: [
        "BT18-056",
        "BT1-083",
        "BT18-046",
        "BT1-073",
        "BT18-046",
        "BT19-048",
        "P-038",
        "BT1-073",
        "BT18-052",
        "BT19-096",
        "BT1-073",
        "BT1-073",
        "BT19-052",
        "P-038",
        "BT1-066",
        "BT19-045",
        "BT19-053",
        "BT18-056",
        "BT19-096",
        "BT19-052",
        "BT19-053",
        "BT18-052",
        "P-038",
        "P-038",
        "BT19-045",
        "BT1-066",
        "BT19-084",
        "BT19-048",
        "BT19-052",
        "BT19-045",
        "BT1-066",
        "BT19-048",
        "BT1-083",
        "BT18-056",
        "BT19-084",
        "BT1-066",
        "BT1-083",
        "BT19-053",
      ],
      eggDeck: ["BT18-004", "BT18-004", "BT18-004", "BT18-004"],
      battleArea: [
        {
          card: "BT19-052",
        },
        {
          card: "BT19-084",
        },
      ],
    },
    "1": {
      hand: ["EX7-038", "EX7-041", "EX7-045", "EX7-022", "EX7-029"],
      security: ["EX7-015", "EX7-018", "EX7-035", "EX7-037", "EX8-069"],
      deck: buildStoryDrawPile({
        counts: natureSpiritsTournamentDeck.mainDeck,
        placed: [
          "EX7-038",
          "EX7-041",
          "EX7-045",
          "EX7-022",
          "EX7-029",
          "EX7-015",
          "EX7-018",
          "EX7-035",
          "EX7-037",
          "EX8-069",
          "EX7-037",
          "EX7-045",
          "EX7-022",
        ],
      }),
      eggDeck: ["EX8-004", "EX8-004", "EX8-004", "EX8-004", "P-148"],
      battleArea: [
        {
          card: "EX7-037",
        },
        {
          card: "EX7-045",
        },
        {
          card: "EX7-022",
        },
      ],
    },
  },
};

export default fixture;
