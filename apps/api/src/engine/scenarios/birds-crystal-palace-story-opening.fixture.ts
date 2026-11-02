import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";

const hand0 = ["ST18-05", "ST18-05", "ST18-07", "ST18-11", "ST18-04"];
const security0 = ["ST18-13", "ST18-11", "ST18-08", "ST18-14", "ST18-07"];
const hand1 = ["BT19-017", "BT19-019", "BT19-024", "BT19-018", "BT19-082"];
const security1 = ["BT19-021", "BT19-023", "BT19-019", "BT19-018", "BT19-024"];
const fixture: ScenarioFixture = {
  name: "birds-crystal-palace-story-opening",
  memory: 0,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  presentation: { timed: false },
  board: {
    0: {
      hand: hand0,
      security: security0,
      breeding: { card: "ST18-01" },
      eggDeck: ["ST18-01", "ST18-01", "ST18-01"],
      battleArea: [],
      deck: buildStoryDrawPile({
        counts: [
          ["ST18-05", 4],
          ["ST18-07", 4],
          ["ST18-11", 4],
          ["ST18-04", 4],
          ["ST18-13", 4],
          ["ST18-08", 4],
          ["ST18-14", 4],
          ["ST18-10", 4],
          ["ST18-06", 4],
          ["ST18-03", 4],
          ["EX7-031", 4],
          ["EX8-074", 4],
          ["EX7-074", 2],
        ],
        placed: [...hand0, ...security0],
        opening: ["ST18-13", "ST18-05", "ST18-14", "ST18-06"],
      }),
    },
    1: {
      hand: hand1,
      security: security1,
      breeding: { card: "BT19-002" },
      eggDeck: ["BT19-002", "BT19-002", "BT19-002"],
      battleArea: [],
      deck: buildStoryDrawPile({
        counts: [
          ["BT19-017", 4],
          ["BT19-018", 4],
          ["BT19-019", 4],
          ["BT19-021", 4],
          ["BT19-023", 4],
          ["BT19-024", 4],
          ["BT19-027", 4],
          ["BT19-082", 4],
          ["BT19-092", 4],
          ["EX6-013", 4],
          ["EX6-014", 4],
          ["BT12-020", 4],
          ["BT9-025", 2],
        ],
        placed: [...hand1, ...security1],
        opening: ["BT19-021"],
      }),
    },
  },
};

export default fixture;
