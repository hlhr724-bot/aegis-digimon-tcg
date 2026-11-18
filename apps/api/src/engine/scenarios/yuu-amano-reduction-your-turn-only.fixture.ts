import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "yuu-amano-reduction-your-turn-only",
  board: {
    0: {
      battleArea: [
        { card: "BT10-093", as: "yuu", under: [{ card: "BT10-073", as: "purpleUnderYuu" }] },
        {
          card: "EX10-031",
          as: "darkKnightmon",
          suspended: true,
          under: [{ card: "BT14-059", as: "damemon" }],
        },
      ],
      hand: ["BT1-009"],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-025", as: "attacker", dp: 15000 }],
      hand: ["BT1-009"],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { opponent: { endBreeding: true, main: [{ kind: "attack" }], fallbackMain: "end" } },
};

export default fixture;
