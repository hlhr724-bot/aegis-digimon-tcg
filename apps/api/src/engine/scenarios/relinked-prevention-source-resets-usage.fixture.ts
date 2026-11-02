import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "relinked-prevention-source-resets-usage",
  memory: 10,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "EX10-073",
          as: "deusmon",
          linked: [
            { card: "EX10-030", as: "cometmon" },
            { card: "EX10-019", as: "warudamon" },
          ],
        },
        { card: "EX10-070", as: "godGrade" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "EX3-063", as: "dragonMode" },
        { card: "BT1-010", as: "deletionTarget" },
      ],
      hand: [{ card: "AD1-024", as: "fighterMode" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
  },
};

export default fixture;
