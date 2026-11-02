import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "locked-attack-target-skips-redirection",
  memory: 5,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT13-029", as: "lockedAttacker", dp: 13000 },
        { card: "BT1-020", as: "unlockedAttacker", dp: 7000 },
      ],
      eggDeck: ["BT1-001"],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT1-080", as: "redirector", dp: 16000, suspended: true, under: ["BT25-039"] }],
      hand: Array<string>(8).fill("BT1-009"),
      eggDeck: ["BT1-001"],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  presentation: {
    opponent: {
      fallbackMain: "end",
      decisions: [
        { sourceCard: "BT25-039", kind: "optional", accept: true },
        { sourceCard: "BT25-039", kind: "chooseTargets", target: "redirector" },
      ],
    },
  },
};

export default fixture;
