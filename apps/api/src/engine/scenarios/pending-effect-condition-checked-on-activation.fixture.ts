import type { ScenarioFixture } from "#api/engine/scenario/types";

export const createPendingEffectConditionFixture = ({
  opponentHandSize,
}: {
  opponentHandSize: number;
}): ScenarioFixture => ({
  name: "pending-effect-condition-checked-on-activation",
  board: {
    0: {
      battleArea: [{ card: "BT27-083", as: "ravemon", dp: 1000, under: [{ card: "BT26-072", as: "peckmon" }] }],
      trash: [{ card: "BT27-074", as: "falcomon" }],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-025", as: "defender", suspended: true }],
      hand: Array(opponentHandSize).fill("BT1-009"),
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
});

export default createPendingEffectConditionFixture({ opponentHandSize: 8 });
