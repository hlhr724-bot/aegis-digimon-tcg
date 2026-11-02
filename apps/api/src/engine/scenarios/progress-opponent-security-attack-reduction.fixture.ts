import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "progress-opponent-security-attack-reduction",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX11-012", as: "attacker" }],
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: 3,
    },
    1: {
      deck: Array.from({ length: 16 }, () => "BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
