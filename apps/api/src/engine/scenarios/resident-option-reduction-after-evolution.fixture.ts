import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "resident-option-reduction-after-evolution",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT25-049", as: "reducer" },
        { card: "BT1-089", as: "tamer", under: [{ card: "BT1-009", as: "fuel", faceUp: false }] },
      ],
      hand: [
        { card: "ST23-15", as: "firstOption" },
        { card: "ST23-15", as: "secondOption" },
        { card: "BT25-057", as: "evolution" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: { deck: Array<string>(8).fill("BT1-009"), security: ["BT1-009", "BT1-009", "BT1-009"] },
  },
};

export default fixture;
