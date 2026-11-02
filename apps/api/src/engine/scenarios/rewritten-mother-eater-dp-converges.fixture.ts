import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "rewritten-mother-eater-dp-converges",
  memory: 7,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX13-035", as: "kingEtemon" },
        { card: "BT14-034", as: "sukamon" },
        { card: "BT11-040", as: "otherSukamon" },
      ],
      hand: [
        { card: "EX13-031", as: "kingSukamon" },
        { card: "BT3-061", as: "rewriteCost" },
        { card: "BT1-009", as: "followUp" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: Array<string>(5).fill("BT1-009"),
    },
    1: {
      breeding: { card: "BT22-007", as: "motherSource" },
      battleArea: [{ card: "BT22-007", as: "motherTarget" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: Array<string>(5).fill("BT1-009"),
    },
  },
};

export default fixture;
