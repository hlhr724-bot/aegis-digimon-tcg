import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "scramble-astamon-psychemon-route",
  isFirstPlayersFirstTurn: false,
  memory: 5,
  turnSeat: 0,
  turnCount: 1,
  board: {
    0: {
      battleArea: [{ card: "BT12-075", as: "psychemon" }],
      hand: [
        { card: "LM-032", as: "scramble" },
        { card: "BT12-081", as: "astamon" },
        { card: "BT12-077", as: "arresterdramon" },
      ],
      deck: [
        { card: "BT1-085", as: "draw" },
        { card: "BT1-085", as: "spare" },
      ],
    },
    1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
  },
};

export default fixture;
