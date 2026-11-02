import { dynasmonTournamentDeck } from "#api/story/decks/dynasmonTournamentDeck";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { invisimonTournamentDeck } from "#api/story/decks/invisimonTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "altea-mistymon-story-adaptation",
  memory: 3,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: true,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: ["EX11-037", "EX11-039", "EX11-041", "BT20-086", "BT20-055"],
      security: ["EX11-037", "BT20-049", "EX11-041", "EX11-043", "P-231"],
      deck: buildStoryDrawPile({
        counts: invisimonTournamentDeck.mainDeck,
        placed: [
          "EX11-037",
          "EX11-039",
          "EX11-041",
          "BT20-086",
          "BT20-055",
          "EX11-037",
          "BT20-049",
          "EX11-041",
          "EX11-043",
          "P-231",
        ],
      }),
      eggDeck: ["EX11-004", "EX11-004", "EX11-004"],
      battleArea: [],
      breeding: {
        card: "EX11-004",
      },
    },
    "1": {
      hand: ["EX13-025", "BT18-036", "BT18-039", "BT1-087", "BT19-042"],
      security: ["BT18-030", "EX13-029", "EX13-033", "EX13-034", "BT1-087"],
      deck: buildStoryDrawPile({
        counts: dynasmonTournamentDeck.mainDeck,
        substitutions: [["EX13-033", "BT18-039", 1]],
        placed: [
          "EX13-025",
          "BT18-036",
          "BT18-039",
          "BT1-087",
          "BT19-042",
          "BT18-030",
          "EX13-029",
          "EX13-033",
          "EX13-034",
          "BT1-087",
        ],
      }),
      eggDeck: ["EX13-004", "EX13-004", "EX13-004"],
      battleArea: [],
      breeding: {
        card: "EX13-004",
      },
    },
  },
};

export default fixture;
