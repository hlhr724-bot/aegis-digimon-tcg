import type { ScenarioFixture } from "#api/engine/scenario/types";

import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";

const shotoHand = ["ST18-05", "ST18-05", "ST18-04", "ST18-10", "ST18-06"];
const shotoSecurity = ["ST18-07", "ST18-05", "ST18-07", "ST18-14"];
const shotoTrash: string[] = [];
const npcHand = ["EX7-020", "EX7-021", "EX7-023", "EX7-019"];
const npcSecurity = ["EX7-020", "EX7-019", "EX7-023"];
const npcField = ["EX7-020", "EX7-017", "EX7-016"];
const fixture: ScenarioFixture = {
  name: "ice-clad-story-opening",
  memory: 3,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  presentation: { timed: false },
  board: {
    0: {
      hand: shotoHand.map((card, index) => ({ card, as: `shoto-hand-${index}` })),
      security: shotoSecurity,
      trash: shotoTrash,
      breeding: { card: "ST18-01", as: "shoto-fluffymon" },
      eggDeck: ["ST18-01", "ST18-01", "ST18-01"],
      battleArea: [],
      deck: buildStoryDrawPile({
        counts: [
          ["ST18-02", 2],
          ["ST18-03", 4],
          ["ST18-04", 4],
          ["ST18-05", 4],
          ["ST18-06", 4],
          ["ST18-07", 4],
          ["ST18-08", 4],
          ["ST18-09", 4],
          ["ST18-10", 4],
          ["ST18-11", 4],
          ["ST18-12", 4],
          ["ST18-13", 2],
          ["ST18-14", 4],
          ["ST18-15", 2],
        ],
        placed: [...shotoHand, ...shotoSecurity, ...shotoTrash],
        opening: ["ST18-04", "ST18-14", "ST18-12", "ST18-08"],
      }),
    },
    1: {
      hand: npcHand,
      security: npcSecurity,
      breeding: { card: "EX7-016", as: "npc-bulucomon", under: ["EX7-002"] },
      eggDeck: ["EX7-002", "EX7-002", "EX7-002"],
      battleArea: [
        { card: "EX7-020", as: "npc-paledramon" },
        { card: "EX7-017", as: "npc-snowagumon" },
      ],
      deck: buildStoryDrawPile({
        counts: [
          ["EX7-016", 4],
          ["EX7-017", 4],
          ["EX7-019", 4],
          ["EX7-020", 4],
          ["EX7-021", 4],
          ["EX7-023", 4],
          ["EX7-067", 4],
          ["BT5-022", 4],
          ["BT5-025", 4],
          ["BT5-028", 4],
          ["BT5-032", 2],
          ["BT8-022", 4],
          ["EX3-016", 4],
        ],
        placed: [...npcHand, ...npcSecurity, ...npcField],
        opening: ["EX7-020", "EX7-021", "EX7-023"],
      }),
    },
  },
};

export default fixture;
