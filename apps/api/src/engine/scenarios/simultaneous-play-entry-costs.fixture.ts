import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "simultaneous-play-entry-costs",
  board: {
    0: {
      battleArea: [{ card: "P-220", as: "millenniummon" }],
      trash: [
        { card: "P-220", as: "returnOne" },
        { card: "P-220", as: "returnTwo" },
        { card: "P-220", as: "returnThree" },
        { card: "BT2-077", as: "kimeramon" },
        { card: "BT18-073", as: "machinedramon" },
      ],
      deck: ["BT1-009"],
    },
    1: {
      breeding: { card: "BT1-009", as: "redSource" },
      hand: [{ card: "ST1-16", as: "gaiaForce" }],
      deck: ["BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
