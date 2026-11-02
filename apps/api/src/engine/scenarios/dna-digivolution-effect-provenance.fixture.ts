import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dna-digivolution-effect-provenance",
  memory: 5,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT25-077", as: "bacchusmon" },
        { card: "BT1-037", as: "blue", under: ["ST9-08"] },
        { card: "BT1-073", as: "green" },
      ],
      hand: [{ card: "ST9-05", as: "paildramon" }],
      deck: Array.from({ length: 10 }, () => "BT1-010"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "BT1-019", as: "lowest", dp: 7000 },
        { card: "BT1-019", as: "higher", dp: 9000 },
      ],
      deck: Array.from({ length: 10 }, () => "BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
