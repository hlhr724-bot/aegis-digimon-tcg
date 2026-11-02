import type { ScenarioFixture } from "#api/engine/scenario/types";

const filler = (count: number) => Array.from({ length: count }, () => "BT1-009");

const fixture: ScenarioFixture = {
  name: "evade-suspends-opponent-effect-immune-digimon",
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-080", as: "greenMaterial" },
        { card: "ST2-10", as: "blueMaterial" },
      ],
      hand: [{ card: "EX13-045", as: "examon" }],
      deck: filler(16),
      security: filler(5),
    },
    1: {
      battleArea: [{ card: "EX3-020", as: "wingdramon" }],
      deck: filler(16),
      security: filler(5),
    },
  },
};

export default fixture;
