import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";

const hand0 = ["ST19-02", "ST19-07", "ST19-13", "ST19-09", "ST19-04"];
const security0 = ["ST19-13", "ST19-10", "ST19-07", "ST19-04", "EX7-068"];
const hand1 = ["BT6-060", "EX7-040", "EX7-044", "EX7-048", "EX7-043"];
const security1 = ["EX7-011", "BT6-060", "EX7-070", "EX7-013", "EX7-044"];
const fixture: ScenarioFixture = {
  name: "puppets-musketeers-story-opening",
  memory: 0,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  presentation: { timed: false },
  board: {
    0: {
      hand: hand0,
      security: security0,
      breeding: { card: "ST19-01" },
      eggDeck: ["ST19-01", "ST19-01", "ST19-01"],
      battleArea: [],
      deck: buildStoryDrawPile({
        counts: [
          ["ST19-02", 4],
          ["ST19-03", 4],
          ["ST19-04", 4],
          ["ST19-05", 4],
          ["ST19-06", 4],
          ["ST19-07", 4],
          ["ST19-08", 4],
          ["ST19-09", 4],
          ["ST19-10", 4],
          ["ST19-11", 4],
          ["ST19-12", 4],
          ["ST19-13", 2],
          ["ST19-14", 2],
          ["EX7-068", 2],
        ],
        placed: [...hand0, ...security0],
        opening: ["ST19-03", "ST19-14"],
      }),
    },
    1: {
      hand: hand1,
      security: security1,
      breeding: { card: "EX7-005" },
      eggDeck: ["EX7-005", "EX7-005", "EX7-005"],
      battleArea: [],
      deck: buildStoryDrawPile({
        counts: [
          ["BT6-060", 4],
          ["EX7-040", 4],
          ["EX7-044", 4],
          ["EX7-048", 4],
          ["EX7-043", 4],
          ["EX7-010", 4],
          ["EX7-059", 4],
          ["EX7-070", 4],
          ["EX7-071", 4],
          ["EX7-073", 4],
          ["EX7-011", 4],
          ["EX7-013", 4],
          ["BT18-093", 2],
        ],
        placed: [...hand1, ...security1],
        opening: ["EX7-010"],
      }),
    },
  },
};

export default fixture;
