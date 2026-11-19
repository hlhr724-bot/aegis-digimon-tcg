import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "pending-effect-names-triggering-digimon",
  board: {
    0: {
      battleArea: [
        { card: "BT26-099", as: "first-manual" },
        { card: "BT26-099", as: "second-manual" },
        { card: "EX9-064", as: "host" },
      ],
      hand: [
        { card: "EX9-035", as: "placer" },
        { card: "BT26-077", as: "evolution" },
      ],
      deck: ["BT1-009", "BT26-077", "EX9-035", ...Array<string>(10).fill("BT1-009")],
      security: 3,
    },
    1: { deck: Array<string>(12).fill("BT1-009"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
