import type { ScenarioFixture } from "#api/engine/scenario/types";
import base from "#api/engine/scenarios/ouryumon-option-deletes-before-dna.fixture";

const fixture: ScenarioFixture = {
  ...base,
  name: "accepted-ouryumon-option-deletes-before-dna",
  board: {
    ...base.board,
    0: {
      ...base.board[0],
      battleArea: [...base.board[0]!.battleArea!, { card: "BT14-082", as: "other-watcher" }],
    },
  },
};

export default fixture;
