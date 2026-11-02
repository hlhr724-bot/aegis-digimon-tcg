import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "used-inherited-once-per-turn-marks-its-source",
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "BT1-024",
          as: "attacker",
          under: [
            { card: "EX12-064", as: "lowerMegadramon" },
            { card: "EX12-064", as: "upperMegadramon" },
          ],
        },
        { card: "ST1-02", as: "fodder" },
      ],
      deck: Array.from({ length: 8 }, () => "ST1-03"),
      security: 3,
    },
    1: {
      deck: Array.from({ length: 8 }, () => "ST1-03"),
      security: ["ST1-03", "ST1-03", "ST1-03"],
    },
  },
};

export default fixture;
