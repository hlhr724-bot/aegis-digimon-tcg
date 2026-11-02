import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { lucemonTournamentDeck } from "#api/story/decks/lucemonTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "ryutaro-heroes-story-adaptation",
  memory: 3,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["EX8-007", "EX8-041", "EX8-043", "EX8-065", "BT11-059"],
      security: ["BT14-011", "EX8-041"],
      deck: [
        "P-038",
        "EX8-041",
        "EX8-011",
        "P-035",
        "EX8-043",
        "P-160",
        "BT11-059",
        "BT14-011",
        "EX8-011",
        "EX8-014",
        "P-035",
        "P-038",
        "P-038",
        "EX8-041",
        "BT14-016",
        "EX8-065",
        "EX8-014",
        "BT14-016",
        "EX8-016",
        "P-160",
        "EX8-011",
        "EX8-043",
        "EX8-043",
        "BT14-011",
        "EX8-007",
        "P-038",
        "P-160",
        "EX8-016",
        "EX8-016",
        "EX8-007",
        "BT11-059",
        "EX8-016",
        "P-035",
        "EX8-014",
        "BT14-011",
        "BT11-059",
        "P-035",
        "P-160",
      ],
      eggDeck: ["EX8-001", "EX8-001", "EX8-001"],
      battleArea: [
        {
          card: "EX8-014",
        },
        {
          card: "EX8-065",
        },
        {
          card: "EX8-065",
        },
      ],
      breeding: {
        card: "EX8-011",
        under: ["EX8-001", "EX8-007"],
      },
    },
    "1": {
      hand: ["EX6-018", "EX10-013", "EX10-052", "BT18-101", "BT18-086"],
      security: ["EX6-018", "EX10-013", "EX10-052", "BT18-086", "EX10-071"],
      deck: buildStoryDrawPile({
        counts: lucemonTournamentDeck.mainDeck,
        placed: [
          "EX6-018",
          "EX10-013",
          "EX10-052",
          "BT18-101",
          "BT18-086",
          "EX6-018",
          "EX10-013",
          "EX10-052",
          "BT18-086",
          "EX10-071",
          "BT18-034",
          "BT18-034",
          "BT18-082",
        ],
      }),
      eggDeck: ["EX10-004", "EX10-004", "EX10-004", "EX10-004"],
      battleArea: [
        {
          card: "BT18-034",
        },
        {
          card: "BT18-034",
        },
        {
          card: "BT18-082",
        },
      ],
    },
  },
};

export default fixture;
