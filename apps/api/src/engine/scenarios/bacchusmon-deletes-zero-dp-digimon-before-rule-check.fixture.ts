import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "bacchusmon-deletes-zero-dp-digimon-before-rule-check",
  board: {
    0: {
      battleArea: [
        { card: "BT25-077", as: "bacchusmon" },
        { card: "BT16-101", as: "rapidmon", under: ["BT19-050"] },
      ],
      deck: Array(5).fill("BT1-009"),
      security: 5,
    },
    1: {
      hand: [
        { card: "BT5-098", as: "meteor-shower" },
        { card: "BT5-039", as: "shooting-starmon" },
      ],
      battleArea: [{ card: "ST3-10", as: "magnadramon" }],
      deck: Array(5).fill("BT1-009"),
      security: 5,
    },
  },
  memory: 5,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
