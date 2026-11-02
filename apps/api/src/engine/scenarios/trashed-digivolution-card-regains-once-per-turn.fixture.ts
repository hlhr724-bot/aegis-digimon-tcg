import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT25-083", as: "firstLadyDevimon" },
        { card: "BT25-083", as: "secondLadyDevimon" },
        { card: "BT25-092", as: "asuna" },
      ],
      hand: [
        { card: "BT25-085", as: "beelStarmon" },
        { card: "EX7-073", as: "xAntibodyBeelStarmon" },
        { card: "EX7-070", as: "firstDerBlitz" },
        { card: "EX7-070", as: "secondDerBlitz" },
        { card: "EX7-071", as: "asunaCost" },
      ],
      security: ["ST1-03", "ST1-03", "ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
      eggDeck: ["BT1-001"],
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "firstTarget" },
        { card: "BT1-009", as: "secondTarget" },
        { card: "BT1-009", as: "thirdTarget" },
      ],
      security: ["ST1-03", "ST1-03", "ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
    },
  },
};

export default fixture;
