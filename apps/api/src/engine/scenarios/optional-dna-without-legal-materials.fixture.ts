import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "optional-dna-without-legal-materials",
  board: {
    0: {
      battleArea: [
        { card: "BT25-028", as: "dianamon" },
        { card: "BT1-009", as: "rookie" },
      ],
      hand: [
        { card: "BT25-103", as: "gracenovamon" },
        { card: "BT1-009", as: "playedRookie" },
      ],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: { deck: ["BT1-009", "BT1-009", "BT1-009"] },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
