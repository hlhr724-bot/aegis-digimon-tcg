import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 5,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "BT11-019",
          as: "shoutmon",
          dp: 5000,
          under: [
            { card: "BT19-061", as: "sparrowmonAlias" },
            { card: "BT10-029", as: "starmons" },
            { card: "BT19-038", as: "dorulumonAlias" },
            { card: "BT19-047", as: "ballistamon" },
            { card: "AD1-013", as: "zeiggreymon" },
            { card: "BT11-015", as: "omnishoutmon" },
          ],
        },
        { card: "BT10-087", as: "tamer" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: [{ card: "BT26-083", as: "securityDigimon" }, "BT1-009"],
    },
  },
};

export default fixture;
