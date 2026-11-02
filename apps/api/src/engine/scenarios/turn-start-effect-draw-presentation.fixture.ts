import type { ScenarioFixture } from "../scenario/types.js";

const inertDeck = Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? "BT1-009" : "BT1-013"));

/**
 * EX2-059 Shu-Chong Wong draws at the start of each of its controller's turns while they
 * have 3 or fewer security cards; the Draw phase then adds the ordinary turn draw.
 */
const fixture: ScenarioFixture = {
  name: "turn-start-effect-draw-presentation",
  board: {
    "0": {
      battleArea: [{ card: "EX2-059", as: "shuChong" }],
      deck: inertDeck,
      security: ["BT1-009", "BT1-013", "BT1-009"],
    },
    "1": { deck: inertDeck, security: ["BT1-009", "BT1-013", "BT1-009", "BT1-013", "BT1-009"] },
  },
  memory: 0,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  presentation: { opponent: { main: [], fallbackMain: "end" } },
};

export default fixture;
