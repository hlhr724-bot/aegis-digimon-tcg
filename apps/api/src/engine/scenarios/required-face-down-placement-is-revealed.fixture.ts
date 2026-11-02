import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "required-face-down-placement-is-revealed",
  board: {
    0: {
      battleArea: [{ card: "BT26-094", as: "tamer", under: [{ card: "BT1-001", as: "prior", faceUp: false }] }],
      hand: [
        { card: "BT26-044", as: "payment" },
        { card: "BT1-009", as: "unrelated" },
      ],
      deck: [{ card: "BT1-010", as: "turnDraw" }, { card: "BT1-011", as: "effectDraw" }, "BT1-012"],
      security: 3,
    },
    1: { deck: ["BT1-013", "BT1-014"], security: 3 },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
