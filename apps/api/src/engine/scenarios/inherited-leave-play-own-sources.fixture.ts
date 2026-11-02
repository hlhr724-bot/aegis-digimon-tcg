import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "inherited-leave-play-own-sources",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009"],
      battleArea: [
        { card: "AD1-008", as: "leaving", suspended: true, under: ["AD1-003"] },
        { card: "BT1-010", as: "other", under: ["BT12-089", "BT12-007"] },
      ],
    },
    1: { deck: ["BT1-009", "BT1-009"], battleArea: [{ card: "BT1-010", as: "attacker", dp: 15000 }] },
  },
  turnSeat: 1,
  turnCount: 2,
  memory: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
