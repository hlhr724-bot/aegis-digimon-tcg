import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "black-egg-flame-stack",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      breeding: { card: "BT22-005", as: "base" },
      hand: [
        { card: "BT27-007", as: "rookie" },
        { card: "BT27-010", as: "champion" },
        { card: "BT27-012", as: "ultimate" },
        { card: "BT22-078", as: "mega" },
      ],
      deck: Array.from({ length: 12 }, () => "BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-019", as: "target", dp: 6000 },
        { card: "BT1-020", as: "larger", dp: 12000 },
      ],
      deck: Array.from({ length: 12 }, () => "BT1-010"),
      security: [{ card: "BT1-009", as: "securityTop" }, "BT1-010"],
    },
  },
};

export default fixture;
