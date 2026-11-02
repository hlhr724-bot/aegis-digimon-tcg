import type { ScenarioFixture } from "#api/engine/scenario/types";

const filler = (count: number) => Array.from({ length: count }, () => "BT1-009");

const fixture: ScenarioFixture = {
  name: "hand-trash-watcher-retriggers-in-derived-window",
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "BT24-045",
          as: "ogremon",
          under: [
            { card: "BT6-006", as: "tsunomon" },
            { card: "BT24-042", as: "goblimon" },
          ],
        },
      ],
      hand: [
        { card: "BT1-009", as: "attackDiscard" },
        { card: "BT1-009", as: "digivolveDiscard" },
      ],
      trash: [
        { card: "BT24-072", as: "skullGreymon" },
        { card: "BT25-084", as: "titamon" },
      ],
      deck: filler(16),
      security: filler(5),
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "opponentDigimon" }],
      deck: filler(16),
      security: filler(5),
    },
  },
};

export default fixture;
