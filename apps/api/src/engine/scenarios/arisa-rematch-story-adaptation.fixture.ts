import type { ScenarioFixture } from "#api/engine/scenario/types";
import { buildStoryDrawPile } from "#api/story/buildStoryDrawPile";

const violetHand = ["BT20-079", "BT23-069", "EX4-074", "BT20-062", "BT4-111", "BT23-065", "BT23-071", "BT8-084"];
const violetBattleArea = ["P-040", "BT23-087", "BT23-087", "BT20-088", "BT23-098"];
const violetBreedingStack = ["BT21-065", "BT20-068", "BT20-073"];
const violetTrash = [
  "BT20-072",
  "BT20-067",
  "BT20-067",
  "BT20-063",
  "BT20-062",
  "BT23-064",
  "BT20-068",
  "ST6-15",
  "ST6-15",
  "P-108",
  "BT20-098",
  "P-040",
  "BT20-088",
  "BT23-061",
  "BT20-078",
];
const arisaHand = ["ST19-04", "ST19-06", "ST19-13", "ST19-11"];
const arisaSecurity = ["EX9-033", "ST19-12"];
const arisaNyabootmonStack = ["ST19-03", "ST19-07", "ST19-11", "ST19-12", "BT22-042"];
const arisaKaguyamonStack = ["EX9-032", "EX9-033"];
const arisaFieldCards = ["ST19-03", "ST19-03", "ST19-09", "BT22-088", "ST19-14"];
const familiarToken = "TOKEN-Familiar-Token";
const fixture: ScenarioFixture = {
  name: "arisa-rematch-story-adaptation",
  memory: 6,
  turnSeat: 0,
  turnCount: 13,
  isFirstPlayersFirstTurn: false,
  presentation: {
    timed: false,
  },
  board: {
    "0": {
      hand: violetHand,
      security: [],
      trash: violetTrash,
      deck: buildStoryDrawPile({
        counts: [
          ["BT20-079", 3],
          ["BT23-069", 2],
          ["EX4-074", 1],
          ["BT20-062", 4],
          ["BT4-111", 1],
          ["BT23-065", 3],
          ["BT23-071", 2],
          ["BT8-084", 2],
          ["BT20-073", 2],
          ["BT21-065", 3],
          ["BT20-068", 3],
          ["BT20-072", 2],
          ["BT20-067", 2],
          ["BT20-063", 2],
          ["BT23-064", 2],
          ["ST6-15", 2],
          ["P-108", 1],
          ["BT20-098", 1],
          ["P-040", 3],
          ["BT20-088", 3],
          ["BT23-087", 2],
          ["BT23-098", 2],
          ["BT23-061", 1],
          ["BT20-078", 1],
        ],
        placed: [...violetHand, ...violetBattleArea, ...violetBreedingStack, ...violetTrash],
      }),
      eggDeck: ["BT20-006", "BT20-006", "BT20-006"],
      battleArea: violetBattleArea,
      breeding: {
        card: "BT20-073",
        under: ["BT20-006", "BT21-065", "BT20-068"],
      },
    },
    "1": {
      hand: arisaHand,
      security: arisaSecurity,
      deck: buildStoryDrawPile({
        counts: [
          ["ST19-02", 4],
          ["ST19-03", 4],
          ["ST19-04", 4],
          ["ST19-06", 3],
          ["ST19-07", 3],
          ["ST19-08", 4],
          ["ST19-09", 4],
          ["ST19-10", 3],
          ["ST19-11", 3],
          ["ST19-12", 3],
          ["ST19-13", 3],
          ["ST19-14", 2],
          ["BT22-042", 2],
          ["BT22-088", 2],
          ["EX9-032", 3],
          ["EX9-033", 3],
        ],
        placed: [...arisaHand, ...arisaSecurity, ...arisaNyabootmonStack, ...arisaKaguyamonStack, ...arisaFieldCards],
      }),
      eggDeck: ["ST19-01", "ST19-01", "ST19-01"],
      battleArea: [
        "ST19-03",
        "ST19-03",
        "ST19-09",
        { card: "BT22-042", under: ["ST19-01", "ST19-03", "ST19-07", "ST19-11", "ST19-12"] },
        { card: "EX9-033", under: ["EX9-032"] },
        { card: familiarToken, dp: 3000 },
        { card: familiarToken, dp: 3000 },
        "BT22-088",
        "ST19-14",
      ],
    },
  },
};

export default fixture;
