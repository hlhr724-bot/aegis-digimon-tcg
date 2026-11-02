import { millenniummonTournamentDeck } from "#api/story/decks/millenniummonTournamentDeck";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";
import { invisimonTournamentDeck } from "#api/story/decks/invisimonTournamentDeck";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "altea-shinjuku-story-adaptation",
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
      security: ["EX11-037", "BT24-058"],
      deck: buildStoryDrawPile({
        counts: invisimonTournamentDeck.mainDeck,
        substitutions: [["BT20-049", "BT20-050", 1]],
        placed: [
          "EX11-037",
          "EX11-039",
          "EX11-041",
          "BT20-086",
          "BT20-055",
          "EX11-037",
          "BT24-058",
          "BT20-086",
          "BT20-050",
          "EX11-037",
        ],
      }),
      eggDeck: ["EX11-004", "EX11-004", "EX11-004"],
      battleArea: [
        {
          card: "BT20-086",
        },
      ],
      breeding: {
        card: "BT20-050",
        under: ["EX11-004", "EX11-037"],
      },
    },
    "1": {
      hand: ["EX9-058", "BT18-013", "BT18-015", "BT18-073", "BT19-075"],
      security: ["EX9-058", "BT19-066", "BT18-073", "BT18-019"],
      deck: buildStoryDrawPile({
        counts: millenniummonTournamentDeck.mainDeck,
        placed: [
          "EX9-058",
          "BT18-013",
          "BT18-015",
          "BT18-073",
          "BT19-075",
          "EX9-058",
          "BT19-066",
          "BT18-073",
          "BT18-019",
          "BT18-015",
        ],
      }),
      eggDeck: ["BT15-006", "BT15-006", "BT15-006", "BT15-006"],
      battleArea: [
        {
          card: "BT18-015",
        },
      ],
    },
  },
};

export default fixture;
