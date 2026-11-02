import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "decode-preserves-deletion-trigger",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-009", as: "red" },
        { card: "EX13-036", as: "securityPlacer" },
      ],
      hand: [{ card: "ST1-16", as: "deletion" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        {
          card: "P-240",
          as: "arcturusmon",
          under: [
            { card: "EX12-014", as: "canoweissmon" },
            { card: "RB1-006", as: "decoded" },
          ],
        },
      ],
      hand: [{ card: "EX12-077", as: "proximamon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
};

export default fixture;
