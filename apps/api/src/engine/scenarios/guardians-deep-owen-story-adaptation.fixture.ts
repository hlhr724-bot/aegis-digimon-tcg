import { deepSaversTournamentDeck } from "#api/story/decks/deepSaversTournamentDeck";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { medusamonTournamentDeck } from "#api/story/decks/medusamonTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "guardians-deep-owen-story-adaptation",
  memory: 3,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["BT21-008", "BT21-017", "BT24-016", "BT21-081", "BT24-017"],
      security: ["BT24-012", "EX11-012", "BT24-016", "BT24-018", "P-035"],
      deck: buildStoryDrawPile({
        counts: medusamonTournamentDeck.mainDeck,
        placed: [
          "BT21-008",
          "BT21-017",
          "BT24-016",
          "BT21-081",
          "BT24-017",
          "BT24-012",
          "EX11-012",
          "BT24-016",
          "BT24-018",
          "P-035",
        ],
      }),
      eggDeck: ["BT21-001", "BT21-001", "BT21-001"],
      battleArea: [],
      breeding: {
        card: "BT21-001",
      },
    },
    "1": {
      hand: ["EX8-018", "EX8-021", "EX8-024", "BT19-082", "EX8-027"],
      security: ["EX8-018", "EX8-021", "EX8-024", "EX8-027", "LM-028"],
      deck: buildStoryDrawPile({
        counts: deepSaversTournamentDeck.mainDeck,
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
        ],
      }),
      eggDeck: ["EX8-002", "EX8-002", "EX8-002"],
      battleArea: [],
      breeding: {
        card: "EX8-002",
      },
    },
  },
};

export default fixture;
