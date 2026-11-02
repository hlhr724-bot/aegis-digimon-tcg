import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "played-link-loses-dp-bonus",
  memory: 5,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX11-045", as: "host", dp: 12000, currentDP: 14000, linked: [{ card: "EX11-027", as: "link" }] },
      ],
    },
  },
};

export default fixture;
