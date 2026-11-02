import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "scramble-prevents-empty-deck-loss",
  isFirstPlayersFirstTurn: false,
  memory: 5,
  turnSeat: 0,
  turnCount: 1,
  board: {
    0: {
      battleArea: [{ card: "LM-027", as: "scramble", placedByEffect: true }],
      deck: [],
      trash: [{ card: "BT1-011", as: "returned" }],
    },
    1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
  },
};

export default fixture;
