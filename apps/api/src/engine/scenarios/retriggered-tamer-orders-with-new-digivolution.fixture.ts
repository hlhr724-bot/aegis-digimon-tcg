import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "AD1-022", as: "izzyAndTai" },
        { card: "ST20-02", as: "biyomon" },
      ],
      hand: [
        { card: "AD1-019", as: "mattAndTk" },
        { card: "ST20-03", as: "birdramon" },
        { card: "ST20-06", as: "angewomon" },
        { card: "ST20-10", as: "agumon" },
        { card: "ST21-08", as: "togemon" },
      ],
      deck: Array<string>(10).fill("BT1-010"),
      eggDeck: ["BT1-001"],
      security: 4,
    },
    1: { deck: Array<string>(8).fill("BT1-010"), eggDeck: ["BT1-001"], security: 4 },
  },
};

export default fixture;
