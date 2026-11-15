import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "borrowed-clause-activates-lender-option-main",
  memory: 6,
  turnSeat: 0,
  turnCount: 5,
  isFirstPlayersFirstTurn: false,
  presentation: { holdBotAfterTurn: 7, opponent: { endBreeding: true, fallbackMain: "end" } },
  board: {
    0: {
      battleArea: [
        { card: "EX13-014", as: "jesmon" },
        { card: "BT1-009", as: "monodramon" },
      ],
      hand: [
        { card: "BT10-112", as: "jesmonGx" },
        { card: "BT27-016", as: "jesmonXAntibody" },
      ],
      security: 5,
      deck: Array(16).fill("BT1-009"),
    },
    1: {
      battleArea: [
        { card: "BT1-060", as: "magnaAngemon" },
        { card: "BT1-080", as: "titamon" },
      ],
      security: [{ card: "BT1-009", as: "topSecurity" }, "BT1-009", "BT1-009"],
      deck: Array(16).fill("BT1-009"),
    },
  },
};

export default fixture;
