import fixture from "#api/engine/scenarios/dantemon-seven-link-resolution-plan.fixture";
import type { ScenarioFixture } from "#api/engine/scenario/types";

const largePlan: ScenarioFixture = {
  ...fixture,
  name: "large-seven-code-link-plan",
  board: {
    ...fixture.board,
    0: {
      ...fixture.board[0],
      trash: ["BT26-010", "BT26-019", "BT26-028", "BT26-037", "BT26-051", "BT26-063", "BT26-084"].map(
        (card, index) => ({ card, as: `seven-code-assembly-material-${index + 1}-when-linking-effect-source` }),
      ),
    },
  },
};

export default largePlan;
